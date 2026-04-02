from pathlib import Path

from app.utils.images import generate_thumbnail


class ThumbnailService:
    def create_thumbnail(self, source_path: Path, output_path: Path, width: int) -> None:
        generate_thumbnail(source_path, output_path, width)
