import type { DocumentImage } from "../types/api";
import { ImageCard } from "./ImageCard";

interface ImageGridProps {
  images: DocumentImage[];
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
}

export function ImageGrid({
  images,
  selectable = false,
  selectedIds = [],
  onToggleSelection
}: ImageGridProps): JSX.Element {
  if (images.length === 0) {
    return <p className="card">Nenhuma imagem foi encontrada no PDF.</p>;
  }

  return (
    <section className="image-grid">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          selectable={selectable}
          selected={selectedIds.includes(image.id)}
          onToggleSelection={onToggleSelection ?? (() => undefined)}
        />
      ))}
    </section>
  );
}
