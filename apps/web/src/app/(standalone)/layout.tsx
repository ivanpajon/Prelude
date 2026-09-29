import "@repo/ui/styles/globals.css";
import type { ReactNode } from "react";

// This root never reads request state: /offline must remain a precacheable document.
export default function StandaloneLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
