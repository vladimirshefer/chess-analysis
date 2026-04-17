import type { ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import { AboutPage } from "./pages/AboutPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import ChessComImportPage from "./pages/ChessComImportPage";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />

      <main>{children}</main>

      <footer className="grid py-2 border-t border-gray-200 bg-white text-center text-gray-400 text-sm">
        <span>Built with React, Chess.js, and Tailwind CSS</span>
        <span>Copyright (2026) Vladimir Shefer</span>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<AnalyzerPage />} />
        <Route path="/import/chess-com" element={<ChessComImportPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
