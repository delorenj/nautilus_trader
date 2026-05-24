"use client";

import {
  CONNECTION_NAMES,
  ConnectionStatusBadge,
} from "@/components/regions/header-content";

export function ConnectionsPanel() {
  return (
    <section className="px-3 pb-4">
      <h2 className="mb-3 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
        CONNECTIONS
      </h2>
      <div className="flex flex-col items-start gap-2">
        {CONNECTION_NAMES.map((name) => (
          <ConnectionStatusBadge
            key={name}
            name={name}
            className="h-6 justify-start"
          />
        ))}
      </div>
    </section>
  );
}
