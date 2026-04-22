import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

function readStoredNumber(localStorageKey: string, defaultValue: number): number {
  if (typeof window === "undefined") return defaultValue;

  try {
    const rawValue = window.localStorage.getItem(localStorageKey);
    if (rawValue === null) return defaultValue;
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) return defaultValue;
    return parsedValue;
  } catch {
    return defaultValue;
  }
}

export function useLocalStorageNumericState(
  localStorageKey: string,
  defaultValue: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [value, setValue] = useState<number>(function initValue() {
    return readStoredNumber(localStorageKey, defaultValue);
  });

  useEffect(
    function syncWhenKeyChanges() {
      setValue(readStoredNumber(localStorageKey, defaultValue));
    },
    [localStorageKey, defaultValue],
  );

  const setPersistedValue = useCallback(
    (nextValueOrUpdater: SetStateAction<number>) => {
      setValue((previousValue) => {
        const nextValue =
          typeof nextValueOrUpdater === "function"
            ? (nextValueOrUpdater as (previousValue: number) => number)(previousValue)
            : nextValueOrUpdater;

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(localStorageKey, String(nextValue));
          } catch {
            // ignore localStorage write failures
          }
        }

        return nextValue;
      });
    },
    [localStorageKey],
  );

  return [value, setPersistedValue];
}
