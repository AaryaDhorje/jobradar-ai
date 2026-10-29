"""Pure functions that turn raw scraped jobs into clean, de-duplicated, ranked jobs."""

import hashlib
import html
import re
from datetime import datetime, timezone
from typing import Optional

from bs4 import BeautifulSoup

# ---------------------------------------------------------------- AI relevance

# Terms that make a job "AI" when they appear in the title.
_TITLE_TERMS = [
    r"ai", r"a\.i\.", r"artificial intelligence", r"machine learning", r"ml", r"deep learning",
    r"data scien\w*", r"nlp", r"natural language", r"computer vision", r"vision engineer", r"llms?",
    r"gen ?ai", r"generative", r"ml ?ops", r"llm ?ops", r"applied scientist", r"research scientist",
    r"prompt engineer\w*", r"rag", r"agentic", r"ai/ml", r"ai-ml", r"conversational", r"speech",
    r"recommendation systems?", r"reinforcement learning", r"neural", r"pytorch", r"tensorflow",
    r"chatbot", r"langchain", r"data annotat\w*", r"ai trainer", r"intelligent automation",
    r"cognitive", r"predictive model\w*", r"model (?:training|evaluation)", r"multimodal",
]
# Terms that count only when several appear in the description/tags.
_BODY_TERMS = _TITLE_TERMS + [
    r"transformers?", r"hugging ?face", r"scikit-learn", r"sklearn", r"keras", r"xgboost",
    r"fine-?tun\w*", r"embeddings?", r"vector (?:db|database|store)s?", r"openai", r"gpt",
    r"diffusion", r"yolo", r"opencv", r"bert", r"sagemaker", r"vertex ai", r"mlflow",
]

_TITLE_RE = [re.compile(rf"(?<![\w/]){t}(?![\w])", re.I) for t in _TITLE_TERMS]
_BODY_RE = [re.compile(rf"(?<![\w/]){t}(?![\w])", re.I) for t in _BODY_TERMS]


def relevance(title: str, description: str = "", tags: list[str] | None = None) -> int:
    """0-40. 0 means not an AI job."""
    title_hits = sum(1 for r in _TITLE_RE if r.search(title))
    body = f"{description}\n{' '.join(tags or [])}"
    body_hits = sum(1 for r in _BODY_RE if r.search(body))
    if title_hits:
        return min(40, 28 + 4 * (title_hits - 1) + min(body_hits, 4))
    if body_hits >= 4:
        return min(24, 8 + 2 * body_hits)
    return 0


# ---------------------------------------------------------------- location

_PUNE = ["pune", "pimpri", "chinchwad", "hinjewadi", "hinjawadi", "kharadi", "magarpatta", "baner",
         "wakad", "viman nagar", "hadapsar", "yerwada", "kalyani nagar", "talawade", "punë"]
_INDIA = [
    "india", "bangalore", "bengaluru", "mumbai", "navi mumbai", "thane", "hyderabad", "secunderabad",
    "chennai", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "greater noida", "ncr", "kolkata",
    "ahmedabad", "gandhinagar", "jaipur", "kochi", "cochin", "trivandrum", "thiruvananthapuram",
    "coimbatore", "indore", "chandigarh", "mohali", "nagpur", "nashik", "bhubaneswar", "vadodara",
    "surat", "lucknow", "mysore", "mysuru", "mangalore", "mangaluru", "visakhapatnam", "vizag", "goa",
    "bhopal", "kanpur", "patna", "ranchi", "dehradun", "madurai", "vijayawada", "guwahati",
    "karnataka", "maharashtra", "telangana", "tamil nadu", "kerala", "gujarat", "haryana",
    "uttar pradesh", "west bengal", "rajasthan", "andhra pradesh", "odisha", "madhya pradesh", "punjab",
]
_REMOTE_WORDS = ["remote", "anywhere", "worldwide", "work from home", "wfh", "global", "distributed"]
_REMOTE_OK_REGIONS = ["india", "asia", "apac", "worldwide", "anywhere", "global", "south asia"]


def _has(text: str, words: list[str]) -> Optional[str]:
    for w in words:
        if re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", text):
            return w
    return None


def classify_location(location: str, remote: bool = False, india_hint: bool = False) -> tuple[Optional[str], Optional[str]]:
    """Return (tag, primary_city). tag is pune | india | remote, or None if the job is outside scope.

    india_hint: the source only lists Indian jobs, so an unknown/empty location still counts as India.
    """
    loc = (location or "").lower()
    if _has(loc, _PUNE):
        return "pune", "pune"
    city = _has(loc, _INDIA)
    is_remote = remote or bool(_has(loc, _REMOTE_WORDS))
    if is_remote:
        # A bare "Remote" from a non-Indian board may be US-only, so require an India-compatible signal.
        if city or india_hint or _has(loc, _REMOTE_OK_REGIONS):
            return "remote", "remote"
        return None, None
    if city:
        return "india", city
    if india_hint:
        return "india", (loc.split(",")[0].strip() or "india")
    return None, None


# ---------------------------------------------------------------- dedupe

_COMPANY_SUFFIX = re.compile(
    r"\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|technologies|technology|"
    r"tech|solutions|services|software|labs|india|global|group|systems|plc|gmbh)\b\.?",
    re.I,
)


def norm_company(name: str) -> str:
    n = html.unescape(name or "").lower().replace("&", " and ")
    n = re.sub(r"\(.*?\)", " ", n)
    n = _COMPANY_SUFFIX.sub(" ", n)
    n = re.sub(r"[^a-z0-9]+", " ", n).strip()
    return n or (name or "").strip().lower() or "unknown"


def norm_title(title: str, company: str = "") -> str:
    t = html.unescape(title or "").lower()
    comp = (company or "").lower().strip()
    if comp and t.startswith(comp):
        t = t[len(comp):]
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", t)
    # Hirist-style "Company - Title - Skill/Skill": keep the longest segment containing an AI term.
    parts = [p.strip() for p in re.split(r"\s+[-|–]\s+", t) if p.strip()]
    if len(parts) > 1:
        ai_parts = [p for p in parts if relevance(p)]
        t = (ai_parts or parts)[0]
    t = re.sub(r"\b(sr|snr)\b\.?", "senior", t)
    t = re.sub(r"\b(jr)\b\.?", "junior", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t


def fingerprint(company: str, title: str, city: str) -> str:
    key = f"{norm_company(company)}|{norm_title(title, company)}|{city}"
    return hashlib.sha1(key.encode()).hexdigest()


# ---------------------------------------------------------------- scoring

_LOCATION_POINTS = {"pune": 40, "remote": 25, "india": 20}


def score(tag: str, rel: int, posted_at: Optional[datetime], now: Optional[datetime] = None) -> int:
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    if posted_at is None:
        fresh = 8
    else:
        age = (now - posted_at).total_seconds() / 86400
        fresh = 20 if age <= 1 else 15 if age <= 3 else 10 if age <= 7 else 5 if age <= 14 else 0
    return min(100, _LOCATION_POINTS.get(tag, 0) + rel + fresh)


# ---------------------------------------------------------------- text helpers

_BLOCK_TAGS = ["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "section"]


def html_to_text(raw: str) -> str:
    if not raw:
        return ""
    if "<" not in raw and "&lt;" in raw:
        raw = html.unescape(raw)
    if "<" not in raw:
        return html.unescape(raw).strip()
    soup = BeautifulSoup(raw, "lxml")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(_BLOCK_TAGS):  # line breaks only around block elements, not <b>/<span>
        block.insert_before("\n")
        block.insert_after("\n")
    for li in soup.find_all("li"):
        li.insert(0, "• ")
    text = soup.get_text()
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


def snippet(text: str, length: int = 220) -> str:
    flat = re.sub(r"\s+", " ", text or "").strip()
    return flat if len(flat) <= length else flat[:length].rsplit(" ", 1)[0] + "…"


def to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def parse_date(value) -> Optional[datetime]:
    """Accept ISO strings, epoch seconds/milliseconds, or datetimes."""
    if value in (None, "", 0):
        return None
    if isinstance(value, datetime):
        return to_naive_utc(value)
    if isinstance(value, (int, float)):
        ts = value / 1000 if value > 1e11 else value
        return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
    s = str(value).strip()
    if s.isdigit():
        return parse_date(int(s))
    try:
        return to_naive_utc(datetime.fromisoformat(s.replace("Z", "+00:00")))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%a, %d %b %Y %H:%M:%S %z", "%d %b %Y"):
        try:
            return to_naive_utc(datetime.strptime(s, fmt))
        except ValueError:
            continue
    return None
