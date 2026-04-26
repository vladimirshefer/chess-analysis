import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import "./index.css";
import { Analytics } from "./lib/Analytics.ts";
import { AnalyticsConsent } from "./lib/AnalyticsConsent.ts";

if (Analytics.isConfigured() && AnalyticsConsent.read() === "accepted") {
  Analytics.init();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
