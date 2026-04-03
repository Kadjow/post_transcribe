import { Navigate, Route, Routes } from "react-router-dom";
import { ResultsPage } from "./pages/ResultsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { UploadPage } from "./pages/UploadPage";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App(): JSX.Element {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-top">
          <p className="app-header-eyebrow">PDF Transcribe</p>
          <ThemeToggle />
        </div>
        <h1>Transcreva conteudo de PDFs com precisao</h1>
        <p>Extraia imagens, revise e converta conteudo visual em texto de forma organizada.</p>
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
