import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recur | Recurring payments, made clear",
  description: "See every payment that keeps coming back."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
