import { Link } from "react-router-dom";

export function AnalyticsConsentScreen({
  isVisible,
  onAccept,
  onDecline,
}: {
  isVisible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-black text-gray-900">Privacy Settings</h2>
        <p className="mt-2 text-sm text-gray-600">
          We use Google Analytics to understand usage (for example move clicks and engine depth selection). Do you allow
          analytics tracking?
        </p>
        <p className="mt-2 text-xs text-gray-500">
          See details in our{" "}
          <Link to="/privacy" className="text-indigo-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onDecline}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-gray-100"
          >
            Decline
          </button>
          <button onClick={onAccept} className="px-4 py-2 rounded-lg bg-gray-900 text-white font-bold hover:bg-black">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
