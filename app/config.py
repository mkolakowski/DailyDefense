from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DailyDefense"
    app_port: int = 8014
    app_host: str = "0.0.0.0"
    environment: str = "development"

    session_secret: str = "change-me"

    auth_enabled: bool = False

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8014/auth/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
