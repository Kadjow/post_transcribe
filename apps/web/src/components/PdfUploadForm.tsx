import { DragEvent, FormEvent, useId, useState } from "react";
import { MAX_UPLOAD_SIZE_MB } from "../utils/constants";

interface PdfUploadFormProps {
  onSubmit: (file: File) => Promise<void>;
  isLoading: boolean;
}

export function PdfUploadForm({ onSubmit, isLoading }: PdfUploadFormProps): JSX.Element {
  const inputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const selectFile = (file: File | null) => {
    setSelectedFile(file);
    setError(null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(null);
      setError("Envie um arquivo em formato PDF.");
      return;
    }
    selectFile(file);
  };

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
    <form className="card upload-card stack" onSubmit={handleSubmit}>
      <h2>Upload do PDF</h2>
      <p className="upload-card-description">
        Envie um PDF para extrair imagens e iniciar a transcricao de forma guiada.
      </p>

      <label
        className={`file-dropzone${isDragOver ? " is-dragover" : ""}`}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          id={inputId}
          className="file-input"
          type="file"
          accept="application/pdf"
          disabled={isLoading}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <strong>{selectedFile ? "Trocar arquivo PDF" : "Clique para selecionar ou arraste um PDF"}</strong>
        <span className="muted">Arquivo unico em PDF com ate {MAX_UPLOAD_SIZE_MB} MB.</span>
      </label>

      {selectedFile ? (
        <p className="selected-file-name">
          Arquivo selecionado: <strong>{selectedFile.name}</strong>
        </p>
      ) : (
        <p className="upload-empty-state">
          Comece enviando um PDF para iniciar e visualizar as imagens detectadas.
        </p>
      )}
      {error ? <p className="error">{error}</p> : null}
      <button className="primary-cta" type="submit" disabled={isLoading || !selectedFile}>
        {isLoading ? "Analisando..." : "Analisar e extrair conteudo"}
      </button>
    </form>
  );
}
