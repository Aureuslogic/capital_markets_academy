// Returns 410 Gone for spam query-string URLs on the homepage, such as
// /?a=8448861584001 and /?shop/goods/33832039584.html. These come from
// third-party spam links and are not part of the site. Real marketing
// parameters (utm_*, gclid, fbclid and similar) still reach the homepage.
import type { Config } from "@netlify/edge-functions";

const ALLOWED = [
  /^utm_/i,
  /^(gclid|gbraid|wbraid|fbclid|msclkid|dclid|twclid|li_fat_id|ttclid|_gl|mc_cid|mc_eid|ref|source)$/i,
];

const GONE_HTML = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow"><title>Page removed | Capital Markets Academy</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>This page does not exist</h1>
<p>Visit <a href="https://capitalmarketsacademy.com/">Capital Markets Academy</a>.</p>
</body></html>`;

export default async (request: Request) => {
  const url = new URL(request.url);
  if (!url.search || url.search === "?") return;

  const keys = [...url.searchParams.keys()];
  const isLegit = keys.length > 0 && keys.every((k) => ALLOWED.some((re) => re.test(k)));
  if (isLegit) return;

  return new Response(GONE_HTML, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=3600",
    },
  });
};

export const config: Config = { path: "/", onError: "bypass" };
