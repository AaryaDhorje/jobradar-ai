import asyncio
import logging
import re
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Literal, Optional

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AuthenticationError, NotFoundError, OpenAIError, RateLimitError
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_
from sqlmodel import Session, col, select

from . import scheduler
from .ai import AIUnavailable, company_insights, resume_advice
from .config import BACKEND_DIR, get_settings
from .contacts import clean_domain, find_contacts
from .db import engine, get_session, get_setting, init_db, set_setting
from .models import Company, Job, Resume, ResumeAdvice, ScanRun, utcnow
from .pipeline import snippet
from .resume import ResumeParseError, extract_text
from .scan import latest_done_run, run_scan, scan_running, source_enabled
from .scrapers import all_scrapers, get_scraper
from .scrapers.base import BROWSER_HEADERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jobradar")
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with Session(engine) as session:  # a crash mid-scan leaves "running" rows behind
        for run in session.exec(select(ScanRun).where(ScanRun.status == "running")).all():
            run.status, run.finished_at = "failed", utcnow()
            session.add(run)
        session.commit()
    if get_settings().enable_scheduler:
        scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="JobRadar AI", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------- serializers

def iso(dt) -> Optional[str]:
    return dt.isoformat() + "Z" if dt else None


def company_ref(c: Company) -> dict:
    return {"id": c.id, "name": c.name, "logo_url": c.logo_url}


def job_out(job: Job, company: Company, latest_run_id: Optional[int], detail: bool = False) -> dict:
    out = {
        "id": job.id, "title": job.title, "company": company_ref(company), "location": job.location,
        "location_tag": job.location_tag, "remote": job.remote, "url": job.url, "sources": job.sources,
        "posted_at": iso(job.posted_at), "first_seen_at": iso(job.first_seen_at),
        "is_new": latest_run_id is not None and job.first_seen_run_id == latest_run_id,
        "salary": job.salary, "experience": job.experience, "employment_type": job.employment_type,
        "score": job.score, "status": job.status, "snippet": snippet(job.description), "tags": job.tags or [],
    }
    if detail:
        out["description"] = job.description
    return out


def run_out(r: ScanRun) -> dict:
    return {"id": r.id, "started_at": iso(r.started_at), "finished_at": iso(r.finished_at), "status": r.status,
            "trigger": r.trigger, "total_found": r.total_found, "new_jobs": r.new_jobs, "sources": r.sources or {}}


def _latest_run_id(session: Session) -> Optional[int]:
    run = latest_done_run(session)
    return run.id if run else None


def _get_job(session: Session, job_id: int) -> Job:
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


def _ai_error(e: Exception) -> HTTPException:
    if isinstance(e, AIUnavailable):
        return HTTPException(400, str(e))
    if isinstance(e, NotFoundError):
        return HTTPException(400, f"The AI model '{get_settings().ai_config()['model']}' is not available for your key "
                                  "(it may have been retired). Set AI_MODEL in backend/.env to a current model.")
    if isinstance(e, AuthenticationError):
        return HTTPException(400, f"{get_settings().ai_config()['label']} rejected the API key. "
                                  "Check AI_API_KEY in backend/.env.")
    if isinstance(e, RateLimitError):
        if "credit" in str(e).lower() or "quota" in str(e).lower():
            return HTTPException(402, f"Your {get_settings().ai_config()['label']} account has no credits or free "
                                      "quota left. Add credits, or switch to a free provider (AI_API_KEY in backend/.env).")
        return HTTPException(429, "The AI provider's rate limit was reached (common on free tiers). "
                                  "Wait a minute and try again.")
    log.exception("AI call failed")
    return HTTPException(502, f"AI service error: {getattr(e, 'message', None) or str(e)[:300]}")


# ---------------------------------------------------------------- jobs

@app.get("/api/jobs")
def list_jobs(
    q: Optional[str] = None,
    tag: Optional[Literal["pune", "india", "remote"]] = None,
    source: Optional[str] = None,
    company_id: Optional[int] = None,
    new_only: bool = False,
    status: Optional[Literal["saved", "applied", "hidden"]] = None,
    days: Optional[int] = Query(None, ge=1),
    sort: Literal["score", "date"] = "score",
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    session: Session = Depends(get_session),
):
    stmt = select(Job, Company).join(Company, Company.id == Job.company_id)
    if q:
        for word in q.split():
            like = f"%{word}%"
            stmt = stmt.where(or_(col(Job.title).ilike(like), col(Company.name).ilike(like),
                                  col(Job.location).ilike(like), col(Job.description).ilike(like)))
    if tag:
        stmt = stmt.where(Job.location_tag == tag)
    if source:
        # sources is a JSON list; a LIKE on its text keeps this portable across SQLite/Postgres
        stmt = stmt.where(cast(Job.sources, String).ilike(f'%"{source}%'))
    if company_id:
        stmt = stmt.where(Job.company_id == company_id)
    latest = _latest_run_id(session)
    if new_only:
        stmt = stmt.where(Job.first_seen_run_id == (latest or -1))
    if status:
        stmt = stmt.where(Job.status == status)
    else:
        stmt = stmt.where(or_(Job.status == None, Job.status != "hidden"))  # noqa: E711
    if days:
        since = utcnow() - timedelta(days=days)
        stmt = stmt.where(func.coalesce(Job.posted_at, Job.first_seen_at) >= since)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    order = (
        [col(Job.score).desc(), col(Job.posted_at).desc()]
        if sort == "score"
        else [func.coalesce(Job.posted_at, Job.first_seen_at).desc()]
    )
    rows = session.exec(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [job_out(j, c, latest) for j, c in rows], "total": total, "page": page, "page_size": page_size}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: int, session: Session = Depends(get_session)):
    job = _get_job(session, job_id)
    # LinkedIn search cards have no description: load it on first open.
    if len(job.description or "") < 200:
        for src in job.sources:
            scraper = get_scraper(src["source"], get_settings())
            if scraper and hasattr(scraper, "fetch_description"):
                try:
                    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=BROWSER_HEADERS) as client:
                        desc = await scraper.fetch_description(client, src["url"])
                    if desc and len(desc) > len(job.description or ""):
                        job.description = desc
                        session.add(job)
                        session.commit()
                        break
                except Exception as e:
                    log.info("description fetch failed: %s", e)
    return job_out(job, session.get(Company, job.company_id), _latest_run_id(session), detail=True)


class JobPatch(BaseModel):
    status: Optional[Literal["saved", "applied", "hidden"]] = None


@app.patch("/api/jobs/{job_id}")
def patch_job(job_id: int, body: JobPatch, session: Session = Depends(get_session)):
    job = _get_job(session, job_id)
    job.status = body.status
    session.add(job)
    session.commit()
    return job_out(job, session.get(Company, job.company_id), _latest_run_id(session))


@app.get("/api/jobs/{job_id}/contacts")
async def job_contacts(job_id: int, refresh: bool = False, session: Session = Depends(get_session)):
    return await find_contacts(session, _get_job(session, job_id), refresh=refresh)


@app.post("/api/jobs/{job_id}/resume-advice")
async def job_resume_advice(job_id: int, refresh: bool = False, session: Session = Depends(get_session)):
    job = _get_job(session, job_id)
    resume = session.exec(select(Resume).order_by(col(Resume.id).desc())).first()
    resume_id = resume.id if resume else None
    cached = session.exec(
        select(ResumeAdvice).where(ResumeAdvice.job_id == job_id, ResumeAdvice.resume_id == resume_id)
        .order_by(col(ResumeAdvice.id).desc())
    ).first()
    if cached and not refresh:
        return cached.advice
    try:
        advice = await resume_advice(job, session.get(Company, job.company_id), resume.text if resume else None)
    except (AIUnavailable, OpenAIError) as e:
        raise _ai_error(e)
    advice["has_resume"] = resume is not None
    advice["generated_at"] = iso(utcnow())
    session.add(ResumeAdvice(job_id=job_id, resume_id=resume_id, advice=advice))
    session.commit()
    return advice


# ---------------------------------------------------------------- companies

def company_out(session: Session, company: Company) -> dict:
    latest = _latest_run_id(session)
    jobs = session.exec(
        select(Job).where(Job.company_id == company.id).order_by(col(Job.score).desc())
    ).all()
    insights = None
    if company.summary and company.interview:
        insights = {"summary": company.summary, "interview": company.interview,
                    "updated_at": iso(company.insights_updated_at)}
    return {"id": company.id, "name": company.name, "domain": company.domain, "website": company.website,
            "logo_url": company.logo_url, "job_count": len(jobs),
            "jobs": [job_out(j, company, latest) for j in jobs], "insights": insights}


def _get_company(session: Session, company_id: int) -> Company:
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    return company


@app.get("/api/companies/{company_id}")
def get_company(company_id: int, session: Session = Depends(get_session)):
    return company_out(session, _get_company(session, company_id))


class CompanyPatch(BaseModel):
    domain: str


@app.patch("/api/companies/{company_id}")
def patch_company(company_id: int, body: CompanyPatch, session: Session = Depends(get_session)):
    company = _get_company(session, company_id)
    domain = clean_domain(body.domain)
    if not domain:
        raise HTTPException(400, "Enter a valid company domain, e.g. example.com")
    company.domain = domain
    company.website = f"https://{domain}"
    company.contacts_checked_at = None  # look up contacts again for the new domain
    session.add(company)
    session.commit()
    return company_out(session, company)


@app.post("/api/companies/{company_id}/insights")
async def get_company_insights(company_id: int, refresh: bool = False, session: Session = Depends(get_session)):
    company = _get_company(session, company_id)
    if company.summary and company.interview and not refresh:
        return {"summary": company.summary, "interview": company.interview,
                "updated_at": iso(company.insights_updated_at)}
    jobs = session.exec(select(Job).where(Job.company_id == company.id).order_by(col(Job.score).desc())).all()
    try:
        data = await company_insights(company, list(jobs))
    except (AIUnavailable, OpenAIError) as e:
        raise _ai_error(e)
    company.summary, company.interview, company.insights_updated_at = data["summary"], data["interview"], utcnow()
    session.add(company)
    session.commit()
    return {**data, "updated_at": iso(company.insights_updated_at)}


# ---------------------------------------------------------------- scans & stats

@app.get("/api/stats")
def stats(session: Session = Depends(get_session)):
    latest = _latest_run_id(session)
    by_tag = dict(session.exec(select(Job.location_tag, func.count()).group_by(Job.location_tag)).all())
    by_source: dict[str, int] = {}
    for sources in session.exec(select(Job.sources)).all():
        for name in {s["source"] for s in sources or []}:
            by_source[name] = by_source.get(name, 0) + 1
    status_counts = dict(session.exec(select(Job.status, func.count()).group_by(Job.status)).all())
    last = session.exec(select(ScanRun).order_by(col(ScanRun.id).desc())).first()
    nxt = scheduler.next_run_at()
    return {
        "total_jobs": sum(by_tag.values()),
        "new_jobs": session.exec(select(func.count()).where(Job.first_seen_run_id == (latest or -1))).one(),
        "by_tag": {t: by_tag.get(t, 0) for t in ("pune", "india", "remote")},
        "by_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "saved": status_counts.get("saved", 0),
        "applied": status_counts.get("applied", 0),
        "last_scan": run_out(last) if last else None,
        "next_scan_at": nxt.isoformat() if nxt else None,
        "scan_running": scan_running(),
    }


@app.post("/api/scan", status_code=202)
async def start_scan(session: Session = Depends(get_session)):
    if scan_running():
        raise HTTPException(409, "A scan is already running")
    run = ScanRun(trigger="manual")
    session.add(run)
    session.commit()
    session.refresh(run)
    asyncio.get_running_loop().create_task(run_scan("manual", run_id=run.id))
    return {"run_id": run.id}


@app.get("/api/scans")
def list_scans(limit: int = Query(30, le=200), session: Session = Depends(get_session)):
    return [run_out(r) for r in session.exec(select(ScanRun).order_by(col(ScanRun.id).desc()).limit(limit)).all()]


# ---------------------------------------------------------------- settings

def settings_out(session: Session) -> dict:
    s = get_settings()
    overrides = get_setting(session, "sources", {}) or {}
    return {
        "scan_time": get_setting(session, "scan_time", s.default_scan_time),
        "timezone": s.timezone,
        "openai_model": f"{s.ai_config()['label']} · {s.ai_config()['model']}",
        "keys": s.key_status(),
        "sources": [
            {"name": sc.name, "label": sc.label, "kind": sc.kind, "enabled": source_enabled(sc, overrides),
             "configured": sc.configured, "missing_keys": sc.missing_keys(), "description": sc.description}
            for sc in all_scrapers(s)
        ],
    }


class SettingsPatch(BaseModel):
    scan_time: Optional[str] = None
    sources: Optional[dict[str, bool]] = None


@app.get("/api/settings")
def get_app_settings(session: Session = Depends(get_session)):
    return settings_out(session)


@app.put("/api/settings")
def put_app_settings(body: SettingsPatch, session: Session = Depends(get_session)):
    if body.scan_time is not None:
        m = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", body.scan_time.strip())
        if not m:
            raise HTTPException(400, "scan_time must be HH:MM (24-hour)")
        value = f"{int(m.group(1)):02d}:{m.group(2)}"
        set_setting(session, "scan_time", value)
        scheduler.reschedule(value)
    if body.sources is not None:
        known = {sc.name for sc in all_scrapers(get_settings())}
        current = get_setting(session, "sources", {}) or {}
        current.update({k: bool(v) for k, v in body.sources.items() if k in known})
        set_setting(session, "sources", dict(current))
    return settings_out(session)


# ---------------------------------------------------------------- resume

def resume_out(r: Resume) -> dict:
    return {"id": r.id, "filename": r.filename, "uploaded_at": iso(r.uploaded_at), "chars": len(r.text)}


@app.get("/api/resume")
def get_resume(session: Session = Depends(get_session)):
    r = session.exec(select(Resume).order_by(col(Resume.id).desc())).first()
    return resume_out(r) if r else None


@app.post("/api/resume")
async def upload_resume(file: UploadFile = File(...), session: Session = Depends(get_session)):
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10 MB)")
    try:
        text = extract_text(file.filename or "resume", data)
    except ResumeParseError as e:
        raise HTTPException(400, str(e))
    r = Resume(filename=file.filename or "resume", text=text)
    session.add(r)
    session.commit()
    session.refresh(r)
    return resume_out(r)


@app.delete("/api/resume", status_code=204)
def delete_resume(session: Session = Depends(get_session)):
    for r in session.exec(select(Resume)).all():
        session.delete(r)
    session.commit()
    return Response(status_code=204)


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- frontend (production build)

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")

