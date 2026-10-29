"""Daily scan schedule (Asia/Kolkata by default) plus a catch-up scan if the PC was off at scan time."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session

from .config import get_settings
from .db import engine, get_setting
from .models import utcnow
from .scan import latest_done_run, run_scan

log = logging.getLogger(__name__)
JOB_ID = "daily-scan"
scheduler = AsyncIOScheduler(timezone=get_settings().timezone)


def current_scan_time() -> str:
    with Session(engine) as session:
        return get_setting(session, "scan_time", get_settings().default_scan_time)


def _trigger(scan_time: str) -> CronTrigger:
    hour, minute = (int(x) for x in scan_time.split(":"))
    return CronTrigger(hour=hour, minute=minute, timezone=get_settings().timezone)


async def _scheduled_scan() -> None:
    await run_scan("scheduled")


def start() -> None:
    scheduler.add_job(_scheduled_scan, _trigger(current_scan_time()), id=JOB_ID, replace_existing=True,
                      coalesce=True, misfire_grace_time=6 * 3600)
    scheduler.start()
    asyncio.get_event_loop().create_task(_catch_up())


async def _catch_up() -> None:
    """If no successful scan in the last 24h (PC was off / app not running), scan now."""
    with Session(engine) as session:
        last = latest_done_run(session)
    if last is None or (last.finished_at and utcnow() - last.finished_at > timedelta(hours=24)):
        log.info("no scan in the last 24h — running catch-up scan")
        await asyncio.sleep(5)
        await run_scan("scheduled")


def reschedule(scan_time: str) -> None:
    if scheduler.running:
        scheduler.reschedule_job(JOB_ID, trigger=_trigger(scan_time))


def next_run_at() -> Optional[datetime]:
    job = scheduler.get_job(JOB_ID) if scheduler.running else None
    return job.next_run_time if job else None


def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
