import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paytrace | See every auto debit clearly",
  description: "Every recurring payment, its message source, and the path to stop it."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
