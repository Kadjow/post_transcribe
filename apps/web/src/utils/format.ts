export function formatConfidence(confidence: number | null): string {
  if (confidence === null) {
    return "n/d";
  }
  return `${Math.round(confidence * 100)}%`;
}
