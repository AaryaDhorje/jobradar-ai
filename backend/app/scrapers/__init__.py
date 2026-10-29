from ..config import Settings
from .ats import (AshbyScraper, GreenhouseScraper, LeverScraper, SmartRecruitersScraper, WorkableScraper,
                  WorkdayScraper)
from .base import RawJob, Scraper
from .boards import HiristScraper, LinkedInScraper, NaukriScraper, RemoteOKScraper, RemotiveScraper
from .official import AdzunaScraper, JoobleScraper, JSearchScraper

SCRAPER_CLASSES: list[type[Scraper]] = [
    AdzunaScraper, JoobleScraper, JSearchScraper,
    GreenhouseScraper, LeverScraper, AshbyScraper, WorkableScraper, SmartRecruitersScraper, WorkdayScraper,
    RemotiveScraper, RemoteOKScraper,
    HiristScraper, LinkedInScraper, NaukriScraper,
]


def all_scrapers(settings: Settings) -> list[Scraper]:
    return [cls(settings) for cls in SCRAPER_CLASSES]


def get_scraper(name: str, settings: Settings) -> Scraper | None:
    base = name.split(":")[0]
    return next((cls(settings) for cls in SCRAPER_CLASSES if cls.name == base), None)


__all__ = ["RawJob", "Scraper", "SCRAPER_CLASSES", "all_scrapers", "get_scraper"]
