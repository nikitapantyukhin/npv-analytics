from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./npv_analytics.sqlite3"
    redis_url: str = "redis://localhost:6379/0"
    task_mode: str = "inline"
    cfgen_bin: str = "/opt/cfgen/cfgen"
    cfgen_timeout_seconds: int = 180
    quantum_base_url: str = "http://localhost:8001"
    quantum_timeout_seconds: int = 15
    quantum_calculation_timeout_seconds: int = 90
    artifacts_dir: Path = Path("artifacts")
    cors_origins: str = "http://localhost:3000"

    nosnitches_sha: str = "77ca4571e2b355b75919efa6259b9e559c9d1121"
    quantum_sha: str = "3f0bbfee881014f2101a5beaca65d95a32156817"
    generator_version: str = "npv-generator/1.0.0"
    valuation_method: str = "NPV-CONTINUOUS-ZERO-ACT365-v1"

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
