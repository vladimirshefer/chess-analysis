export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-3xl font-bold mb-6 text-gray-900">About This Application</h2>
        <div className="prose prose-indigo text-gray-600">
          <p className="mb-4">
            This is a full-stack chess analysis and replay tool designed to help you review games quickly. By importing
            a PGN (Portable Game Notation) string, you can step through moves, jump to specific positions, and visualize
            the game flow.
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
            {["Vite", "React", "TypeScript", "Tailwind CSS", "Chess.js", "React-Chessboard", "Vercel Functions"].map(
              (tech) => (
                <span
                  key={tech}
                  className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold border border-indigo-100"
                >
                  {tech}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
