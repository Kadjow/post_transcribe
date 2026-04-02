import { useEffect, useMemo, useState } from "react";

export function useImageSelection(imageIds: string[]): {
  selectedIds: string[];
  selectedCount: number;
  allSelected: boolean;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
} {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idsHash = useMemo(() => imageIds.join("|"), [imageIds]);
  const imageIdsSet = useMemo(() => new Set(imageIds), [idsHash]);

  useEffect(() => {
    setSelected((previous) => {
      const filtered = new Set<string>();
      for (const id of previous) {
        if (imageIdsSet.has(id)) {
          filtered.add(id);
        }
      }
      return filtered;
    });
  }, [imageIdsSet]);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(imageIdsSet));
  };

  const clear = () => {
    setSelected(new Set());
  };

  const isSelected = (id: string) => selected.has(id);
  const selectedIds = [...selected];
  const selectedCount = selectedIds.length;
  const allSelected = imageIds.length > 0 && selectedCount === imageIds.length;

  return {
    selectedIds,
    selectedCount,
    allSelected,
    toggle,
    selectAll,
    clear,
    isSelected
  };
}
