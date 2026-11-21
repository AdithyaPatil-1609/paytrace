/** /robots.txt: public pages may be indexed; account pages and the API may not. */
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account"] },
    sitemap: `${SITE.url}/sitemap.xml`
  };
}
