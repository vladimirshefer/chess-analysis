// for typesctipt compiler
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export namespace Analytics {
  type EventParams = Record<string, string | number | boolean | undefined>;

  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  let initialized = false;

  export function isConfigured(): boolean {
    return Boolean(measurementId);
  }

  export function init(): void {
    if (!measurementId || initialized) return;
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
    if (!measurementId) return;

    window.gtag?.("event", "page_view", {
      page_path: path,
      page_title: document.title,
      page_location: window.location.href,
    });
  }

  export function trackEvent(eventName: string, params: EventParams = {}): void {
    if (!measurementId) return;
    window.gtag?.("event", eventName, sanitizeParams(params));
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
}
