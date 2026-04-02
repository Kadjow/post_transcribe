export function formatConfidence(confidence: number | null): string {
  if (confidence === null) {
    return "n/a";
  }
  return `${Math.round(confidence * 100)}%`;
}
