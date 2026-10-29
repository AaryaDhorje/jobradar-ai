"""Public careers-board APIs (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday).

Companies are listed in data/companies.yaml. Every board is fetched, then filtered to AI roles in India
or remote; the pipeline applies the final relevance/location rules.
"""

import logging
import re
from functools import lru_cache
from typing import Any

import httpx
import yaml

from ..config import DATA_DIR
from ..pipeline import classify_location, html_to_text, parse_date, relevance
from .base import BROWSER_HEADERS, RawJob, Scraper
from .official import _flatten, gather_limited

log = logging.getLogger(__name__)
COMPANIES_FILE = DATA_DIR / "companies.yaml"


@lru_cache
def load_boards() -> dict[str, list[dict[str, Any]]]:
    if not COMPANIES_FILE.exists():
        return {}
    return yaml.safe_load(COMPANIES_FILE.read_text(encoding="utf-8")) or {}


def _in_scope(title: str, location: str, remote: bool = False) -> bool:
    return bool(relevance(title)) and classify_location(location, remote)[0] is not None


class _BoardScraper(Scraper):
    kind = "public"
    board_key: str
    concurrency = 6

    def boards(self) -> list[dict[str, Any]]:
        return load_boards().get(self.board_key, [])

    async def fetch_board(self, client: httpx.AsyncClient, board: dict[str, Any]) -> list[RawJob]:
        raise NotImplementedError

    async def fetch(self, client):
        boards = self.boards()
        if not boards:
            return []
        results = await gather_limited([self.fetch_board(client, b) for b in boards], limit=self.concurrency)
        return _flatten(results, self.name)


class GreenhouseScraper(_BoardScraper):
    name = "greenhouse"
    label = "Greenhouse career boards"
    description = "Public Greenhouse job boards of AI-hiring companies (edit data/companies.yaml)."
    board_key = "greenhouse"

    async def fetch_board(self, client, b):
        r = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{b['token']}/jobs", params={"content": "true"})
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            loc = (j.get("location") or {}).get("name", "")
            offices = ", ".join(o.get("name", "") for o in j.get("offices") or [])
            full_loc = f"{loc}; {offices}" if offices and offices not in loc else loc
            if not _in_scope(j.get("title", ""), full_loc):
                continue
            out.append(RawJob(
                source=self.name, title=j["title"], company=b["name"], location=loc or offices,
                url=j.get("absolute_url", ""), description=html_to_text(j.get("content", "")),
                posted_at=parse_date(j.get("first_published") or j.get("updated_at")),
                company_domain=b.get("domain"),
            ))
        return out


class LeverScraper(_BoardScraper):
    name = "lever"
    label = "Lever career boards"
    description = "Public Lever job boards of AI-hiring companies (edit data/companies.yaml)."
    board_key = "lever"

    async def fetch_board(self, client, b):
        host = "api.eu.lever.co" if b.get("eu") else "api.lever.co"
        r = await client.get(f"https://{host}/v0/postings/{b['token']}", params={"mode": "json"})
        r.raise_for_status()
        out = []
        for j in r.json():
            cats = j.get("categories") or {}
            loc = ", ".join(cats.get("allLocations") or []) or cats.get("location", "")
            remote = (j.get("workplaceType") or "") == "remote"
            if not _in_scope(j.get("text", ""), loc, remote):
                continue
            desc = j.get("descriptionPlain", "")
            for lst in j.get("lists") or []:
                desc += f"\n\n{lst.get('text', '')}\n{html_to_text(lst.get('content', ''))}"
            out.append(RawJob(
                source=self.name, title=j["text"], company=b["name"], location=loc, url=j.get("hostedUrl", ""),
                description=desc.strip(), posted_at=parse_date(j.get("createdAt")), remote=remote,
                employment_type=cats.get("commitment"), company_domain=b.get("domain"),
            ))
        return out


class AshbyScraper(_BoardScraper):
    name = "ashby"
    label = "Ashby career boards"
    description = "Public Ashby job boards of AI-hiring companies (edit data/companies.yaml)."
    board_key = "ashby"

    async def fetch_board(self, client, b):
        r = await client.get(
            f"https://api.ashbyhq.com/posting-api/job-board/{b['token']}", params={"includeCompensation": "true"}
        )
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            locs = [j.get("location") or ""] + [
                (s.get("location") if isinstance(s, dict) else str(s)) or "" for s in j.get("secondaryLocations") or []
            ]
            loc = "; ".join(x for x in locs if x)
            remote = bool(j.get("isRemote"))
            if not _in_scope(j.get("title", ""), loc, remote):
                continue
            comp = (j.get("compensation") or {}).get("compensationTierSummary")
            out.append(RawJob(
                source=self.name, title=j["title"], company=b["name"], location=loc,
                url=j.get("jobUrl") or j.get("applyUrl", ""),
                description=j.get("descriptionPlain") or html_to_text(j.get("descriptionHtml", "")),
                posted_at=parse_date(j.get("publishedAt")), remote=remote, salary=comp,
                employment_type=j.get("employmentType"), company_domain=b.get("domain"),
            ))
        return out


class WorkableScraper(_BoardScraper):
    name = "workable"
    label = "Workable career boards"
    description = "Public Workable job boards of AI-hiring companies (edit data/companies.yaml)."
    board_key = "workable"

    async def fetch_board(self, client, b):
        r = await client.get(f"https://apply.workable.com/api/v1/widget/accounts/{b['token']}", params={"details": "true"})
        r.raise_for_status()
        out = []
        for j in r.json().get("jobs", []):
            loc = ", ".join(x for x in (j.get("city"), j.get("state"), j.get("country")) if x)
            remote = bool(j.get("telecommuting"))
            if not _in_scope(j.get("title", ""), loc, remote):
                continue
            out.append(RawJob(
                source=self.name, title=j["title"], company=b["name"], location=loc,
                url=j.get("url") or j.get("application_url", ""), description=html_to_text(j.get("description", "")),
                posted_at=parse_date(j.get("published_on") or j.get("created_at")), remote=remote,
                employment_type=j.get("employment_type"), company_domain=b.get("domain"),
            ))
        return out


class SmartRecruitersScraper(_BoardScraper):
    name = "smartrecruiters"
    label = "SmartRecruiters career boards"
    description = "Public SmartRecruiters postings (India) of large employers (edit data/companies.yaml)."
    board_key = "smartrecruiters"

    async def fetch_board(self, client, b):
        base = f"https://api.smartrecruiters.com/v1/companies/{b['token']}/postings"
        r = await client.get(base, params={"country": "in", "limit": 100})
        r.raise_for_status()
        candidates = []
        for j in r.json().get("content", []):
            l = j.get("location") or {}
            loc = ", ".join(x for x in (l.get("city"), l.get("region"), "India") if x)
            if _in_scope(j.get("name", ""), loc, bool(l.get("remote"))):
                candidates.append((j, loc, bool(l.get("remote"))))
        out = []
        for j, loc, remote in candidates:
            desc = ""
            try:
                d = (await client.get(f"{base}/{j['id']}")).json()
                sections = (d.get("jobAd") or {}).get("sections") or {}
                desc = "\n\n".join(html_to_text((sections.get(k) or {}).get("text", ""))
                                   for k in ("companyDescription", "jobDescription", "qualifications", "additionalInformation"))
            except Exception as e:  # description is optional
                log.debug("smartrecruiters detail failed: %s", e)
            out.append(RawJob(
                source=self.name, title=j["name"], company=b["name"], location=loc,
                url=f"https://jobs.smartrecruiters.com/{b['token']}/{j['id']}", description=desc.strip(),
                posted_at=parse_date(j.get("releasedDate")), remote=remote,
                employment_type=(j.get("typeOfEmployment") or {}).get("label"), company_domain=b.get("domain"),
            ))
        return out


class WorkdayScraper(_BoardScraper):
    name = "workday"
    label = "Workday career sites"
    description = "Workday careers sites of large employers with Pune/India offices (edit data/companies.yaml)."
    board_key = "workday"
    concurrency = 4
    SEARCHES = ["machine learning", "artificial intelligence", "data scientist", "generative AI", "AI engineer"]

    async def fetch_board(self, client, b):
        api = f"https://{b['host']}/wday/cxs/{b['tenant']}/{b['site']}"
        seen: dict[str, dict] = {}
        for text in self.SEARCHES:
            for offset in (0, 20):
                r = await client.post(f"{api}/jobs", json={"appliedFacets": {}, "limit": 20, "offset": offset, "searchText": text})
                r.raise_for_status()
                postings = r.json().get("jobPostings") or []
                for p in postings:
                    if p.get("externalPath") and relevance(p.get("title", "")):
                        seen.setdefault(p["externalPath"], p)
                if len(postings) < 20:
                    break
        out = []
        for path, p in seen.items():
            loc_text = p.get("locationsText", "")
            # "3 Locations" hides the cities, so the detail call decides.
            if not re.search(r"\d+\s+locations", loc_text, re.I) and classify_location(loc_text)[0] is None:
                continue
            try:
                info = (await client.get(f"{api}{path}")).json().get("jobPostingInfo", {})
            except Exception as e:
                log.debug("workday detail failed: %s", e)
                continue
            locs = [info.get("location") or loc_text] + list(info.get("additionalLocations") or [])
            loc = "; ".join(x for x in locs if x)
            if classify_location(loc)[0] is None:
                continue
            out.append(RawJob(
                source=self.name, title=info.get("title") or p["title"], company=b["name"], location=loc,
                url=info.get("externalUrl") or f"https://{b['host']}/{b['site']}{path}",
                description=html_to_text(info.get("jobDescription", "")),
                posted_at=parse_date(info.get("startDate")), employment_type=info.get("timeType"),
                company_domain=b.get("domain"),
            ))
        return out


async def probe_board(client: httpx.AsyncClient, kind: str, board: dict[str, Any]) -> int:
    """Used by scripts/validate_boards.py: returns number of jobs on the board (raises if invalid)."""
    if kind == "workday":
        api = f"https://{board['host']}/wday/cxs/{board['tenant']}/{board['site']}/jobs"
        r = await client.post(api, json={"appliedFacets": {}, "limit": 1, "offset": 0, "searchText": ""})
        r.raise_for_status()
        return int(r.json().get("total", 0))
    urls = {
        "greenhouse": f"https://boards-api.greenhouse.io/v1/boards/{board['token']}/jobs",
        "lever": f"https://api.lever.co/v0/postings/{board['token']}?mode=json",
        "ashby": f"https://api.ashbyhq.com/posting-api/job-board/{board['token']}",
        "workable": f"https://apply.workable.com/api/v1/widget/accounts/{board['token']}",
        "smartrecruiters": f"https://api.smartrecruiters.com/v1/companies/{board['token']}/postings?limit=1",
    }
    r = await client.get(urls[kind], headers=BROWSER_HEADERS)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list):
        return len(data)
    return int(data.get("totalFound") or len(data.get("jobs") or data.get("content") or []))

