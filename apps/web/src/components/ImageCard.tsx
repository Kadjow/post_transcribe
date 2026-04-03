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
          `[ImageCard] Falha na miniatura de ${image.id}. Usando imageUrl como fallback.`,
          src
        );
      }
      setSrc(originalSrc);
      return;
    }
    if (import.meta.env.DEV) {
      console.warn(`[ImageCard] Falha ao carregar imagem ${image.id}.`, src);
    }
    setFailed(true);
  };

  return (
    <article className="image-card">
      {!failed ? (
        <img src={src} alt={`Miniatura ${image.id}`} loading="lazy" onError={handleImageError} />
      ) : (
        <div className="image-fallback">
          <strong>Miniatura indisponivel</strong>
          <span className="muted">{image.id}</span>
        </div>
      )}
      <div className="stack tight">
        <div className="row between">
          <strong>{image.id}</strong>
          <span className="muted">Pagina {image.page}</span>
        </div>
        {selectable ? (
          <label className="row gap-sm">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelection(image.id)}
            />
            Selecionar para transcricao
          </label>
        ) : null}
      </div>
    </article>
  );
}
