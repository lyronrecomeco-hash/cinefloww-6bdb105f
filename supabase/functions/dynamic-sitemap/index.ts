import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * dynamic-sitemap: Generates a full XML sitemap including all content pages.
 * Fetches movies/series/animes/doramas from the content table and builds URLs.
 */

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = "https://lyneflix.online";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toSlug(title: string, id: number): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
  return `${slug}-${id}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const today = new Date().toISOString().split("T")[0];

    // Static pages
    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/filmes", priority: "0.9", changefreq: "daily" },
      { loc: "/series", priority: "0.9", changefreq: "daily" },
      { loc: "/animes", priority: "0.8", changefreq: "daily" },
      { loc: "/doramas", priority: "0.8", changefreq: "daily" },
      { loc: "/lancamentos", priority: "0.9", changefreq: "daily" },
      { loc: "/em-breve", priority: "0.7", changefreq: "weekly" },
      { loc: "/lynetv", priority: "0.7", changefreq: "weekly" },
      { loc: "/conta", priority: "0.3", changefreq: "monthly" },
      { loc: "/suporte", priority: "0.3", changefreq: "monthly" },
      { loc: "/termos", priority: "0.2", changefreq: "yearly" },
      { loc: "/dmca", priority: "0.2", changefreq: "yearly" },
      { loc: "/dados", priority: "0.2", changefreq: "yearly" },
    ];

    // Fetch all published content (paginate to avoid 1000 limit)
    const allContent: { tmdb_id: number; title: string; content_type: string; updated_at: string }[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const { data, error } = await db
        .from("content")
        .select("tmdb_id, title, content_type, updated_at")
        .eq("status", "published")
        .order("tmdb_id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error("[sitemap] DB error:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      allContent.push(...data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    console.log(`[sitemap] Generating sitemap with ${staticPages.length} static + ${allContent.length} content pages`);

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    for (const p of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${SITE}${p.loc}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
      xml += `    <priority>${p.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Content pages
    for (const item of allContent) {
      const isMovie = item.content_type === "movie";
      const prefix = isMovie ? "/filme" : "/serie";
      const slug = toSlug(item.title, item.tmdb_id);
      const lastmod = item.updated_at ? item.updated_at.split("T")[0] : today;
      const priority = isMovie ? "0.7" : "0.7";

      xml += `  <url>\n`;
      xml += `    <loc>${SITE}${prefix}/${escapeXml(slug)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>${priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        ...corsHeaders,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Sitemap generation failed";
    console.error("[sitemap] Error:", msg);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      status: 500,
      headers: { "Content-Type": "application/xml", ...corsHeaders },
    });
  }
});
