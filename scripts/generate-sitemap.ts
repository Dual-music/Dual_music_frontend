// Generates public/sitemap.xml with static + dynamic routes (artists, blog, concerts, replays)
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://rhythm-remix-arena.lovable.app";
const SUPABASE_URL = "https://hvpylzrcbswxhyjbgelz.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2cHlsenJjYnN3eGh5amJnZWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MjE1MTMsImV4cCI6MjA3ODI5NzUxM30.GsSBG9ZAv9raK1Gx7b40Jz5skYQVJUFRPcv1_Uola0Q";

interface Entry {
  path: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
}

const staticEntries: Entry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/duels", changefreq: "daily", priority: "0.9" },
  { path: "/concerts", changefreq: "daily", priority: "0.9" },
  { path: "/lives", changefreq: "daily", priority: "0.8" },
  { path: "/artists", changefreq: "daily", priority: "0.9" },
  { path: "/lifestyle", changefreq: "daily", priority: "0.7" },
  { path: "/replays", changefreq: "weekly", priority: "0.7" },
  { path: "/leaderboard", changefreq: "daily", priority: "0.7" },
  { path: "/gift-shop", changefreq: "weekly", priority: "0.6" },
  { path: "/pricing", changefreq: "monthly", priority: "0.6" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/help", changefreq: "monthly", priority: "0.5" },
  { path: "/user-guide", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
  { path: "/cookies", changefreq: "monthly", priority: "0.3" },
  { path: "/install", changefreq: "monthly", priority: "0.5" },
  { path: "/auth", changefreq: "monthly", priority: "0.4" },
];

async function fetchTable(table: string, select: string, filter = ""): Promise<any[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filter}`;
    const r = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

function fmt(d?: string) { return d ? new Date(d).toISOString().slice(0, 10) : undefined; }

async function main() {
  const entries: Entry[] = [...staticEntries];

  const [artists, posts, concerts, replays] = await Promise.all([
    fetchTable("profiles", "user_id,updated_at", "&role=eq.artist&is_public=eq.true"),
    fetchTable("blog_posts", "slug,updated_at", "&published=eq.true"),
    fetchTable("concerts", "id,updated_at", "&status=in.(scheduled,live,ended)"),
    fetchTable("replay_videos", "id,updated_at", "&is_public=eq.true"),
  ]);

  for (const a of artists) entries.push({ path: `/artist/${a.user_id}`, lastmod: fmt(a.updated_at), changefreq: "weekly", priority: "0.7" });
  for (const p of posts) entries.push({ path: `/blog/${p.slug}`, lastmod: fmt(p.updated_at), changefreq: "monthly", priority: "0.6" });
  for (const c of concerts) entries.push({ path: `/concert/${c.id}`, lastmod: fmt(c.updated_at), changefreq: "weekly", priority: "0.7" });
  for (const r of replays) entries.push({ path: `/replay/${r.id}`, lastmod: fmt(r.updated_at), changefreq: "monthly", priority: "0.6" });

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries.map((e) => [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ].filter(Boolean).join("\n")),
    `</urlset>`,
  ].join("\n");

  writeFileSync(resolve("public/sitemap.xml"), xml);
  console.log(`sitemap.xml written (${entries.length} entries)`);
}

main().catch((e) => { console.error(e); process.exit(0); });
