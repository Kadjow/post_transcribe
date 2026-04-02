from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytesseract
from PIL import Image

from app.services.ocr.base import OcrLayoutBlock


@dataclass(slots=True)
class _TextAccumulator:
    x1: int
    y1: int
    x2: int
    y2: int
    tokens: list[str]

    def merge_token(self, x: int, y: int, w: int, h: int, token: str) -> None:
        self.x1 = min(self.x1, x)
        self.y1 = min(self.y1, y)
        self.x2 = max(self.x2, x + w)
        self.y2 = max(self.y2, y + h)
        self.tokens.append(token)


class LayoutStructureService:
    def extract_blocks(self, image_path: Path, languages: str) -> list[OcrLayoutBlock]:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
            width, height = image.size
            data = pytesseract.image_to_data(
                image,
                lang=languages,
                config="--oem 3 --psm 11",
                output_type=pytesseract.Output.DICT,
            )

            text_blocks = self._build_text_blocks(data)
            image_blocks = self._build_image_blocks(image, text_blocks, width, height)
            merged_blocks = text_blocks + image_blocks
            ordered_blocks = self._order_blocks(merged_blocks)

            if ordered_blocks:
                return ordered_blocks

            if self._has_visual_content(image):
                return [
                    OcrLayoutBlock(
                        type="image",
                        bbox=(0, 0, width, height),
                    )
                ]

            return []

    def _build_text_blocks(self, data: dict[str, Any]) -> list[OcrLayoutBlock]:
        words = data.get("text", []) or []
        if not words:
            return []

        lefts = data.get("left", []) or []
        tops = data.get("top", []) or []
        widths = data.get("width", []) or []
        heights = data.get("height", []) or []
        confs = data.get("conf", []) or []
        block_nums = data.get("block_num", []) or []
        par_nums = data.get("par_num", []) or []
        line_nums = data.get("line_num", []) or []

        grouped: dict[tuple[int, int, int], _TextAccumulator] = {}
        for idx, raw_word in enumerate(words):
            token = str(raw_word).strip()
            if not token:
                continue

            confidence = self._to_float(confs, idx)
            if confidence is not None and confidence < 0:
                continue

            x = self._to_int(lefts, idx)
            y = self._to_int(tops, idx)
            w = self._to_int(widths, idx)
            h = self._to_int(heights, idx)
            if w <= 0 or h <= 0:
                continue

            key = (
                self._to_int(block_nums, idx),
                self._to_int(par_nums, idx),
                self._to_int(line_nums, idx),
            )
            if key not in grouped:
                grouped[key] = _TextAccumulator(
                    x1=x,
                    y1=y,
                    x2=x + w,
                    y2=y + h,
                    tokens=[token],
                )
                continue
            grouped[key].merge_token(x, y, w, h, token)

        blocks: list[OcrLayoutBlock] = []
        for accumulator in grouped.values():
            normalized_text = self._normalize_text(" ".join(accumulator.tokens))
            if not normalized_text:
                continue
            blocks.append(
                OcrLayoutBlock(
                    type="text",
                    bbox=(
                        accumulator.x1,
                        accumulator.y1,
                        max(accumulator.x2 - accumulator.x1, 0),
                        max(accumulator.y2 - accumulator.y1, 0),
                    ),
                    text=normalized_text,
                )
            )
        return blocks

    def _build_image_blocks(
        self,
        image: Image.Image,
        text_blocks: list[OcrLayoutBlock],
        image_width: int,
        image_height: int,
    ) -> list[OcrLayoutBlock]:
        if image_width <= 0 or image_height <= 0:
            return []

        if not text_blocks:
            return []

        ordered_text = self._order_blocks(text_blocks)
        min_gap_height = max(30, int(image_height * 0.06))
        image_blocks: list[OcrLayoutBlock] = []

        cursor_y = 0
        for block in ordered_text:
            top = max(int(block.bbox[1]), 0)
            if top - cursor_y >= min_gap_height:
                gap_bbox = (0, cursor_y, image_width, top - cursor_y)
                if self._region_has_visual_content(image, gap_bbox):
                    image_blocks.append(OcrLayoutBlock(type="image", bbox=gap_bbox))
            cursor_y = max(cursor_y, top + int(block.bbox[3]))

        if image_height - cursor_y >= min_gap_height:
            gap_bbox = (0, cursor_y, image_width, image_height - cursor_y)
            if self._region_has_visual_content(image, gap_bbox):
                image_blocks.append(OcrLayoutBlock(type="image", bbox=gap_bbox))

        return image_blocks

    @staticmethod
    def _order_blocks(blocks: list[OcrLayoutBlock]) -> list[OcrLayoutBlock]:
        return sorted(blocks, key=lambda block: (int(block.bbox[1]), int(block.bbox[0])))

    @staticmethod
    def _normalize_text(text: str) -> str:
        compact = re.sub(r"\s+", " ", text).strip()
        return compact

    @staticmethod
    def _to_int(values: list[Any], index: int) -> int:
        if index >= len(values):
            return 0
        try:
            return int(float(values[index]))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _to_float(values: list[Any], index: int) -> float | None:
        if index >= len(values):
            return None
        try:
            return float(values[index])
        except (TypeError, ValueError):
            return None

    def _region_has_visual_content(
        self, image: Image.Image, bbox: tuple[int, int, int, int]
    ) -> bool:
        x, y, width, height = bbox
        if width <= 0 or height <= 0:
            return False
        crop = image.crop((x, y, x + width, y + height))
        return self._has_visual_content(crop)

    @staticmethod
    def _has_visual_content(region: Image.Image) -> bool:
        grayscale = region.convert("L")
        histogram = grayscale.histogram()
        total_pixels = sum(histogram)
        if total_pixels <= 0:
            return False

        bright_pixels = sum(histogram[245:])
        dark_ratio = 1.0 - (bright_pixels / total_pixels)
        extrema = grayscale.getextrema()
        contrast = float(extrema[1] - extrema[0]) if extrema else 0.0

        if dark_ratio >= 0.03:
            return True
        return dark_ratio >= 0.015 and contrast >= 35
