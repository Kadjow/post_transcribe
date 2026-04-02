from pathlib import Path

from app.utils.images import save_image_bytes_as_png


class ImageService:
    def save_extracted_image(self, image_bytes: bytes, output_path: Path) -> None:
        save_image_bytes_as_png(image_bytes, output_path)
