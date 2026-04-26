import { useState } from "react";

export function PrivacyPolicyPage({ onRevokeConsent }: { onRevokeConsent: () => void }) {
  const [wasRevoked, setWasRevoked] = useState(false);

  function handleRevokeConsentClick() {
    onRevokeConsent();
    setWasRevoked(true);
  }

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
        <div className="mt-6 border-t border-gray-200 pt-5">
          <h3 className="text-lg font-black text-gray-900">Revoke Analytics Consent</h3>
          <p className="mt-2 text-gray-700">
            You can revoke your analytics choice anytime. We will stop analytics immediately and ask again later.
          </p>
          <button
            onClick={handleRevokeConsentClick}
            className="mt-3 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-gray-100"
          >
            Revoke analytics consent
          </button>
          {wasRevoked ? (
            <p className="mt-2 text-sm text-green-700">Consent reset. We will ask again next time.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
