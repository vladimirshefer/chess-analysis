export function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-2xl font-black text-gray-900">Privacy Policy</h2>
        <p className="mt-4 text-gray-700">
          We collect limited usage statistics through Google Analytics (for example page views, move clicks, and engine
          depth selection).
        </p>
        <p className="mt-3 text-gray-700">
          Chess analysis data is stored locally on your device in your browser. We do not upload your analysis tree to
          our servers.
        </p>
        <p className="mt-3 text-gray-700">
          We do not sell your personal data and we do not use your chess analysis content for advertising.
        </p>
      </div>
    </div>
  );
}
