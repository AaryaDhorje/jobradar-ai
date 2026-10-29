import httpx
import respx

from app.config import Settings
from app.scrapers.boards import HiristScraper, LinkedInScraper, NaukriScraper
from app.scrapers.official import AdzunaScraper

from .conftest import FIXTURES

SETTINGS = Settings(adzuna_app_id="id", adzuna_app_key="key", _env_file=None)


def test_linkedin_parse():
    jobs = LinkedInScraper(SETTINGS).parse((FIXTURES / "linkedin_search.html").read_text(encoding="utf-8"))
    assert len(jobs) == 2
    j = jobs[0]
    assert j.title == "Senior Data Scientist"
    assert j.company == "TripleLift"
    assert j.location.startswith("Pune")
    assert j.url == "https://in.linkedin.com/jobs/view/senior-data-scientist-at-triplelift-4482718631"
    assert j.posted_at.year == 2026


def test_naukri_parse():
    data = {"jobDetails": [{
        "title": "GenAI Engineer", "companyName": "Acme", "jdURL": "/job-listings-genai-engineer-acme-pune-1",
        "jobDescription": "<p>Build <b>LLM</b> apps</p>", "tagsAndSkills": "LLM,Python",
        "footerPlaceholderLabel": "3 Days Ago",
        "placeholders": [{"type": "experience", "label": "2-5 Yrs"}, {"type": "salary", "label": "Not disclosed"},
                         {"type": "location", "label": "Pune"}],
    }]}
    [j] = NaukriScraper(SETTINGS).parse(data)
    assert j.url.startswith("https://www.naukri.com/job-listings")
    assert j.experience == "2-5 Yrs" and j.salary is None and j.location == "Pune"
    assert "LLM" in j.description and j.posted_at is not None


@respx.mock
async def test_hirist_fetch_maps_fields():
    respx.get("https://gladiator.hirist.tech/job/search").mock(return_value=httpx.Response(200, json={
        "hasMore": False,
        "data": [{"title": "KPMG - ML Engineer", "min": 4, "max": 8, "jobDetailUrl": "https://www.hirist.tech/j/x-1",
                  "createdTimeMs": 1792221898210, "tags": [{"name": "PyTorch"}], "locations": [{"name": "Pune"}],
                  "creatorDomainName": "kpmg.com", "hideSal": 1, "companyData": {"companyName": "KPMG"}}],
    }))
    async with httpx.AsyncClient() as client:
        jobs = await HiristScraper(SETTINGS).fetch(client)
    assert jobs and jobs[0].company_domain == "kpmg.com" and jobs[0].experience == "4-8 yrs"
    assert jobs[0].india_hint and jobs[0].salary is None


@respx.mock
async def test_adzuna_partial_failure_keeps_results():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] % 2:
            return httpx.Response(500)
        return httpx.Response(200, json={"results": [{
            "title": "<strong>AI</strong> Engineer", "company": {"display_name": "Acme"},
            "location": {"display_name": "Pune, Maharashtra"}, "redirect_url": "https://adzuna/x",
            "created": "2026-10-28T00:00:00Z", "salary_min": 1200000, "salary_max": 1800000,
        }]})

    respx.get(url__regex=r"https://api\.adzuna\.com/.*").mock(side_effect=handler)
    async with httpx.AsyncClient() as client:
        jobs = await AdzunaScraper(SETTINGS).fetch(client)
    assert jobs and jobs[0].title == "AI Engineer"
    assert jobs[0].salary == "₹12 LPA – ₹18 LPA /yr"


def test_unconfigured_scraper_reports_missing_keys():
    s = AdzunaScraper(Settings(_env_file=None))
    assert not s.configured and s.missing_keys() == ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"]
