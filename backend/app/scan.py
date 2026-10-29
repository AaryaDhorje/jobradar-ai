"""Runs all enabled scrapers, then cleans, de-duplicates and stores the results."""

import asyncio
import logging
import time
from datetime import timedelta
from typing import Optional

import httpx
from sqlmodel import Session, select

from .config import get_settings
from .db import engine, get_setting
from .models import Company, Job, ScanRun, utcnow
from .pipeline import classify_location, fingerprint, norm_company, relevance, score
from .scrapers import RawJob, Scraper, all_scrapers
from .scrapers.base import BROWSER_HEADERS

log = logging.getLogger(__name__)
_scan_lock = asyncio.Lock()


def scan_running() -> bool:
    return _scan_lock.locked()


def source_enabled(scraper: Scraper, overrides: dict[str, bool]) -> bool:
    if scraper.name in overrides:
        return bool(overrides[scraper.name])
    return scraper.kind != "unofficial" or get_settings().enable_unofficial_sources


def enabled_scrapers(session: Session) -> list[Scraper]:
    overrides = get_setting(session, "sources", {}) or {}
    return [s for s in all_scrapers(get_settings()) if source_enabled(s, overrides)]


async def _run_scraper(scraper: Scraper, client: httpx.AsyncClient) -> tuple[list[RawJob], dict]:
    if not scraper.configured:
        return [], {"status": "skipped", "count": 0, "error": f"Missing keys: {', '.join(scraper.missing_keys())}",
                    "duration_s": 0}
    start = time.monotonic()
    try:
        jobs = await asyncio.wait_for(scraper.fetch(client), timeout=get_settings().scraper_timeout_s)
        info = {"status": "ok", "count": len(jobs), "error": None}
    except Exception as e:  # one broken source must never stop the scan
        log.exception("scraper %s failed", scraper.name)
        jobs = []
        msg = str(e) or e.__class__.__name__
        if isinstance(e, asyncio.TimeoutError):
            msg = "Timed out"
        info = {"status": "error", "count": 0, "error": msg[:300]}
    info["duration_s"] = round(time.monotonic() - start, 1)
    return jobs, info


def ingest(session: Session, raw_jobs: list[RawJob], run_id: Optional[int]) -> tuple[int, int]:
    """Store raw jobs. Returns (in_scope_count, new_count)."""
    settings = get_settings()
    now = utcnow()
    oldest = now - timedelta(days=settings.max_job_age_days)
    companies: dict[str, Company] = {c.norm_name: c for c in session.exec(select(Company)).all()}
    jobs_by_fp: dict[str, Job] = {}
    in_scope = new = 0

    for raw in raw_jobs:
        if not raw.title or not raw.url:
            continue
        tag, city = classify_location(raw.location, raw.remote, raw.india_hint)
        if tag is None:
            continue
        rel = relevance(raw.title, raw.description, raw.tags)
        if not rel:
            continue
        if raw.posted_at and raw.posted_at < oldest:
            continue
        in_scope += 1

        norm = norm_company(raw.company)
        company = companies.get(norm)
        if company is None:
            company = Company(name=raw.company.strip() or "Unknown", norm_name=norm)
            session.add(company)
            session.flush()
            companies[norm] = company
        if not company.domain and raw.company_domain:
            company.domain = raw.company_domain.lower()
            company.website = company.website or f"https://{company.domain}"
        if not company.logo_url and raw.company_logo:
            company.logo_url = raw.company_logo

        fp = fingerprint(raw.company, raw.title, city or tag)
        job = jobs_by_fp.get(fp) or session.exec(select(Job).where(Job.fingerprint == fp)).first()
        source_entry = {"source": raw.source, "url": raw.url}
        if job is None:
            job = Job(
                fingerprint=fp, title=raw.title.strip(), company_id=company.id, location=raw.location.strip(),
                location_tag=tag, remote=raw.remote or tag == "remote", url=raw.url, sources=[source_entry],
                description=raw.description, tags=[t for t in raw.tags if t][:30], posted_at=raw.posted_at,
                first_seen_run_id=run_id, salary=raw.salary, experience=raw.experience,
                employment_type=raw.employment_type, relevance=rel,
            )
            new += 1
        else:
            job.last_seen_at = now
            if not any(s["source"] == raw.source for s in job.sources):
                job.sources = [*job.sources, source_entry]  # reassign so the JSON column is marked dirty
            if len(raw.description) > len(job.description or ""):
                job.description = raw.description
                job.relevance = max(job.relevance, rel)
            if raw.posted_at and (job.posted_at is None or raw.posted_at < job.posted_at):
                job.posted_at = raw.posted_at
            job.salary = job.salary or raw.salary
            job.experience = job.experience or raw.experience
            job.employment_type = job.employment_type or raw.employment_type
            if raw.tags and not job.tags:
                job.tags = [t for t in raw.tags if t][:30]
        job.score = score(job.location_tag, job.relevance, job.posted_at, now)
        session.add(job)
        jobs_by_fp[fp] = job

    session.commit()
    return in_scope, new


def rescore_all(session: Session) -> None:
    now = utcnow()
    for job in session.exec(select(Job)).all():
        s = score(job.location_tag, job.relevance, job.posted_at, now)
        if s != job.score:
            job.score = s
            session.add(job)
    session.commit()


async def run_scan(trigger: str = "manual", run_id: Optional[int] = None) -> int:
    """Run a full scan. Returns the ScanRun id. Concurrent calls wait for the running scan."""
    async with _scan_lock:
        with Session(engine) as session:
            run = session.get(ScanRun, run_id) if run_id else None
            if run is None:
                run = ScanRun(trigger=trigger)
                session.add(run)
                session.commit()
                session.refresh(run)
            run_id = run.id
            scrapers = enabled_scrapers(session)

        log.info("scan %s started with %d sources", run_id, len(scrapers))
        settings = get_settings()
        async with httpx.AsyncClient(
            timeout=settings.http_timeout_s, follow_redirects=True, headers=BROWSER_HEADERS,
            limits=httpx.Limits(max_connections=30),
        ) as client:
            results = await asyncio.gather(*(_run_scraper(s, client) for s in scrapers))

        sources = {s.name: info for s, (_, info) in zip(scrapers, results)}
        raw_jobs = [j for jobs, _ in results for j in jobs]

        def _store() -> tuple[int, int]:
            with Session(engine) as session:
                found, new = ingest(session, raw_jobs, run_id)
                rescore_all(session)
                return found, new

        try:
            found, new = await asyncio.to_thread(_store)
            status = "done"
        except Exception:
            log.exception("scan %s failed while storing", run_id)
            found = new = 0
            status = "failed"

        with Session(engine) as session:
            run = session.get(ScanRun, run_id)
            run.sources = sources
            run.total_found = found
            run.new_jobs = new
            run.status = status
            run.finished_at = utcnow()
            session.add(run)
            session.commit()
        log.info("scan %s %s: %d in scope, %d new", run_id, status, found, new)
        return run_id


def latest_done_run(session: Session) -> Optional[ScanRun]:
    return session.exec(
        select(ScanRun).where(ScanRun.status == "done").order_by(ScanRun.id.desc())  # type: ignore[union-attr]
    ).first()
