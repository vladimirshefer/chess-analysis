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
    <div className="pointer-events-none fixed inset-0 z-50 p-4 sm:p-6">
      <div className="pointer-events-auto absolute bottom-4 right-4 w-[calc(100%-2rem)] max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl sm:bottom-6 sm:right-6 sm:w-full">
        <h2 className="text-xl font-black text-gray-900">No ads. No tracking nonsense.</h2>
        <p className="mt-2 text-sm text-gray-600">
          I am an indie developer. If you allow it, I collect anonymous usage stats only to improve this app (for
          example button clicks and engine depth selection).
        </p>
        <p className="mt-2 text-sm text-gray-600">No personal data. No selling data. Ever.</p>
        <p className="mt-2 text-xs text-gray-500">
          See details in our{" "}
          <Link to="/privacy" className="text-indigo-600 hover:underline">
            Privacy Policy
          </Link>
          . You can change this anytime.
        </p>

        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onDecline}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-gray-100"
          >
            Continue without analytics
          </button>
          <button onClick={onAccept} className="px-4 py-2 rounded-lg bg-gray-900 text-white font-bold hover:bg-black">
            Allow anonymous analytics
          </button>
        </div>
      </div>
    </div>
  );
}
