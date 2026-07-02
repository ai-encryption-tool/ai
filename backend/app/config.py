from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Memory Vault"
    api_key: str = "dev-local-api-key-change-me"
    local_password: str = "change-me"
    database_url: str = "sqlite:///./data/memory_vault.db"
    vector_path: str = "./data/qdrant"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_mode: str = "sentence-transformers"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    cors_origin_regex: str = r"chrome-extension://.*"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def sqlite_path(self) -> Path:
        if self.database_url.startswith("sqlite:///"):
            return Path(self.database_url.replace("sqlite:///", "", 1))
        raise ValueError("Only sqlite:/// DATABASE_URL values are supported in this MVP.")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
