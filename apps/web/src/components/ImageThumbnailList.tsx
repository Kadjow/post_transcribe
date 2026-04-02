import type { DocumentImage } from "../types/api";
import { toApiAssetUrl } from "../services/apiClient";

interface ImageThumbnailListProps {
  images: DocumentImage[];
  activeImageId: string | null;
  selectedIds?: string[];
  onSelectImage: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  showSelection?: boolean;
  showOcrStatus?: boolean;
}

function statusMeta(
  status: DocumentImage["ocr"]["status"]
): { label: string; className: string; icon: string; showSpinner: boolean } {
  if (status === "DONE") {
    return { label: "Done", className: "is-done", icon: "v", showSpinner: false };
  }
  if (status === "NOT_REQUESTED") {
    return { label: "Not requested", className: "is-not-requested", icon: "-", showSpinner: false };
  }
  if (status === "PENDING") {
    return { label: "Processing", className: "is-processing", icon: "...", showSpinner: true };
  }
  if (status === "ERROR") {
    return { label: "Error", className: "is-error", icon: "X", showSpinner: false };
  }
  if (status === "LOW_CONFIDENCE") {
    return { label: "Low confidence", className: "is-warning", icon: "!", showSpinner: false };
  }
  if (status === "NO_TEXT") {
    return { label: "No text", className: "is-warning", icon: "!", showSpinner: false };
  }
  return { label: status, className: "is-not-requested", icon: "-", showSpinner: false };
}

export function ImageThumbnailList({
  images,
  activeImageId,
  selectedIds = [],
  onSelectImage,
  onToggleSelection,
  showSelection = false,
  showOcrStatus = false
}: ImageThumbnailListProps): JSX.Element {
  if (images.length === 0) {
    return <p className="card">Nenhuma imagem encontrada para este documento.</p>;
  }

  return (
    <aside className="card thumbnail-pane">
      <div className="thumbnail-pane-header row between">
        <h3>Imagens</h3>
        <span className="muted">{images.length} itens</span>
      </div>
      <div className="thumbnail-list">
        {images.map((image) => {
          const isActive = image.id === activeImageId;
          const isSelected = selectedIds.includes(image.id);
          const meta = statusMeta(image.ocr.status);

          return (
            <button
              key={image.id}
              type="button"
              className={`thumbnail-item${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
              onClick={() => onSelectImage(image.id)}
            >
              <img
                src={toApiAssetUrl(image.thumbnailUrl || image.imageUrl)}
                alt={`Miniatura ${image.id}`}
                loading="lazy"
              />
              <div className="thumbnail-meta stack tight">
                <div className="row between">
                  <strong>{image.id}</strong>
                  <span className="muted">Pg {image.page}</span>
                </div>
                {showOcrStatus ? (
                  <span className={`thumb-status ${meta.className}`}>
                    {meta.showSpinner ? <span className="status-spinner" aria-hidden="true" /> : null}
                    <span className="status-icon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span>{meta.label}</span>
                  </span>
                ) : null}
                {showSelection ? (
                  <label
                    className="row gap-sm thumbnail-check"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelection?.(image.id)}
                    />
                    Selecionar
                  </label>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
