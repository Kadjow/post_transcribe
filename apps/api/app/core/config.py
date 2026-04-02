from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8-sig", extra="ignore"
    )

    app_name: str = "PDF Vision OCR API"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    allowed_origins: str = "http://localhost:5173"
    ocr_default_languages: str = "por+eng"
    tesseract_cmd: str | None = None
    max_upload_size_mb: int = 200

    @property
    def storage_root(self) -> Path:
        return Path(__file__).resolve().parents[2] / "storage"

    @property
    def uploads_dir(self) -> Path:
        return self.storage_root / "uploads"

    @property
    def extracted_dir(self) -> Path:
        return self.storage_root / "extracted"

    @property
    def thumbnails_dir(self) -> Path:
        return self.storage_root / "thumbnails"

    @property
    def results_dir(self) -> Path:
        return self.storage_root / "results"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
