/** /sitemap.xml: the public pages only. Account pages and the API are not listed. */
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/demo", "/sandbox", "/privacy", "/signin"].map((path, i) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    changeFrequency: "weekly",
    priority: i === 0 ? 1 : 0.6
  }));
}
