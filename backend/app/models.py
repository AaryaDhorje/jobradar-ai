from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import NaiveDatetime

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Company(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    norm_name: str = Field(index=True, unique=True)
    domain: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    summary: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    interview: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    insights_updated_at: Optional[NaiveDatetime] = None
    contacts_checked_at: Optional[NaiveDatetime] = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class Job(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    fingerprint: str = Field(index=True, unique=True)
    title: str
    company_id: int = Field(foreign_key="company.id", index=True)
    location: str = ""
    location_tag: str = Field(index=True)  # pune | india | remote
    remote: bool = False
    url: str
    sources: list[dict[str, str]] = Field(default_factory=list, sa_column=Column(JSON))
    description: str = Field(default="", sa_column=Column(Text))
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    posted_at: Optional[NaiveDatetime] = Field(default=None, index=True)
    first_seen_at: NaiveDatetime = Field(default_factory=utcnow, index=True)
    last_seen_at: NaiveDatetime = Field(default_factory=utcnow)
    first_seen_run_id: Optional[int] = Field(default=None, index=True)
    salary: Optional[str] = None
    experience: Optional[str] = None
    employment_type: Optional[str] = None
    relevance: int = 0
    score: int = Field(default=0, index=True)
    status: Optional[str] = Field(default=None, index=True)  # saved | applied | hidden


class Contact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    job_id: Optional[int] = Field(default=None, index=True)  # set when the email came from that job's post
    email: str
    name: Optional[str] = None
    position: Optional[str] = None
    source: str  # job_post | hunter | website | pattern
    confidence: str  # verified | high | medium | guessed
    note: Optional[str] = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class ScanRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    started_at: NaiveDatetime = Field(default_factory=utcnow)
    finished_at: Optional[NaiveDatetime] = None
    status: str = "running"  # running | done | failed
    trigger: str = "manual"  # manual | scheduled
    total_found: int = 0
    new_jobs: int = 0
    sources: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Resume(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    text: str = Field(sa_column=Column(Text))
    uploaded_at: NaiveDatetime = Field(default_factory=utcnow)


class ResumeAdvice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: int = Field(index=True)
    resume_id: Optional[int] = Field(default=None, index=True)
    advice: dict[str, Any] = Field(sa_column=Column(JSON))
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: Any = Field(sa_column=Column(JSON))
