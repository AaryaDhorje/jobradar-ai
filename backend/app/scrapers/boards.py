"""Job boards: remote boards with public APIs, plus unofficial scrapers for Hirist, LinkedIn and Naukri."""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from ..config import SEARCH_QUERIES
from ..pipeline import html_to_text, parse_date
from .base import BROWSER_HEADERS, RawJob, Scraper, salary_range
from .official import _flatten, gather_limited

log = logging.getLogger(__name__)


class RemotiveScraper(Scraper):
    name = "remotive"
    label = "Remotive"
    kind = "public"
    description = "Remote jobs API (AI/ML and data categories); only roles open to India/worldwide are kept."

    async def _get(self, client, params) -> list[RawJob]:
        r = await client.get("https://remotive.com/api/remote-jobs", params=params)
        r.raise_for_status()
        return [
            RawJob(
                source=self.name, title=j.get("title", ""), company=j.get("company_name") or "Unknown",
                location=f"Remote ({j.get('candidate_required_location') or 'unspecified'})", url=j.get("url", ""),
                description=html_to_text(j.get("description", "")), posted_at=parse_date(j.get("publication_date")),
                remote=True, salary=j.get("salary") or None, employment_type=j.get("job_type"),
                company_logo=j.get("company_logo"), tags=j.get("tags") or [],
            )
            for j in r.json().get("jobs", [])
            if _remote_ok_for_india(j.get("candidate_required_location", ""))
        ]

    async def fetch(self, client):
        results = await gather_limited(
            [self._get(client, {"category": c}) for c in ("artificial-intelligence", "data")]
            + [self._get(client, {"search": q}) for q in ("machine learning", "LLM")],
            limit=2,
        )
        return _flatten(results, self.name)


class RemoteOKScraper(Scraper):
    name = "remoteok"
    label = "RemoteOK"
    kind = "public"
    description = "RemoteOK public API (AI/ML tags); only roles open to India/worldwide are kept."

    async def fetch(self, client):
        out: list[RawJob] = []
        for tag in ("ai", "machine-learning", "data-science", "llm"):
            r = await client.get("https://remoteok.com/api", params={"tag": tag}, headers=BROWSER_HEADERS)
            r.raise_for_status()
            for j in r.json():
                if "position" not in j or not _remote_ok_for_india(j.get("location", "")):
                    continue
                out.append(RawJob(
                    source=self.name, title=j["position"], company=j.get("company") or "Unknown",
                    location=f"Remote ({j.get('location') or 'worldwide'})", url=j.get("url") or j.get("apply_url", ""),
                    description=html_to_text(j.get("description", "")), posted_at=parse_date(j.get("date")),
                    remote=True, salary=salary_range(j.get("salary_min"), j.get("salary_max"), "$", "/yr"),
                    company_logo=j.get("company_logo") or j.get("logo"), tags=j.get("tags") or [],
                ))
            await asyncio.sleep(1)
        return out


def _remote_ok_for_india(region: str) -> bool:
    r = (region or "").lower()
    if not r:
        return True  # RemoteOK leaves blank for "anywhere"
    return bool(re.search(r"worldwide|anywhere|global|india|asia|apac", r))


# ---------------------------------------------------------------- unofficial


class HiristScraper(Scraper):
    name = "hirist"
    label = "Hirist.tech"
    kind = "unofficial"
    description = "Hirist.tech search (India tech jobs). Uses the site's internal JSON API."
    HEADERS = {**BROWSER_HEADERS, "Accept": "application/json", "version": "2",
               "Origin": "https://www.hirist.tech", "Referer": "https://www.hirist.tech/"}

    async def _query(self, client, query: str) -> list[RawJob]:
        out = []
        for page in range(3):
            r = await client.get("https://gladiator.hirist.tech/job/search",
                                 params={"query": query, "size": 20, "page": page}, headers=self.HEADERS)
            r.raise_for_status()
            data = r.json()
            for j in data.get("data") or []:
                locs = ", ".join(l.get("name", "") for l in j.get("locations") or [])
                tags = [t.get("name", "") for t in j.get("tags") or []]
                exp = f"{j.get('min')}-{j.get('max')} yrs" if j.get("max") is not None else None
                comp = j.get("companyData") or {}
                sal = None if j.get("hideSal") else salary_range(
                    (j.get("minSal") or 0) * 100000, (j.get("maxSal") or 0) * 100000, "₹")
                out.append(RawJob(
                    source=self.name, title=j.get("title", ""), company=comp.get("companyName") or "Unknown",
                    location=locs or j.get("createdByAlias", ""), url=j.get("jobDetailUrl", ""),
                    description=f"Skills: {', '.join(tags)}" + (f"\nExperience: {exp}" if exp else ""),
                    posted_at=parse_date(j.get("createdTimeMs") or j.get("createdTime")),
                    remote=bool(j.get("workFromHome")), india_hint=True, salary=sal, experience=exp,
                    company_domain=j.get("creatorDomainName") or None, company_logo=comp.get("logo") or None,
                    tags=tags,
                ))
            if not data.get("hasMore"):
                break
        return out

    async def fetch(self, client):
        queries = ["machine learning", "artificial intelligence", "generative ai", "data scientist", "llm",
                   "deep learning", "nlp", "computer vision", "mlops", "ai engineer"]
        results = await gather_limited([self._query(client, q) for q in queries], limit=3)
        return _flatten(results, self.name)


class LinkedInScraper(Scraper):
    name = "linkedin"
    label = "LinkedIn (guest search)"
    kind = "unofficial"
    description = ("LinkedIn public guest job search (no login). Rate-limited by LinkedIn; descriptions are "
                   "loaded when you open a job.")
    LOCATIONS = ["Pune, Maharashtra, India", "India"]

    async def _page(self, client, keywords: str, location: str, start: int) -> list[RawJob]:
        for attempt in range(3):
            r = await client.get(
                "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
                params={"keywords": keywords, "location": location, "f_TPR": "r604800", "start": start},
                headers=BROWSER_HEADERS,
            )
            if r.status_code == 429:
                await asyncio.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            return self.parse(r.text)
        raise RuntimeError("LinkedIn rate limit (HTTP 429)")

    def parse(self, html_text: str) -> list[RawJob]:
        out = []
        for card in BeautifulSoup(html_text, "lxml").select("div.base-card"):
            link = card.select_one("a.base-card__full-link")
            title = card.select_one("h3")
            if not link or not title:
                continue
            company = card.select_one("h4")
            loc = card.select_one(".job-search-card__location")
            when = card.select_one("time")
            sal = card.select_one(".job-search-card__salary-info")
            logo = card.select_one("img[data-delayed-url]")
            out.append(RawJob(
                source=self.name, title=title.get_text(strip=True),
                company=company.get_text(strip=True) if company else "Unknown",
                location=loc.get_text(strip=True) if loc else "",
                url=link["href"].split("?")[0], posted_at=parse_date(when.get("datetime")) if when else None,
                salary=sal.get_text(" ", strip=True) if sal else None,
                company_logo=logo.get("data-delayed-url") if logo else None,
            ))
        return out

    async def fetch(self, client):
        out: list[RawJob] = []
        errors = 0
        for location in self.LOCATIONS:
            for kw in SEARCH_QUERIES:
                pages = (0, 10, 20) if location.startswith("Pune") else (0, 10)
                for start in pages:
                    try:
                        batch = await self._page(client, kw, location, start)
                    except Exception as e:
                        errors += 1
                        log.warning("linkedin %s/%s: %s", kw, location, e)
                        if errors >= 5:
                            if out:
                                return out
                            raise
                        break
                    out.extend(batch)
                    await asyncio.sleep(1.5)
                    if len(batch) < 10:
                        break
        return out

    async def fetch_description(self, client: httpx.AsyncClient, url: str) -> Optional[str]:
        m = re.search(r"(\d{8,})", url)
        if not m:
            return None
        r = await client.get(f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{m.group(1)}", headers=BROWSER_HEADERS)
        if r.status_code != 200:
            return None
        node = BeautifulSoup(r.text, "lxml").select_one(".show-more-less-html__markup")
        return html_to_text(str(node)) if node else None


class NaukriScraper(Scraper):
    name = "naukri"
    label = "Naukri.com"
    kind = "unofficial"
    description = ("Naukri search. Naukri blocks plain scripts, so this drives your installed Google Chrome "
                   "invisibly (needs Chrome + the playwright package).")
    API_HEADERS = {**BROWSER_HEADERS, "Accept": "application/json", "appid": "109", "systemid": "Naukri",
                   "clientid": "d3skt0p", "gid": "LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE"}
    SEARCHES = [("machine learning", "pune"), ("artificial intelligence", "pune"), ("data scientist", "pune"),
                ("generative ai", "pune"), ("machine learning", ""), ("generative ai", ""), ("llm", ""),
                ("data scientist", ""), ("ai engineer", ""), ("computer vision", ""), ("nlp", "")]

    @staticmethod
    def _seo(keyword: str, location: str) -> str:
        k = re.sub(r"\s+", "-", keyword.strip().lower())
        return f"{k}-jobs-in-{location}" if location else f"{k}-jobs"

    def parse(self, data: dict) -> list[RawJob]:
        out = []
        for j in data.get("jobDetails") or []:
            ph = {p.get("type"): p.get("label") for p in j.get("placeholders") or []}
            url = j.get("jdURL", "")
            out.append(RawJob(
                source=self.name, title=j.get("title", ""), company=j.get("companyName") or "Unknown",
                location=ph.get("location", ""), url=url if url.startswith("http") else f"https://www.naukri.com{url}",
                description=html_to_text(j.get("jobDescription", "")) + (
                    f"\nSkills: {j['tagsAndSkills']}" if j.get("tagsAndSkills") else ""),
                posted_at=parse_date(j.get("createdDate")) or _relative_age(j.get("footerPlaceholderLabel", "")),
                india_hint=True, salary=ph.get("salary") if ph.get("salary") not in (None, "Not disclosed") else None,
                experience=ph.get("experience"), company_logo=j.get("logoPathV3") or j.get("logoPath"),
                tags=(j.get("tagsAndSkills") or "").split(","),
            ))
        return out

    async def _api(self, client, keyword: str, location: str) -> list[RawJob]:
        seo = self._seo(keyword, location)
        params = {"noOfResults": 20, "urlType": "search_by_keyword", "searchType": "adv", "keyword": keyword,
                  "pageNo": 1, "seoKey": seo, "src": "jobsearchDesk", "jobAge": 7}
        if location:
            params["location"] = location
        r = await client.get("https://www.naukri.com/jobapi/v3/search", params=params,
                             headers={**self.API_HEADERS, "Referer": f"https://www.naukri.com/{seo}"})
        if r.status_code in (403, 406):
            raise PermissionError("Naukri blocked the request (captcha required)")
        r.raise_for_status()
        return self.parse(r.json())

    async def _browser(self) -> list[RawJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            raise RuntimeError("Naukri blocks plain requests. Install Playwright to enable it: pip install playwright")
        out: list[RawJob] = []
        async with async_playwright() as p:
            args = ["--disable-blink-features=AutomationControlled"]
            try:
                # Naukri's bot protection rejects Playwright's bundled Chromium but accepts installed Chrome.
                browser = await p.chromium.launch(channel="chrome", headless=True, args=args)
            except Exception:
                browser = await p.chromium.launch(headless=True, args=args)
            context = await browser.new_context(user_agent=BROWSER_HEADERS["User-Agent"], locale="en-IN",
                                                viewport={"width": 1366, "height": 900})
            page = await context.new_page()
            try:
                for kw, loc in self.SEARCHES:
                    captured: list[dict] = []

                    async def on_response(resp, sink=captured):
                        if "/jobapi/v3/search" in resp.url and resp.status == 200:
                            try:
                                sink.append(await resp.json())
                            except Exception:
                                pass

                    page.on("response", on_response)
                    await page.goto(f"https://www.naukri.com/{self._seo(kw, loc)}?jobAge=7", wait_until="domcontentloaded")
                    for _ in range(20):
                        if captured:
                            break
                        await page.wait_for_timeout(500)
                    page.remove_listener("response", on_response)
                    for data in captured:
                        out.extend(self.parse(data))
            finally:
                await browser.close()
        if not out:
            raise RuntimeError("Naukri returned no results in the headless browser (possibly blocked)")
        return out

    async def fetch(self, client):
        try:
            return await self._api(client, *self.SEARCHES[0]) + _flatten(
                await gather_limited([self._api(client, k, l) for k, l in self.SEARCHES[1:]], limit=2), self.name)
        except PermissionError:
            return await self._browser()


def _relative_age(label: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    label = (label or "").lower()
    if "just now" in label or "today" in label or "few hours" in label:
        return now
    m = re.search(r"(\d+)\+?\s*(day|week|month)", label)
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2)
    return now - timedelta(days=n * {"day": 1, "week": 7, "month": 30}[unit])
