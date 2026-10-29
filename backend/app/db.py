from collections.abc import Iterator
from typing import Any

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from .config import DATA_DIR, get_settings

_settings = get_settings()
DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    _settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30} if _settings.database_url.startswith("sqlite") else {},
)

if _settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def get_setting(session: Session, key: str, default: Any = None) -> Any:
    from .models import Setting

    row = session.get(Setting, key)
    return row.value if row else default


def set_setting(session: Session, key: str, value: Any) -> None:
    from .models import Setting

    row = session.get(Setting, key)
    if row:
        row.value = value
    else:
        row = Setting(key=key, value=value)
    session.add(row)
    session.commit()
