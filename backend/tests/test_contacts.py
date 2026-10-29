import httpx
import pytest
import respx

from app.contacts import HR_HINT, clean_domain, extract_emails, website_contacts


@pytest.mark.parametrize("local,is_hr", [
    ("hr", True), ("hr.india", True), ("careers", True), ("jobs", True), ("talent.acquisition", True),
    ("recruitment", True), ("india-hr", True), ("data", False), ("info", False), ("webmaster", False),
    ("chris", False),
])
def test_hr_hint(local, is_hr):
    assert bool(HR_HINT.search(local)) is is_hr


def test_extract_emails_filters_junk():
    text = "Send CV to careers@acme.ai or HR@Acme.ai. noreply@acme.ai logo@2x.png support@acme.ai"
    assert extract_emails(text) == ["careers@acme.ai", "hr@acme.ai"]


@pytest.mark.parametrize("raw,expected", [
    ("https://www.acme.ai/careers", "acme.ai"),
    ("acme.ai", "acme.ai"),
    ("gmail.com", None),
    ("not a domain", None),
    (None, None),
])
def test_clean_domain(raw, expected):
    assert clean_domain(raw) == expected


@respx.mock
async def test_website_contacts_prefers_hr_inboxes():
    respx.get(url__regex=r"https://acme\.ai.*").mock(
        return_value=httpx.Response(200, text="Contact sales@acme.ai, info@acme.ai or join us: talent@acme.ai")
    )
    async with httpx.AsyncClient() as client:
        found = await website_contacts(client, "acme.ai")
    emails = [c["email"] for c in found]
    assert emails[0] == "talent@acme.ai"
    assert "sales@acme.ai" not in emails  # filtered as non-HR junk
    assert all(c["confidence"] == "medium" and c["source"] == "website" for c in found)
