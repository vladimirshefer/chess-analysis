export namespace AnalyticsConsent {
  export type Decision = "accepted" | "declined";
  type StoredDecision = {
    decision: Decision;
    decidedAt: string;
  };

  const STORAGE_KEY = "analytics-consent-decision";
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  export function read(): Decision | null {
    const storedDecision = readStoredDecision();
    if (!storedDecision) return null;
    if (isExpired(storedDecision)) return null;
    return storedDecision.decision;
  }

  export function save(decision: Decision): void {
    try {
      const storedDecision: StoredDecision = {
        decision,
        decidedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedDecision));
    } catch {
      // no-op: localStorage may be unavailable in private or restricted modes
    }
  }

  export function reset(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op: localStorage may be unavailable in private or restricted modes
    }
  }

  function readStoredDecision(): StoredDecision | null {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (!value) return null;

      const parsed = JSON.parse(value) as StoredDecision | null;
      if (!parsed) return null;
      if (parsed.decision !== "accepted" && parsed.decision !== "declined") return null;
      if (!parsed.decidedAt) return null;
      if (Number.isNaN(new Date(parsed.decidedAt).getTime())) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function isExpired(storedDecision: StoredDecision): boolean {
    const decidedAt = new Date(storedDecision.decidedAt);
    const now = Date.now();

    if (storedDecision.decision === "declined") {
      return now >= decidedAt.getTime() + ONE_DAY_MS;
    }

    const expiresAt = new Date(decidedAt);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    return now >= expiresAt.getTime();
  }
}
