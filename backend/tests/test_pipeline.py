from datetime import datetime, timedelta

import pytest

from app.pipeline import (classify_location, fingerprint, html_to_text, norm_company, norm_title, parse_date,
                          relevance, score)


@pytest.mark.parametrize("title", [
    "Machine Learning Engineer", "Senior AI Engineer", "Data Scientist II", "GenAI Developer",
    "LLM Ops Engineer", "NLP Researcher", "Computer Vision Engineer", "MLOps Engineer", "AI/ML Lead",
    "Prompt Engineer", "Applied Scientist", "Agentic AI Architect",
])
def test_ai_titles_are_relevant(title):
    assert relevance(title) >= 28


@pytest.mark.parametrize("title", [
    "Sales Executive", "HTML Developer", "Maintenance Engineer", "Accountant", "Frontend Engineer (React)",
    "Mainframe Developer", "Email Marketing Manager",
])
def test_non_ai_titles_are_not_relevant(title):
    assert relevance(title) == 0


def test_description_can_make_job_relevant_only_with_several_terms():
    assert relevance("Software Engineer", "We use Python.") == 0
    assert relevance("Software Engineer", "Build LLM apps with RAG, embeddings, PyTorch and fine-tuning.") > 0


@pytest.mark.parametrize("loc,remote,hint,expected", [
    ("Pune, Maharashtra, India", False, False, "pune"),
    ("Hinjewadi, Pune", False, False, "pune"),
    ("Pune/Gurgaon/Kolkata/Bangalore", False, True, "pune"),
    ("Bengaluru, Karnataka, India", False, False, "india"),
    ("Gurugram", False, False, "india"),
    ("Remote (Worldwide)", True, False, "remote"),
    ("Remote - India", False, False, "remote"),
    ("Remote", True, False, None),               # could be US-only
    ("Remote", True, True, "remote"),            # Indian board
    ("San Francisco, CA", False, False, None),
    ("London, UK", False, False, None),
    ("", False, True, "india"),
])
def test_classify_location(loc, remote, hint, expected):
    assert classify_location(loc, remote, hint)[0] == expected


def test_company_and_title_normalisation_dedupes_variants():
    assert norm_company("Tiger Analytics India Pvt. Ltd.") == norm_company("Tiger Analytics")
    assert norm_title("KPMG - Machine Learning Engineer - PyTorch/Tensorflow", "KPMG") == "machine learning engineer"
    assert norm_title("Sr. Data Scientist") == "senior data scientist"
    a = fingerprint("Acme Technologies Pvt Ltd", "Sr. ML Engineer", "pune")
    b = fingerprint("Acme", "Senior ML Engineer", "pune")
    assert a == b
    assert a != fingerprint("Acme", "Senior ML Engineer", "bangalore")


def test_score_prefers_pune_and_fresh_jobs():
    now = datetime(2026, 10, 29)
    fresh_pune = score("pune", 30, now - timedelta(hours=5), now)
    fresh_blr = score("india", 30, now - timedelta(hours=5), now)
    old_pune = score("pune", 30, now - timedelta(days=20), now)
    assert fresh_pune > fresh_blr
    assert fresh_pune > old_pune
    assert 0 <= old_pune <= 100


def test_html_to_text_and_dates():
    assert html_to_text("<p>Hello<br>World</p><ul><li>Python</li></ul>").split() == ["Hello", "World", "•", "Python"]
    assert html_to_text("<strong>AI</strong> Engineer") == "AI Engineer"
    assert html_to_text("&lt;b&gt;Bold&lt;/b&gt;") == "Bold"
    assert parse_date("2026-10-22T10:00:00Z") == datetime(2026, 10, 22, 10)
    assert parse_date(1792221898210).year == 2026
    assert parse_date("") is None
