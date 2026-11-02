import { type ReactNode, useEffect, useState } from "react";
import { Link, Outlet, Route, Routes, useLocation } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import { AnalyticsConsentScreen } from "./components/AnalyticsConsentScreen.tsx";
import ChessComLibraryAnalysisRunner from "./components/ChessComLibraryAnalysisRunner.tsx";
import LibraryAnalysisProgress from "./components/LibraryAnalysisProgress.tsx";
import { Analytics } from "./lib/Analytics.ts";
import { AnalyticsConsent } from "./lib/AnalyticsConsent.ts";
import { AboutPage } from "./pages/AboutPage";
import AnalyzerPage from "./pages/AnalyzerPage";
import ChessComGameAnalysisPage from "./pages/ChessComGameAnalysisPage/index.tsx";
import ChessComUserAnalysisPage from "./pages/ChessComUserAnalysisPage/index.tsx";
import ChessComUserPage from "./pages/ChessComUserPage";
import PlayBotPage from "./pages/PlayBotPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { useRoutePattern } from "./lib/hooks/useRoutePattern.ts";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />
      <LibraryAnalysisProgress />

      <main>{children}</main>

      <footer className="grid py-2 border-t border-gray-200 bg-white text-center text-gray-400 text-sm">
        <span>Copyright (2026-2027) Vladimir Shefer</span>
        <span>
          <Link to="/privacy" className="text-gray-500 hover:text-indigo-600">
            Privacy Policy
          </Link>
        </span>
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

  return (
    <AppShell>
      <ChessComLibraryAnalysisRunner />
      <Routes>
        <Route element={<AnalyticsRouteTracker />}>
          <Route path="/" element={<AnalyzerPage />} />
          <Route path="/analysis/chesscom/user/:userId/game/:gameId" element={<ChessComGameAnalysisPage />} />
          <Route path="/analysis/chesscom/user/:userId" element={<ChessComUserAnalysisPage />} />
          <Route path="/user/:username" element={<ChessComUserPage />} />
          <Route path="/play" element={<PlayBotPage />} />
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
        </Route>
      </Routes>
      <AnalyticsConsentScreen
        isVisible={consentDecision === null}
        onAccept={() => {
          AnalyticsConsent.save("accepted");
          setConsentDecision("accepted");
        }}
        onDecline={() => {
          AnalyticsConsent.save("declined");
          setConsentDecision("declined");
        }}
      />
    </AppShell>
  );
}

function AnalyticsRouteTracker() {
  const location = useLocation();
  const pattern = useRoutePattern();

  useEffect(
    function trackPageView() {
      Analytics.trackPageView(pattern);
    },
    [pattern, location.pathname],
  );

  return <Outlet />;
}

export default App;
