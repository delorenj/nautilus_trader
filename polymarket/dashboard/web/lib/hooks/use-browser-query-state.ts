"use client";

import { useCallback, useEffect, useState } from "react";

interface BrowserQueryStateOptions {
  defaultValue: string;
}

function readQueryValue(key: string, defaultValue: string) {
  if (typeof window === "undefined") {
    return defaultValue;
  }

  return new URLSearchParams(window.location.search).get(key) ?? defaultValue;
}

export function useBrowserQueryState(
  key: string,
  { defaultValue }: BrowserQueryStateOptions,
) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(readQueryValue(key, defaultValue));

    const handlePopState = () => {
      setValue(readQueryValue(key, defaultValue));
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [defaultValue, key]);

  const updateValue = useCallback(
    (nextValue: string) => {
      setValue(nextValue);

      const url = new URL(window.location.href);

      if (nextValue === defaultValue || nextValue === "") {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, nextValue);
      }

      window.history.replaceState(window.history.state, "", url);
    },
    [defaultValue, key],
  );

  return [value, updateValue] as const;
}
