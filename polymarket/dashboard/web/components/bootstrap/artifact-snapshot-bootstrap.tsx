"use client";

import { useEffect } from "react";

import type { AutonomySnapshot } from "@/lib/autonomy/types";
import { useAutonomyStore } from "@/lib/stores";

export function ArtifactSnapshotBootstrap() {
  const hydrateFromSnapshot = useAutonomyStore(
    (state) => state.hydrateFromSnapshot,
  );

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    async function hydrate() {
      if (inFlight) {
        return;
      }

      const requestController = new AbortController();
      controller = requestController;
      inFlight = true;
      try {
        const response = await fetch("/api/autonomy/snapshot", {
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) {
          return;
        }
        const snapshot = (await response.json()) as AutonomySnapshot;
        if (!stopped) {
          hydrateFromSnapshot(snapshot);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      } finally {
        inFlight = false;
      }
    }

    void hydrate();
    const handle = globalThis.setInterval(() => {
      void hydrate();
    }, 2_000);

    return () => {
      stopped = true;
      globalThis.clearInterval(handle);
      controller?.abort();
    };
  }, [hydrateFromSnapshot]);

  return null;
}
