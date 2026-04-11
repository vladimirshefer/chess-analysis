import type { ReactNode } from "react";
import { Link, Route, Routes } from "react-router-dom";
import ChessReplay from "./components/ChessReplay";
import { AboutPage } from "./pages/AboutPage";
import ChessComImportPage from "./pages/ChessComImportPage";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4 px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md">
              ♜
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              CHESS<span className="text-indigo-600">ANALYSIS</span>
            </h1>
          </Link>
          <div className="flex items-center gap-6">
            <nav className="flex gap-4">
              <Link
                to="/"
                className="text-gray-600 hover:text-indigo-600 font-medium transition-colors"
              >
                Analyzer
              </Link>
              <Link
                to="/import/chess-com"
                className="text-gray-600 hover:text-indigo-600 font-medium transition-colors"
              >
                Chess.com
              </Link>
              <Link
                to="/about"
                className="text-gray-600 hover:text-indigo-600 font-medium transition-colors"
              >
                About
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10 px-6">{children}</main>

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
        <Route path="/" element={<ChessReplay />} />
        <Route path="/import/chess-com" element={<ChessComImportPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
