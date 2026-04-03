from __future__ import annotations

import re
from textwrap import wrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytesseract
from PIL import Image

from app.services.ocr.base import OcrLayoutBlock, OcrStructuredContent, OcrStructuredKind


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

    def build_structured_content(
        self, image_path: Path, layout_blocks: list[OcrLayoutBlock]
    ) -> OcrStructuredContent | None:
        if not layout_blocks:
            return None
        with Image.open(image_path) as source:
            width, height = source.size
        return self._build_structured_content(layout_blocks, width, height)

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

    def _build_structured_content(
        self, blocks: list[OcrLayoutBlock], image_width: int, image_height: int
    ) -> OcrStructuredContent | None:
        text_blocks = self._order_blocks(
            [
                block
                for block in blocks
                if block.type == "text" and self._normalize_text(block.text or "")
            ]
        )
        image_blocks = [block for block in blocks if block.type == "image"]

        if not text_blocks and not image_blocks:
            return None

        title_blocks = self._find_title_blocks(text_blocks, image_width, image_height)
        footer_blocks = self._find_footer_blocks(text_blocks, image_height)
        left_column, right_column, has_two_columns = self._split_columns(text_blocks, image_width)
        left_short_ratio = self._short_text_ratio(left_column)
        right_short_ratio = self._short_text_ratio(right_column)
        image_area_ratio = self._image_area_ratio(image_blocks, image_width, image_height)

        kind = self._classify_layout_kind(
            text_blocks=text_blocks,
            has_title=bool(title_blocks),
            has_footer=bool(footer_blocks),
            has_two_columns=has_two_columns,
            image_area_ratio=image_area_ratio,
            left_short_ratio=left_short_ratio,
            right_short_ratio=right_short_ratio,
        )

        if kind == "simple_text":
            return None

        figure_bbox, figure_side = self._estimate_figure_region(
            kind=kind,
            image_blocks=image_blocks,
            left_column=left_column,
            right_column=right_column,
            has_two_columns=has_two_columns,
            image_width=image_width,
            image_height=image_height,
        )

        main_blocks: list[OcrLayoutBlock] = []
        label_blocks: list[OcrLayoutBlock] = []
        for block in text_blocks:
            if block in title_blocks or block in footer_blocks:
                continue
            block_text = self._normalize_text(block.text or "")
            if not block_text:
                continue

            if figure_bbox is not None and self._bbox_overlap_ratio(block.bbox, figure_bbox) >= 0.24:
                if self._is_figure_label(block_text, kind):
                    label_blocks.append(block)
                    continue

            if (
                figure_side is not None
                and self._block_side(block, image_width) == figure_side
                and self._is_figure_label(block_text, kind)
            ):
                label_blocks.append(block)
                continue

            main_blocks.append(block)

        title = " ".join(self._extract_unique_text(title_blocks)) or None
        footer = " ".join(self._extract_unique_text(footer_blocks)) or None
        main_text = self._extract_unique_text(main_blocks)
        figure_labels = self._extract_unique_text(label_blocks)
        figure_detected = figure_bbox is not None or image_area_ratio >= 0.06 or kind == "diagram"
        ascii_map = self._build_ascii_map(
            kind=kind,
            title=title,
            main_text=main_text,
            figure_labels=figure_labels,
            footer=footer,
            figure_detected=figure_detected,
        )

        return OcrStructuredContent(
            kind=kind,
            title=title,
            main_text=main_text,
            figure_labels=figure_labels,
            footer=footer,
            ascii_map=ascii_map,
            figure_detected=figure_detected,
        )

    def _classify_layout_kind(
        self,
        *,
        text_blocks: list[OcrLayoutBlock],
        has_title: bool,
        has_footer: bool,
        has_two_columns: bool,
        image_area_ratio: float,
        left_short_ratio: float,
        right_short_ratio: float,
    ) -> OcrStructuredKind:
        if not text_blocks and image_area_ratio >= 0.02:
            return "diagram"

        max_short_ratio = max(left_short_ratio, right_short_ratio)
        if has_title and (has_two_columns or image_area_ratio >= 0.06 or has_footer):
            return "slide"
        if has_two_columns and (image_area_ratio >= 0.05 or max_short_ratio >= 0.5):
            return "mixed_page"
        if image_area_ratio >= 0.15 and max_short_ratio >= 0.45:
            return "diagram"
        return "simple_text"

    def _find_title_blocks(
        self,
        text_blocks: list[OcrLayoutBlock],
        image_width: int,
        image_height: int,
    ) -> list[OcrLayoutBlock]:
        if not text_blocks:
            return []

        title_zone = max(60, int(image_height * 0.22))
        candidates = [
            block
            for block in text_blocks
            if int(block.bbox[1]) <= title_zone and len(self._normalize_text(block.text or "")) >= 10
        ]
        if not candidates:
            return []

        highlighted = [
            block
            for block in candidates
            if int(block.bbox[2]) >= int(image_width * 0.35)
            or len(self._normalize_text(block.text or "")) >= 24
        ]
        anchor = highlighted[0] if highlighted else candidates[0]
        anchor_y = int(anchor.bbox[1])
        line_tolerance = max(24, int(image_height * 0.03))
        return [
            block
            for block in candidates
            if abs(int(block.bbox[1]) - anchor_y) <= line_tolerance
        ]

    def _find_footer_blocks(
        self, text_blocks: list[OcrLayoutBlock], image_height: int
    ) -> list[OcrLayoutBlock]:
        if not text_blocks:
            return []
        footer_start = int(image_height * 0.88)
        return [
            block
            for block in text_blocks
            if int(block.bbox[1]) + int(block.bbox[3]) >= footer_start
            and len(self._normalize_text(block.text or "")) <= 140
        ]

    def _split_columns(
        self, text_blocks: list[OcrLayoutBlock], image_width: int
    ) -> tuple[list[OcrLayoutBlock], list[OcrLayoutBlock], bool]:
        if image_width <= 0:
            return ([], [], False)
        split_x = image_width * 0.5
        left = []
        right = []
        for block in text_blocks:
            x, _, width, _ = block.bbox
            center = int(x) + (int(width) / 2)
            if center <= split_x:
                left.append(block)
            else:
                right.append(block)

        left_chars = sum(len(self._normalize_text(block.text or "")) for block in left)
        right_chars = sum(len(self._normalize_text(block.text or "")) for block in right)
        has_two_columns = len(left) >= 3 and len(right) >= 3 and left_chars >= 30 and right_chars >= 30
        return left, right, has_two_columns

    @staticmethod
    def _image_area_ratio(
        image_blocks: list[OcrLayoutBlock], image_width: int, image_height: int
    ) -> float:
        total_area = max(image_width * image_height, 1)
        area = 0
        for block in image_blocks:
            _, _, width, height = block.bbox
            area += max(int(width), 0) * max(int(height), 0)
        return min(area / total_area, 1.0)

    def _short_text_ratio(self, blocks: list[OcrLayoutBlock]) -> float:
        if not blocks:
            return 0.0
        short_count = 0
        for block in blocks:
            text = self._normalize_text(block.text or "")
            if self._looks_like_short_line(text):
                short_count += 1
        return short_count / len(blocks)

    def _estimate_figure_region(
        self,
        *,
        kind: OcrStructuredKind,
        image_blocks: list[OcrLayoutBlock],
        left_column: list[OcrLayoutBlock],
        right_column: list[OcrLayoutBlock],
        has_two_columns: bool,
        image_width: int,
        image_height: int,
    ) -> tuple[tuple[int, int, int, int] | None, str | None]:
        total_area = max(image_width * image_height, 1)
        middle_images = []
        for block in image_blocks:
            x, y, width, height = [int(part) for part in block.bbox]
            area = max(width, 0) * max(height, 0)
            if area < int(total_area * 0.03):
                continue
            if y <= int(image_height * 0.12):
                continue
            if y + height >= int(image_height * 0.92):
                continue
            middle_images.append(block)
        if middle_images:
            candidate = max(
                middle_images,
                key=lambda block: int(block.bbox[2]) * int(block.bbox[3]),
            )
            return tuple(int(part) for part in candidate.bbox), None

        if has_two_columns:
            left_short = self._short_text_ratio(left_column)
            right_short = self._short_text_ratio(right_column)
            left_chars = sum(
                len(self._normalize_text(block.text or "")) for block in left_column
            )
            right_chars = sum(
                len(self._normalize_text(block.text or "")) for block in right_column
            )
            if right_short >= 0.45 and (right_short - left_short) >= 0.15 and right_chars <= (
                left_chars * 1.1
            ):
                x = int(image_width * 0.52)
                return (
                    x,
                    int(image_height * 0.14),
                    max(image_width - x, 0),
                    int(image_height * 0.74),
                ), "right"
            if left_short >= 0.45 and (left_short - right_short) >= 0.15 and left_chars <= (
                right_chars * 1.1
            ):
                width = int(image_width * 0.48)
                return (0, int(image_height * 0.14), width, int(image_height * 0.74)), "left"

        if kind == "diagram":
            return (
                int(image_width * 0.08),
                int(image_height * 0.12),
                int(image_width * 0.84),
                int(image_height * 0.72),
            ), None
        return None, None

    @staticmethod
    def _bbox_overlap_ratio(
        bbox_a: tuple[int, int, int, int], bbox_b: tuple[int, int, int, int]
    ) -> float:
        ax, ay, aw, ah = [int(part) for part in bbox_a]
        bx, by, bw, bh = [int(part) for part in bbox_b]
        if aw <= 0 or ah <= 0 or bw <= 0 or bh <= 0:
            return 0.0

        inter_left = max(ax, bx)
        inter_top = max(ay, by)
        inter_right = min(ax + aw, bx + bw)
        inter_bottom = min(ay + ah, by + bh)
        if inter_right <= inter_left or inter_bottom <= inter_top:
            return 0.0

        intersection = (inter_right - inter_left) * (inter_bottom - inter_top)
        block_area = aw * ah
        return intersection / max(block_area, 1)

    @staticmethod
    def _block_side(block: OcrLayoutBlock, image_width: int) -> str:
        x, _, width, _ = [int(part) for part in block.bbox]
        center = x + (width / 2)
        return "left" if center <= image_width * 0.5 else "right"

    def _extract_unique_text(self, blocks: list[OcrLayoutBlock]) -> list[str]:
        seen: set[str] = set()
        lines: list[str] = []
        for block in self._order_blocks(blocks):
            text = self._normalize_text(block.text or "")
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            lines.append(text)
        return lines

    @staticmethod
    def _looks_like_short_line(text: str) -> bool:
        if not text:
            return False
        words = re.findall(r"[A-Za-z0-9]+", text)
        if not words:
            return False
        if len(words) <= 3:
            return True
        if len(text) <= 26 and len(words) <= 6:
            return True
        if re.search(r"[%><=+/|\\-]", text) and len(words) <= 8:
            return True
        return False

    def _is_figure_label(self, text: str, kind: OcrStructuredKind) -> bool:
        if kind == "diagram":
            return True
        if self._looks_like_short_line(text):
            return True
        return len(text) <= 44 and bool(re.search(r"\d|[%><=+/\\-]", text))

    def _build_ascii_map(
        self,
        *,
        kind: OcrStructuredKind,
        title: str | None,
        main_text: list[str],
        figure_labels: list[str],
        footer: str | None,
        figure_detected: bool,
    ) -> str | None:
        if kind not in {"slide", "diagram", "mixed_page"}:
            return None

        full_width = 64
        content_width = full_width - 3
        border = "+" + ("-" * (full_width - 2)) + "+"

        def section_rows(label: str, lines: list[str]) -> list[str]:
            rows = [f"| {label:<{content_width}}|"]
            display_lines = lines or ["- (sem dados)"]
            for line in display_lines:
                normalized = self._normalize_text(line)
                if not normalized:
                    continue
                wrapped = wrap(normalized, width=content_width) or [normalized]
                for chunk in wrapped:
                    rows.append(f"| {chunk:<{content_width}}|")
            return rows

        rows: list[str] = [border]
        rows.extend(section_rows("TITULO", [title] if title else ["- (nao identificado)"]))
        rows.append(border)

        left_width = 30
        right_width = 29
        if figure_detected:
            left_lines = [f"- {text}" for text in main_text[:5]]
            right_lines = ["[imagem detectada]"] + [f"- {text}" for text in figure_labels[:5]]
            left_wrapped = self._wrap_column_lines(left_lines or ["- (sem texto principal)"], left_width)
            right_wrapped = self._wrap_column_lines(
                right_lines or ["- (sem rotulos)"], right_width
            )
            total_rows = max(len(left_wrapped), len(right_wrapped))

            rows.append(f"| {'TEXTO PRINCIPAL':<{left_width}}| {'FIGURA / DIAGRAMA':<{right_width}}|")
            for idx in range(total_rows):
                left_chunk = left_wrapped[idx] if idx < len(left_wrapped) else ""
                right_chunk = right_wrapped[idx] if idx < len(right_wrapped) else ""
                rows.append(f"| {left_chunk:<{left_width}}| {right_chunk:<{right_width}}|")
        else:
            rows.extend(section_rows("TEXTO PRINCIPAL", [f"- {text}" for text in main_text[:8]]))

        rows.append(border)
        rows.extend(section_rows("RODAPE", [footer] if footer else ["- (nao identificado)"]))
        rows.append(border)

        return "\n".join(rows)

    def _wrap_column_lines(self, lines: list[str], width: int) -> list[str]:
        wrapped_lines: list[str] = []
        for line in lines:
            normalized = self._normalize_text(line)
            if not normalized:
                continue
            chunks = wrap(normalized, width=width) or [normalized]
            wrapped_lines.extend(chunks)
        return wrapped_lines
