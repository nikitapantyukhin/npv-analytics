import os
import tempfile
from pathlib import Path

_test_root = Path(tempfile.mkdtemp(prefix="npv-analytics-pytest-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_test_root / 'test.sqlite3'}"
os.environ["ARTIFACTS_DIR"] = str(_test_root / "artifacts")

import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.core.config import get_settings
from app.db import Base, engine


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client
