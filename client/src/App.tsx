import { type ReactNode, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import { AnalyticsConsentScreen } from "./components/AnalyticsConsentScreen.tsx";
import { Analytics } from "./lib/Analytics.ts";
import { AnalyticsConsent } from "./lib/AnalyticsConsent.ts";
import { AboutPage } from "./pages/AboutPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import ChessComImportPage from "./pages/ChessComImportPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />

      <main>{children}</main>

      <footer className="grid py-2 border-t border-gray-200 bg-white text-center text-gray-400 text-sm">
        <span>Built with React, Chess.js, and Tailwind CSS</span>
        <span>
          <Link to="/privacy" className="text-gray-500 hover:text-indigo-600">
            Privacy Policy
          </Link>
        </span>
        <span>Copyright (2026) Vladimir Shefer</span>
      </footer>
    </div>
  );
}

function App() {
  const [consentDecision, setConsentDecision] = useState<AnalyticsConsent.Decision | null>(
    function getInitialConsentDecision() {
      return AnalyticsConsent.read();
    },
  );

  useEffect(
    function syncAnalyticsConsent() {
      Analytics.setConsent(consentDecision);
    },
    [consentDecision],
  );

  function applyConsentDecision(nextDecision: AnalyticsConsent.Decision) {
    AnalyticsConsent.save(nextDecision);
    setConsentDecision(nextDecision);
  }

  return (
    <AppShell>
      <AnalyticsRouteTracker />
      <Routes>
        <Route path="/" element={<AnalyzerPage />} />
        <Route path="/import/chess-com" element={<ChessComImportPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="/privacy"
          element={
            <PrivacyPolicyPage
              onRevokeConsent={() => {
                AnalyticsConsent.reset();
                setConsentDecision(null);
              }}
            />
          }
        />
      </Routes>
      <AnalyticsConsentScreen
        isVisible={consentDecision === null}
        onAccept={function handleConsentAccept() {
          applyConsentDecision("accepted");
        }}
        onDecline={function handleConsentDecline() {
          applyConsentDecision("declined");
        }}
      />
    </AppShell>
  );
}

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(
    function trackRoutePageView() {
      const path = `${location.pathname}${location.search}${location.hash}`;
      Analytics.trackPageView(path);
    },
    [location.hash, location.pathname, location.search],
  );

  return null;
}

export default App;
