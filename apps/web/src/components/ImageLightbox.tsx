import { useEffect } from "react";
import type { DocumentImage } from "../types/api";
import { toApiAssetUrl } from "../services/apiClient";

interface ImageLightboxProps {
  image: DocumentImage | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ image, isOpen, onClose }: ImageLightboxProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !image) {
    return null;
  }

  return (
    <div className="lightbox-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lightbox-content"
        role="dialog"
        aria-modal="true"
        aria-label={`Visualizacao ampliada da imagem ${image.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lightbox-header">
          <p className="lightbox-title">
            {image.id} | Pagina {image.page}
          </p>
          <button type="button" className="lightbox-close" onClick={onClose}>
            Fechar
          </button>
        </div>
        <img src={toApiAssetUrl(image.imageUrl)} alt={`Visualizacao ampliada ${image.id}`} />
      </div>
    </div>
  );
}
