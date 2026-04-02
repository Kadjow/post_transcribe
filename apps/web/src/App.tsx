import { Navigate, Route, Routes } from "react-router-dom";
import { ResultsPage } from "./pages/ResultsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { UploadPage } from "./pages/UploadPage";

export default function App(): JSX.Element {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>PDF Vision OCR</h1>
        <p>Upload, revise imagens e transcreva conteudo com Tesseract.</p>
      </header>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/review/:documentId" element={<ReviewPage />} />
        <Route path="/results/:documentId" element={<ResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
