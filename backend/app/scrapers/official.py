"""Sources with official, key-based APIs."""

import asyncio
import logging

import httpx

from ..config import SEARCH_LOCATIONS, SEARCH_QUERIES
from ..pipeline import html_to_text, parse_date
from .base import RawJob, Scraper, salary_range

log = logging.getLogger(__name__)


async def gather_limited(coros, limit: int = 4):
    sem = asyncio.Semaphore(limit)

    async def run(c):
        async with sem:
            return await c

    return await asyncio.gather(*(run(c) for c in coros), return_exceptions=True)


def _flatten(results, source: str) -> list[RawJob]:
    jobs: list[RawJob] = []
    errors = [r for r in results if isinstance(r, Exception)]
    for r in results:
        if not isinstance(r, Exception):
            jobs.extend(r)
    if errors and not jobs:
        raise errors[0]
    for e in errors:
        log.warning("%s partial failure: %s", source, e)
    return jobs


class AdzunaScraper(Scraper):
    name = "adzuna"
    label = "Adzuna India"
    kind = "official"
    description = "Official Adzuna jobs API for India (aggregates many Indian job boards)."
    required_keys = ("adzuna_app_id", "adzuna_app_key")

    async def _query(self, client: httpx.AsyncClient, what: str, where: str) -> list[RawJob]:
        params = {
            "app_id": self.settings.adzuna_app_id,
            "app_key": self.settings.adzuna_app_key,
            "what": what,
            "results_per_page": 50,
            "max_days_old": 7,
            "sort_by": "date",
            "content-type": "application/json",
        }
        if where != "India":
            params["where"] = where
        r = await client.get("https://api.adzuna.com/v1/api/jobs/in/search/1", params=params)
        r.raise_for_status()
        out = []
        for j in r.json().get("results", []):
            out.append(RawJob(
                source=self.name,
                title=html_to_text(j.get("title", "")),
                company=(j.get("company") or {}).get("display_name", "") or "Unknown",
                location=(j.get("location") or {}).get("display_name", ""),
                url=j.get("redirect_url", ""),
                description=html_to_text(j.get("description", "")),
                posted_at=parse_date(j.get("created")),
                india_hint=True,
                salary=salary_range(j.get("salary_min"), j.get("salary_max"), "₹", "/yr"),
                employment_type=j.get("contract_time"),
            ))
        return out

    async def fetch(self, client):
        results = await gather_limited(
            [self._query(client, q, loc) for q in SEARCH_QUERIES for loc in SEARCH_LOCATIONS], limit=3
        )
        return _flatten(results, self.name)


class JoobleScraper(Scraper):
    name = "jooble"
    label = "Jooble"
    kind = "official"
    description = "Official Jooble API — aggregates postings from thousands of Indian sites."
    required_keys = ("jooble_api_key",)

    async def _query(self, client, keywords: str, location: str) -> list[RawJob]:
        r = await client.post(
            f"https://jooble.org/api/{self.settings.jooble_api_key}",
            json={"keywords": keywords, "location": location, "page": "1", "ResultOnPage": "50"},
        )
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            out.append(RawJob(
                source=self.name,
                title=html_to_text(j.get("title", "")),
                company=j.get("company") or "Unknown",
                location=j.get("location") or location,
                url=j.get("link", ""),
                description=html_to_text(j.get("snippet", "")),
                posted_at=parse_date(j.get("updated")),
                india_hint=True,
                salary=j.get("salary") or None,
                employment_type=j.get("type") or None,
            ))
        return out

    async def fetch(self, client):
        results = await gather_limited(
            [self._query(client, q, loc) for q in SEARCH_QUERIES for loc in SEARCH_LOCATIONS], limit=3
        )
        return _flatten(results, self.name)


class JSearchScraper(Scraper):
    name = "jsearch"
    label = "JSearch (Google Jobs)"
    kind = "official"
    description = (
        "RapidAPI JSearch — Google for Jobs results, which include listings from LinkedIn, Naukri, "
        "Indeed, Glassdoor and company sites. Free tier is ~200 requests/month, so few queries per scan."
    )
    required_keys = ("rapidapi_key",)

    # Broad queries first; the request budget decides how many run.
    QUERIES = [
        "AI ML engineer in Pune, India",
        "data scientist in Pune, India",
        "generative AI LLM engineer in India",
        "machine learning engineer in India",
        "AI engineer in Pune, India",
        "data scientist in India",
        "computer vision NLP engineer in India",
        "MLOps engineer in India",
    ]

    async def _query(self, client, query: str) -> list[RawJob]:
        r = await client.get(
            "https://jsearch.p.rapidapi.com/search",
            params={"query": query, "page": 1, "num_pages": 1, "date_posted": "week", "country": "in"},
            headers={"X-RapidAPI-Key": self.settings.rapidapi_key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"},
        )
        r.raise_for_status()
        out = []
        for j in r.json().get("data", []) or []:
            loc = ", ".join(x for x in (j.get("job_city"), j.get("job_state"), j.get("job_country")) if x)
            website = j.get("employer_website") or ""
            domain = website.split("//")[-1].split("/")[0].removeprefix("www.") or None
            publisher = (j.get("job_publisher") or "").strip()
            out.append(RawJob(
                source=f"{self.name}:{publisher.lower()}" if publisher else self.name,
                title=j.get("job_title", ""),
                company=j.get("employer_name") or "Unknown",
                location=loc or ("Remote" if j.get("job_is_remote") else ""),
                url=j.get("job_apply_link") or j.get("job_google_link") or "",
                description=j.get("job_description", ""),
                posted_at=parse_date(j.get("job_posted_at_datetime_utc")),
                remote=bool(j.get("job_is_remote")),
                india_hint=(j.get("job_country") or "").upper() in ("IN", "INDIA"),
                salary=salary_range(j.get("job_min_salary"), j.get("job_max_salary"),
                                    "₹" if (j.get("job_salary_currency") or "INR") == "INR" else "",
                                    j.get("job_salary_period") or ""),
                employment_type=j.get("job_employment_type"),
                company_domain=domain,
                company_logo=j.get("employer_logo"),
            ))
        return out

    async def fetch(self, client):
        budget = max(0, self.settings.jsearch_max_requests_per_scan)
        results = await gather_limited([self._query(client, q) for q in self.QUERIES[:budget]], limit=2)
        return _flatten(results, self.name)
