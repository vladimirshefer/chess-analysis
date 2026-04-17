export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-3xl font-bold mb-4 text-gray-900">Chess analysis. Simple, quick, free.</h2>
        <p className="text-gray-600 mb-6">
          Free, opensource visual analysis of your chess games. See what you did and what you could do. Learn ideas and
          plans without long reads.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Quick visual board cues, not long reading.</li>
          <li>Classic engine analysis is available whenever you want it.</li>
          <li>Coming soon: your game library, statistics, and opening repertoire analysis.</li>
        </ul>
      </div>
    </div>
  );
}
