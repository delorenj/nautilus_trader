import type { Metadata } from "next";
import { Suspense } from "react";

import { Providers } from "@/app/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Polymarket Dashboard — Whale Signal Bot",
  description:
    "Single-operator cockpit for the dry-run whale-following signal bot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-[100dvh] antialiased">
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
