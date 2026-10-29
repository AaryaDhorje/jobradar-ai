"""HR contact discovery.

Order of trust:
  1. emails written in the job post               -> high
  2. Hunter.io domain search (HR / recruiting)      -> verified (Hunter-verified) or medium
  3. emails published on the company website        -> medium
  4. common HR inboxes on a domain that accepts mail -> guessed (always labelled as a guess)
"""

import asyncio
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import dns.resolver
import httpx
from sqlmodel import Session, select

from .config import get_settings
from .models import Company, Contact, Job, utcnow
from .scrapers.base import BROWSER_HEADERS

log = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_JUNK = re.compile(r"noreply|no-reply|donotreply|example\.|sentry|wixpress|\.png$|\.jpg$|\.gif$|\.webp$|@2x|"
                   r"privacy@|legal@|abuse@|security@|press@|media@|investor|support@|help@|sales@|billing@", re.I)
HR_HINT = re.compile(r"^hr|[._-]hr\b|career|\bjobs?\b|talent|recruit|hiring|people|resume|human|staffing", re.I)
HR_POSITION = re.compile(r"recruit|talent|human resources|\bhr\b|people|hiring|staffing|acquisition", re.I)
PATTERN_INBOXES = ["careers", "hr", "jobs", "recruitment", "talent"]
CONFIDENCE_ORDER = {"verified": 0, "high": 1, "medium": 2, "guessed": 3}
# Free-mail and job-board domains are never the company's domain.
NOT_COMPANY_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "naukri.com", "linkedin.com",
                       "hirist.tech", "hirist.com", "iimjobs.com", "indeed.com", "rediffmail.com"}


def extract_emails(text: str) -> list[str]:
    seen: list[str] = []
    for e in EMAIL_RE.findall(text or ""):
        e = e.strip(".").lower()
        if not _JUNK.search(e) and e not in seen:
            seen.append(e)
    return seen


def clean_domain(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip().lower()
    if "//" not in v:
        v = "https://" + v
    host = urlparse(v).hostname or ""
    host = host.removeprefix("www.")
    if "." not in host or host in NOT_COMPANY_DOMAINS:
        return None
    return host


def has_mx(domain: str) -> bool:
    try:
        return bool(dns.resolver.resolve(domain, "MX", lifetime=6))
    except Exception:
        return False


async def _hunter(client: httpx.AsyncClient, params: dict) -> dict:
    key = get_settings().hunter_api_key
    r = await client.get("https://api.hunter.io/v2/domain-search", params={**params, "api_key": key, "limit": 10})
    if r.status_code == 429:
        raise RuntimeError("Hunter.io rate/plan limit reached")
    r.raise_for_status()
    return r.json().get("data") or {}


async def resolve_domain(client: httpx.AsyncClient, company: Company) -> Optional[str]:
    if company.domain:
        return company.domain
    if get_settings().hunter_api_key:
        try:
            data = await _hunter(client, {"company": company.name})
            if clean_domain(data.get("domain")):
                return clean_domain(data.get("domain"))
        except Exception as e:
            log.info("hunter company lookup failed for %s: %s", company.name, e)
    try:
        r = await client.get("https://autocomplete.clearbit.com/v1/companies/suggest", params={"query": company.name})
        if r.status_code == 200 and r.json():
            return clean_domain(r.json()[0].get("domain"))
    except Exception as e:
        log.info("clearbit lookup failed for %s: %s", company.name, e)
    return await guess_domain(client, company.name)


async def guess_domain(client: httpx.AsyncClient, name: str) -> Optional[str]:
    """Try <name>.com/.in/.ai/...; accept only a site whose page mentions the company name."""
    from .pipeline import norm_company

    words = norm_company(name).split()
    if not words or len(words[0]) < 3:
        return None
    bases = list(dict.fromkeys(["".join(words), words[0]]))
    candidates = [f"{b}.{tld}" for b in bases for tld in ("com", "in", "ai", "io", "co.in", "tech", "co")]

    async def check(domain: str) -> Optional[str]:
        try:
            r = await client.get(f"https://{domain}", headers=BROWSER_HEADERS, timeout=8)
        except Exception:
            return None
        if r.status_code != 200 or words[0] not in r.text[:20000].lower():
            return None
        return clean_domain(str(r.url))

    results = await asyncio.gather(*(check(d) for d in candidates))
    return next((d for d in results if d), None)


async def hunter_contacts(client: httpx.AsyncClient, domain: str) -> list[dict]:
    out = []
    data = await _hunter(client, {"domain": domain, "department": "hr"})
    emails = data.get("emails") or []
    if not emails:
        everyone = (await _hunter(client, {"domain": domain})).get("emails") or []
        emails = [e for e in everyone if HR_POSITION.search(e.get("position") or "") or e.get("type") == "generic"]
    pattern = data.get("pattern")
    for e in emails:
        verified = ((e.get("verification") or {}).get("status")) == "valid"
        name = " ".join(x for x in (e.get("first_name"), e.get("last_name")) if x) or None
        note = f"Hunter confidence {e.get('confidence')}%"
        if pattern:
            note += f"; company email pattern: {pattern}@{domain}"
        out.append({"email": e["value"].lower(), "name": name, "position": e.get("position"),
                    "source": "hunter", "confidence": "verified" if verified else "medium", "note": note})
    return out


async def website_contacts(client: httpx.AsyncClient, domain: str) -> list[dict]:
    pages = ["", "/careers", "/contact", "/contact-us", "/careers/", "/jobs", "/about"]

    async def grab(path: str) -> str:
        try:
            r = await client.get(f"https://{domain}{path}", headers=BROWSER_HEADERS, timeout=12)
            return r.text if r.status_code == 200 else ""
        except Exception:
            return ""

    texts = await asyncio.gather(*(grab(p) for p in pages))
    found: dict[str, dict] = {}
    for path, text in zip(pages, texts):
        for e in extract_emails(text):
            # Only HR-looking inboxes (careers@, talent@, hr.india@ ...); info@/webmaster@ are not useful here.
            if HR_HINT.search(e.split("@")[0]) and e not in found:
                found[e] = {"email": e, "name": None, "position": None, "source": "website", "confidence": "medium",
                            "note": f"Published on {domain}{path or '/'}"}
    return list(found.values())[:8]


async def pattern_contacts(domain: str) -> list[dict]:
    if not await asyncio.to_thread(has_mx, domain):
        return []
    return [{"email": f"{box}@{domain}", "name": None, "position": None, "source": "pattern", "confidence": "guessed",
             "note": "Common HR inbox — not confirmed. The domain accepts email, but this address may not exist."}
            for box in PATTERN_INBOXES]


async def find_contacts(session: Session, job: Job, refresh: bool = False) -> dict:
    company = session.get(Company, job.company_id)
    settings = get_settings()
    errors: list[str] = []

    # Job-post emails are cheap and always re-checked.
    existing_post = {c.email for c in session.exec(select(Contact).where(Contact.job_id == job.id)).all()}
    for e in extract_emails(job.description):
        if e not in existing_post:
            session.add(Contact(company_id=company.id, job_id=job.id, email=e, source="job_post", confidence="high",
                                note="Found in this job posting"))
    session.commit()

    if refresh or company.contacts_checked_at is None:
        for c in session.exec(select(Contact).where(Contact.company_id == company.id, Contact.job_id == None)).all():  # noqa: E711
            session.delete(c)
        found: list[dict] = []
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            known = company.domain
            domain = await resolve_domain(client, company)
            if domain and domain != company.domain:
                company.domain = domain
                company.website = company.website or f"https://{domain}"
            if domain:
                if settings.hunter_api_key:
                    try:
                        found += await hunter_contacts(client, domain)
                    except Exception as e:
                        errors.append(f"Hunter.io: {e}")
                found += await website_contacts(client, domain)
                if not any(HR_HINT.search(c["email"].split("@")[0]) or c["source"] == "hunter" for c in found):
                    found += await pattern_contacts(domain)
        seen = set()
        for c in found:
            if c["email"] not in seen:
                seen.add(c["email"])
                if not known and domain:
                    c["note"] = (c["note"] or "") + f" Company website auto-detected as {domain}; check it is the right company."
                session.add(Contact(company_id=company.id, **c))
        company.contacts_checked_at = utcnow()
        session.add(company)
        session.commit()

    contacts = session.exec(select(Contact).where(Contact.company_id == company.id)).all()
    # Job-post emails from *other* jobs of this company are still useful, but this job's come first.
    contacts = sorted(contacts, key=lambda c: (c.job_id != job.id if c.source == "job_post" else 1,
                                               CONFIDENCE_ORDER.get(c.confidence, 9)))
    return {
        "company_id": company.id,
        "company_name": company.name,
        "domain": company.domain,
        "hunter_configured": bool(settings.hunter_api_key),
        "errors": errors,
        "contacts": [{"email": c.email, "name": c.name, "position": c.position, "source": c.source,
                      "confidence": c.confidence, "note": c.note} for c in contacts],
    }
