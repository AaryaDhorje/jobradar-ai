import pytest

from app import ai
from app.models import Company, Job


@pytest.fixture
def fake_model(monkeypatch):
    calls = []

    async def fake_complete(system, user, max_tokens=6000):
        calls.append(user)
        return calls_response.pop(0)

    async def no_site(domain, limit=5000):
        return ""

    calls_response: list = []
    monkeypatch.setattr(ai, "_complete_json", fake_complete)
    monkeypatch.setattr(ai, "fetch_site_text", no_site)
    return calls, calls_response


JOB = Job(id=1, fingerprint="x", title="ML Engineer", company_id=1, location="Pune", location_tag="pune",
          url="https://x", description="Build LLM apps", tags=["PyTorch"])
COMPANY = Company(id=1, name="Acme", norm_name="acme", domain="acme.ai")


async def test_company_insights_fills_missing_keys(fake_model):
    calls, responses = fake_model
    responses.append({"summary": {"overview": "Acme builds AI.", "products": "Acme Cloud"}, "interview": None})
    out = await ai.company_insights(COMPANY, [JOB])
    assert out["summary"]["overview"] == "Acme builds AI."
    assert out["summary"]["products"] == ["Acme Cloud"]  # coerced to list
    assert out["summary"]["tech_stack"] == [] and out["interview"]["process"] == []
    assert "ML Engineer" in calls[0]


async def test_resume_advice_with_and_without_resume(fake_model):
    _, responses = fake_model
    responses += [{"match_score": "140", "verdict": "Good"}, {"match_score": 80, "verdict": "Ideal resume"}]
    with_resume = await ai.resume_advice(JOB, COMPANY, "Python developer with PyTorch")
    assert with_resume["match_score"] == 100 and with_resume["missing_keywords"] == []
    without = await ai.resume_advice(JOB, COMPANY, None)
    assert without["match_score"] is None


async def test_missing_key_raises_clear_error(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "openai_api_key", "")
    monkeypatch.setattr(ai.get_settings(), "ai_api_key", "")
    with pytest.raises(ai.AIUnavailable, match="AI_API_KEY"):
        await ai._complete_json("s", "u")


def test_parse_json_tolerates_fences():
    assert ai.parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(ai.AIUnavailable):
        ai.parse_json("sorry, I cannot")


@pytest.mark.parametrize("key,provider", [
    ("AIzaSyX", "gemini"), ("AQ.Ab8x", "gemini"), ("gsk_abc", "groq"), ("sk-or-v1-x", "openrouter"), ("sk-proj-x", "openai"),
])
def test_provider_detected_from_key(key, provider):
    from app.config import Settings
    cfg = Settings(ai_api_key=key, _env_file=None).ai_config()
    assert cfg["provider"] == provider and cfg["model"] and cfg["api_key"] == key
