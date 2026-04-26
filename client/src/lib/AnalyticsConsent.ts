export namespace AnalyticsConsent {
  export type Decision = "accepted" | "declined";

  const STORAGE_KEY = "analytics-consent-decision";

  export function read(): Decision | null {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (value === "accepted" || value === "declined") return value;
      return null;
    } catch {
      return null;
    }
  }

  export function save(decision: Decision): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, decision);
    } catch {
      // no-op: localStorage may be unavailable in private or restricted modes
    }
  }
}
