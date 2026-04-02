import type { DocumentResult } from "./api";

export interface ReviewState {
  result: DocumentResult;
  isLoading: boolean;
  error: string | null;
}
