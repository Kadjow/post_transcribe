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
  title?: string;
  subtitle?: string;
  sticky?: boolean;
  totalItemsCount?: number;
  emptyStateLabel?: string;
  filters?: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  activeFilterKey?: string;
  onFilterChange?: (key: string) => void;
}

function statusMeta(
  status: DocumentImage["ocr"]["status"]
): { label: string; className: string; icon: string; showSpinner: boolean } {
  if (status === "DONE") {
    return { label: "Concluida", className: "is-done", icon: "v", showSpinner: false };
  }
  if (status === "NOT_REQUESTED") {
    return {
      label: "Transcricao nao iniciada",
      className: "is-not-requested",
      icon: "-",
      showSpinner: false
    };
  }
  if (status === "PENDING") {
    return { label: "Pendente", className: "is-processing", icon: "...", showSpinner: true };
  }
  if (status === "PROCESSING") {
    return { label: "Processando", className: "is-processing", icon: "...", showSpinner: true };
  }
  if (status === "ERROR") {
    return { label: "Erro", className: "is-error", icon: "X", showSpinner: false };
  }
  if (status === "CANCELLED") {
    return { label: "Cancelada", className: "is-cancelled", icon: "!", showSpinner: false };
  }
  if (status === "LOW_CONFIDENCE") {
    return {
      label: "Concluida (baixa confianca)",
      className: "is-warning",
      icon: "!",
      showSpinner: false
    };
  }
  if (status === "NO_TEXT") {
    return { label: "Concluida (sem texto)", className: "is-warning", icon: "!", showSpinner: false };
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
  showOcrStatus = false,
  title = "Imagens",
  subtitle,
  sticky = true,
  totalItemsCount,
  emptyStateLabel = "Nenhuma imagem encontrada para este filtro.",
  filters = [],
  activeFilterKey,
  onFilterChange
}: ImageThumbnailListProps): JSX.Element {
  const hasAnyItems = (totalItemsCount ?? images.length) > 0;

  if (!hasAnyItems) {
    return <p className="card">Nenhuma imagem encontrada para este documento.</p>;
  }

  const currentCount = images.length;
  const overallCount = totalItemsCount ?? images.length;
  const headerCountLabel =
    overallCount > currentCount ? `${currentCount} de ${overallCount} itens` : `${currentCount} itens`;
  const panelClassName = sticky ? "card thumbnail-pane" : "card thumbnail-pane thumbnail-pane-static";

  return (
    <aside className={panelClassName}>
      <div className="thumbnail-pane-header row between">
        <h3>{title}</h3>
        <span className="muted">{headerCountLabel}</span>
      </div>
      {subtitle ? <p className="thumbnail-pane-subtitle muted">{subtitle}</p> : null}
      {filters.length > 0 ? (
        <div className="thumbnail-filters" role="tablist" aria-label="Filtrar imagens por status">
          {filters.map((filter) => {
            const isActive = filter.key === activeFilterKey;
            return (
              <button
                key={filter.key}
                type="button"
                className={`thumbnail-filter-chip${isActive ? " is-active" : ""}`}
                onClick={() => onFilterChange?.(filter.key)}
                role="tab"
                aria-selected={isActive}
              >
                <span>{filter.label}</span>
                <span className="thumbnail-filter-chip-count">{filter.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {images.length > 0 ? (
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
      ) : (
        <p className="thumbnail-empty-state muted">{emptyStateLabel}</p>
      )}
    </aside>
  );
}
