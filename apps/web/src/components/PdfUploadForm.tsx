import { FormEvent, useState } from "react";
import { MAX_UPLOAD_SIZE_MB } from "../utils/constants";

interface PdfUploadFormProps {
  onSubmit: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function PdfUploadForm({ onSubmit, isLoading }: PdfUploadFormProps): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setError("Selecione um arquivo PDF antes de enviar.");
      return;
    }

    const maxBytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setError(`O arquivo excede ${MAX_UPLOAD_SIZE_MB} MB.`);
      return;
    }

    setError(null);
    await onSubmit(selectedFile);
  };

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2>Upload do PDF</h2>
      <p>Selecione um PDF para extrair as imagens pagina por pagina.</p>
      <input
        type="file"
        accept="application/pdf"
        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
      />
      {selectedFile ? (
        <p className="muted">
          Arquivo: <strong>{selectedFile.name}</strong>
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Enviando..." : "Analisar PDF"}
      </button>
    </form>
  );
}
