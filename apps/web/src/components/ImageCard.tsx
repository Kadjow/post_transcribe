import { useEffect, useMemo, useState } from "react";
import type { DocumentImage } from "../types/api";
import { toApiAssetUrl } from "../services/apiClient";

interface ImageCardProps {
  image: DocumentImage;
  selectable: boolean;
  selected: boolean;
  onToggleSelection: (id: string) => void;
}

export function ImageCard({
  image,
  selectable,
  selected,
  onToggleSelection
}: ImageCardProps): JSX.Element {
  const thumbnailSrc = useMemo(
    () => toApiAssetUrl(image.thumbnailUrl || image.imageUrl),
    [image.thumbnailUrl, image.imageUrl]
  );
  const originalSrc = useMemo(() => toApiAssetUrl(image.imageUrl), [image.imageUrl]);
  const [src, setSrc] = useState(thumbnailSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(thumbnailSrc);
    setFailed(false);
  }, [thumbnailSrc]);

  const handleImageError = () => {
    if (src !== originalSrc && originalSrc) {
      if (import.meta.env.DEV) {
        console.warn(
          `[ImageCard] Thumbnail failed for ${image.id}. Fallback to imageUrl.`,
          src
        );
      }
      setSrc(originalSrc);
      return;
    }
    if (import.meta.env.DEV) {
      console.warn(`[ImageCard] Image failed for ${image.id}.`, src);
    }
    setFailed(true);
  };

  return (
    <article className="image-card">
      {!failed ? (
        <img src={src} alt={`Preview ${image.id}`} loading="lazy" onError={handleImageError} />
      ) : (
        <div className="image-fallback">
          <strong>Preview unavailable</strong>
          <span className="muted">{image.id}</span>
        </div>
      )}
      <div className="stack tight">
        <div className="row between">
          <strong>{image.id}</strong>
          <span className="muted">Page {image.page}</span>
        </div>
        {selectable ? (
          <label className="row gap-sm">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelection(image.id)}
            />
            Select for OCR
          </label>
        ) : null}
      </div>
    </article>
  );
}
