import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APEX — Embedded Systems IDE",
  description: "A professional embedded systems development environment by Apex.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
