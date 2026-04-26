// for typesctipt compiler
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export namespace Analytics {
  type EventParams = Record<string, string | number | boolean | undefined>;
  export type ConsentDecision = "accepted" | "declined" | null;

  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  let initialized = false;
  let hasConsent = false;

  export function isConfigured(): boolean {
    return Boolean(measurementId);
  }

  export function setConsent(decision: ConsentDecision): void {
    hasConsent = decision === "accepted";
    if (hasConsent) {
      init();
    }
  }

  export function init(): void {
    if (!measurementId) {
      logFallback("init", { configured: false });
      return;
    }
    if (!hasConsent) {
      logFallback("init", { configured: true, consent: false });
      return;
    }
    if (initialized) return;
    initialized = true;

    if (!window.dataLayer) {
      window.dataLayer = [];
    }

    if (!window.gtag) {
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer.push(args);
      };
    }

    injectGtagScript(measurementId);
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
  }

  export function trackPageView(path: string): void {
    const pageViewPayload = {
      page_path: path,
      page_title: document.title,
      page_location: window.location.href,
    };
    if (!measurementId || !hasConsent) {
      logFallback("page_view", pageViewPayload);
      return;
    }

    window.gtag?.("event", "page_view", pageViewPayload);
  }

  export function trackEvent(eventName: string, params: EventParams = {}): void {
    const payload = sanitizeParams(params);
    if (!measurementId || !hasConsent) {
      logFallback(eventName, payload);
      return;
    }
    window.gtag?.("event", eventName, payload);
  }

  function sanitizeParams(params: EventParams): Record<string, string | number | boolean> {
    return Object.entries(params).reduce<Record<string, string | number | boolean>>(function keepDefined(acc, entry) {
      const [key, value] = entry;
      if (value === undefined) return acc;
      acc[key] = value;
      return acc;
    }, {});
  }

  function injectGtagScript(id: string): void {
    if (document.querySelector(`script[data-gtag-id="${id}"]`)) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.setAttribute("data-gtag-id", id);
    document.head.appendChild(script);
  }

  function logFallback(eventName: string, payload: Record<string, string | number | boolean>): void {
    console.info("[analytics:fallback]", eventName, payload);
  }
}
