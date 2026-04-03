from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://post-transcribe-web.vercel.app",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8-sig", extra="ignore"
    )

    app_name: str = "pdf transcribe API"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    allowed_origins: str = ",".join(BASE_ALLOWED_ORIGINS)
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
        normalized: list[str] = []
        seen: set[str] = set()

        combined_origins = [*BASE_ALLOWED_ORIGINS, *self.allowed_origins.split(",")]
        for raw_origin in combined_origins:
            origin = raw_origin.strip()
            if not origin:
                continue

            parsed = urlsplit(origin)
            if parsed.scheme and parsed.netloc:
                candidate = f"{parsed.scheme}://{parsed.netloc}"
            else:
                candidate = origin.rstrip("/")

            if candidate in seen:
                continue

            seen.add(candidate)
            normalized.append(candidate)

        return normalized


@lru_cache
def get_settings() -> Settings:
    return Settings()
