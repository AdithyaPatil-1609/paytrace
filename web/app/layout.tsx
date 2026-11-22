import type { Metadata } from "next";
import { SITE } from "@/web/site";
import { RESTORE_TEXT_SIZE, TextSizeToggle } from "@/web/components/chrome/text-size-toggle";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, title: SITE.title, description: SITE.description, url: "/", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The restore script sets data-text-size before React loads, so the attribute is expected to differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RESTORE_TEXT_SIZE }} />
      </head>
      <body>
        {children}
        <TextSizeToggle />
      </body>
    </html>
  );
}
