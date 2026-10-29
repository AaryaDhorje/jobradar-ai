from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import engine, init_db
from app.main import app
from app.models import ScanRun, utcnow
from app.scan import ingest
from app.scrapers import RawJob


def _seed():
    init_db()
    with Session(engine) as s:
        run = ScanRun(status="done", finished_at=utcnow())
        s.add(run)
        s.commit()
        s.refresh(run)
        now = utcnow()
        raw = [
            RawJob("linkedin", "Machine Learning Engineer", "Acme AI", "Pune, Maharashtra, India", "https://l/1",
                   posted_at=now - timedelta(hours=3)),
            RawJob("naukri", "Machine Learning Engineer", "Acme AI Pvt Ltd", "Pune", "https://n/1",
                   description="Contact hr@acme.ai. Build ML models with PyTorch." * 3, india_hint=True),
            RawJob("adzuna", "Data Scientist", "Beta Corp", "Bengaluru, Karnataka", "https://a/2",
                   posted_at=now - timedelta(days=5)),
            RawJob("remotive", "AI Engineer", "Gamma", "Remote (Worldwide)", "https://r/3", remote=True),
            RawJob("remotive", "AI Engineer", "Delta", "Remote (USA only)", "https://r/4", remote=True),
            RawJob("adzuna", "Sales Manager", "Beta Corp", "Pune", "https://a/5"),
        ]
        found, new = ingest(s, raw, run.id)
    return found, new


def test_ingest_and_api_flow():
    found, new = _seed()
    assert (found, new) == (4, 3)  # USA-only remote and the sales job are dropped; Pune ML job merged

    with TestClient(app) as client:
        stats = client.get("/api/stats").json()
        assert stats["total_jobs"] == 3
        assert stats["by_tag"] == {"pune": 1, "india": 1, "remote": 1}

        jobs = client.get("/api/jobs").json()
        assert jobs["total"] == 3
        top = jobs["items"][0]
        assert top["location_tag"] == "pune"  # Pune ranks first
        assert {s["source"] for s in top["sources"]} == {"linkedin", "naukri"}
        assert top["is_new"]

        assert client.get("/api/jobs", params={"tag": "india"}).json()["total"] == 1
        assert client.get("/api/jobs", params={"source": "naukri"}).json()["total"] == 1
        assert client.get("/api/jobs", params={"q": "scientist"}).json()["total"] == 1

        r = client.patch(f"/api/jobs/{top['id']}", json={"status": "hidden"})
        assert r.json()["status"] == "hidden"
        assert client.get("/api/jobs").json()["total"] == 2
        assert client.get("/api/jobs", params={"status": "hidden"}).json()["total"] == 1

        detail = client.get(f"/api/jobs/{top['id']}").json()
        assert "PyTorch" in detail["description"]

        # AI endpoints explain a missing key instead of crashing
        r = client.post(f"/api/jobs/{top['id']}/resume-advice")
        assert r.status_code == 400 and "AI_API_KEY" in r.json()["detail"]

        company = client.get(f"/api/companies/{top['company']['id']}").json()
        assert company["job_count"] == 1 and company["insights"] is None
        assert client.patch(f"/api/companies/{top['company']['id']}", json={"domain": "bad"}).status_code == 400

        settings = client.get("/api/settings").json()
        assert settings["scan_time"] == "08:00"
        assert any(s["name"] == "linkedin" and s["kind"] == "unofficial" for s in settings["sources"])
        r = client.put("/api/settings", json={"scan_time": "7:30", "sources": {"linkedin": False}})
        assert r.json()["scan_time"] == "07:30"
        assert not next(s for s in r.json()["sources"] if s["name"] == "linkedin")["enabled"]
        assert client.put("/api/settings", json={"scan_time": "25:00"}).status_code == 400

        assert client.get("/api/resume").json() is None
        r = client.post("/api/resume", files={"file": ("cv.txt", b"Python PyTorch ML engineer " * 20, "text/plain")})
        assert r.status_code == 200 and r.json()["filename"] == "cv.txt"
        assert client.post("/api/resume", files={"file": ("cv.exe", b"x", "application/octet-stream")}).status_code == 400
        assert client.delete("/api/resume").status_code == 204
