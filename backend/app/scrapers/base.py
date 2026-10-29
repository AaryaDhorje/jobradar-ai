from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import httpx

from ..config import Settings

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class RawJob:
    source: str
    title: str
    company: str
    location: str
    url: str
    description: str = ""
    posted_at: Optional[datetime] = None
    remote: bool = False
    india_hint: bool = False  # source only lists Indian jobs
    salary: Optional[str] = None
    experience: Optional[str] = None
    employment_type: Optional[str] = None
    company_domain: Optional[str] = None
    company_logo: Optional[str] = None
    tags: list[str] = field(default_factory=list)


class Scraper(ABC):
    name: str
    label: str
    kind: str  # official | public | unofficial
    description: str = ""
    required_keys: tuple[str, ...] = ()  # Settings attribute names

    def __init__(self, settings: Settings):
        self.settings = settings

    def missing_keys(self) -> list[str]:
        return [k.upper() for k in self.required_keys if not getattr(self.settings, k, "")]

    @property
    def configured(self) -> bool:
        return not self.missing_keys()

    @abstractmethod
    async def fetch(self, client: httpx.AsyncClient) -> list[RawJob]:
        """Return raw jobs. Raise on total failure; swallow per-query errors where partial results make sense."""


def salary_range(lo, hi, currency: str = "₹", period: str = "") -> Optional[str]:
    def fmt(v):
        v = float(v)
        if currency == "₹" and v >= 100000:
            return f"{v / 100000:.1f} LPA".replace(".0 ", " ")
        return f"{v:,.0f}"

    lo = lo or None
    hi = hi or None
    if not lo and not hi:
        return None
    if lo and hi and float(lo) != float(hi):
        text = f"{currency}{fmt(lo)} – {currency}{fmt(hi)}"
    else:
        text = f"{currency}{fmt(lo or hi)}"
    return f"{text} {period}".strip()
