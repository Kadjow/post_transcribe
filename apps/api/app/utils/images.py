from io import BytesIO
from pathlib import Path
from dataclasses import dataclass

from PIL import Image, ImageFilter, ImageOps


def save_image_bytes_as_png(image_bytes: bytes, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(BytesIO(image_bytes)) as image:
        image.convert("RGB").save(destination, format="PNG")


def generate_thumbnail(source: Path, destination: Path, width: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        ratio = width / max(image.width, 1)
        height = max(1, int(image.height * ratio))
        thumbnail = image.resize((width, height), Image.Resampling.LANCZOS)
        thumbnail.save(destination, format="JPEG", quality=85, optimize=True)


@dataclass(slots=True)
class OcrImageVariant:
    name: str
    image: Image.Image


def build_ocr_variants(source: Path) -> tuple[list[OcrImageVariant], bool]:
    with Image.open(source) as source_image:
        rgb = source_image.convert("RGB")
        grayscale = ImageOps.autocontrast(ImageOps.grayscale(rgb))
        threshold = _binarize(grayscale)
        sharpen = grayscale.filter(
            ImageFilter.UnsharpMask(radius=1.3, percent=180, threshold=2)
        )
        light_text_on_dark = _is_light_text_on_dark_background(grayscale)

        variants: list[OcrImageVariant] = [
            OcrImageVariant("original", rgb.copy()),
            OcrImageVariant("grayscale", grayscale.copy()),
            OcrImageVariant("grayscale_x2", _scale(grayscale, 2)),
            OcrImageVariant("grayscale_x3", _scale(grayscale, 3)),
            OcrImageVariant("threshold", threshold.copy()),
            OcrImageVariant("threshold_x2", _scale(threshold, 2)),
            OcrImageVariant("sharpen", sharpen.copy()),
            OcrImageVariant("sharpen_x2", _scale(sharpen, 2)),
        ]

        if light_text_on_dark:
            inverted = ImageOps.invert(grayscale)
            inverted_threshold = _binarize(inverted)
            variants.extend(
                [
                    OcrImageVariant("inverted", inverted.copy()),
                    OcrImageVariant("inverted_x2", _scale(inverted, 2)),
                    OcrImageVariant("inverted_threshold", inverted_threshold.copy()),
                    OcrImageVariant(
                        "inverted_threshold_x2", _scale(inverted_threshold, 2)
                    ),
                ]
            )

        return variants, light_text_on_dark


def _scale(image: Image.Image, factor: int) -> Image.Image:
    width = max(1, image.width * factor)
    height = max(1, image.height * factor)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def _is_light_text_on_dark_background(grayscale: Image.Image) -> bool:
    histogram = grayscale.histogram()[:256]
    total_pixels = max(sum(histogram), 1)
    dark_ratio = sum(histogram[:80]) / total_pixels
    bright_ratio = sum(histogram[180:]) / total_pixels
    mean_luminance = (
        sum(level * count for level, count in enumerate(histogram)) / total_pixels
    )
    return dark_ratio >= 0.45 and bright_ratio >= 0.05 and mean_luminance < 120


def _binarize(grayscale: Image.Image) -> Image.Image:
    threshold = _otsu_threshold(grayscale)
    return grayscale.point(lambda value: 255 if value >= threshold else 0, mode="L")


def _otsu_threshold(grayscale: Image.Image) -> int:
    histogram = grayscale.histogram()[:256]
    total = max(sum(histogram), 1)
    sum_total = sum(index * value for index, value in enumerate(histogram))
    sum_background = 0.0
    weight_background = 0.0
    max_variance = -1.0
    best_threshold = 128

    for threshold, value in enumerate(histogram):
        weight_background += value
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground <= 0:
            break

        sum_background += threshold * value
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        between_class_variance = (
            weight_background
            * weight_foreground
            * (mean_background - mean_foreground) ** 2
        )
        if between_class_variance > max_variance:
            max_variance = between_class_variance
            best_threshold = threshold

    return int(best_threshold)
