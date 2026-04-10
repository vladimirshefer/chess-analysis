import type { ReactNode } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import ChessReplay from './components/ChessReplay'
import ChessComImportPage from './components/ChessComImportPage'

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
              <Link to="/" className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">Analyzer</Link>
              <Link to="/import/chess-com" className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">Chess.com</Link>
              <Link to="/about" className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">About</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10 px-6">
        {children}
      </main>

      <footer className="py-6 border-t border-gray-200 bg-white text-center text-gray-400 text-sm">
        Built with React, Chess.js, and Tailwind CSS
      </footer>
    </div>
  )
}

function Home() {
  return (
    <AppShell>
      <ChessReplay />
    </AppShell>
  )
}

function About() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
          <h2 className="text-3xl font-bold mb-6 text-gray-900">About This Application</h2>
          <div className="prose prose-indigo text-gray-600">
            <p className="mb-4">
              This is a full-stack chess analysis and replay tool designed to help you review games quickly. 
              By importing a PGN (Portable Game Notation) string, you can step through moves, jump to specific positions, and visualize the game flow.
            </p>
            <h3 className="text-xl font-bold mt-8 mb-4 text-gray-800">Key Features:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-8">
              <li>PGN Import: Support for standard PGN formats.</li>
              <li>Chess.com Import: Load recent public games by username.</li>
              <li>Interactive Replay: Jump to any move with a single click.</li>
              <li>Navigation: Keyboard-friendly (coming soon) and UI-based playback controls.</li>
              <li>Responsive Design: Analyze your games on desktop or mobile.</li>
            </ul>
            <h3 className="text-xl font-bold mt-8 mb-4 text-gray-800">Tech Stack:</h3>
            <div className="flex flex-wrap gap-2">
              {['Vite', 'React', 'TypeScript', 'Tailwind CSS', 'Chess.js', 'React-Chessboard', 'Vercel Functions'].map(tech => (
                <span key={tech} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold border border-indigo-100">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function ChessComImport() {
  return (
    <AppShell>
      <ChessComImportPage />
    </AppShell>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/import/chess-com" element={<ChessComImport />} />
      <Route path="/about" element={<About />} />
    </Routes>
  )
}

export default App
