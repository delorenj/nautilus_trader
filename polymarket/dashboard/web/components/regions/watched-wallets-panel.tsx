"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MonoNumber, WalletAddress } from "@/components/primitives";
import { useWatchedWallets } from "@/lib/stores";
import { cn } from "@/lib/utils";

function pnlVariant(value: string | null) {
  if (value == null) {
    return "muted" as const;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return "muted" as const;
  }

  return numericValue > 0 ? ("positive" as const) : ("negative" as const);
}

export function WatchedWalletsPanel() {
  const wallets = useWatchedWallets();

  return (
    <section className="px-3 pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
          WATCHED WALLETS
        </h2>
        <Badge
          variant="outline"
          data-mono
          className="border-whisper bg-edge px-1.5 py-0 text-2xs text-muted-steel"
        >
          {wallets.length}
        </Badge>
      </div>

      <div className="space-y-1">
        {wallets.map((wallet) => (
          <div
            key={wallet.address}
            className="flex h-10 min-w-0 items-center gap-2 rounded-[6px] px-3 text-2xs hover:bg-edge"
          >
            <span
              aria-label={wallet.status}
              className={cn(
                "shrink-0",
                wallet.status === "active"
                  ? "text-teal"
                  : "text-muted-steel",
              )}
            >
              {wallet.status === "active" ? "●" : "○"}
            </span>
            <WalletAddress
              address={wallet.address}
              label={wallet.pseudonym ?? undefined}
              copyable={false}
              size="2xs"
              className="min-w-0 flex-1 truncate"
            />
            <MonoNumber
              value={wallet.weight}
              size="2xs"
              variant="muted"
              display={`w ${wallet.weight.toFixed(2)}`}
              className="shrink-0"
            />
            <MonoNumber
              value={wallet.lifetimePnl}
              size="2xs"
              variant={pnlVariant(wallet.lifetimePnl)}
              unit="%"
              className="shrink-0"
            />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-start text-muted-steel hover:text-bone"
      >
        + Add wallet
      </Button>
      <Separator className="my-3 bg-whisper" />
    </section>
  );
}
