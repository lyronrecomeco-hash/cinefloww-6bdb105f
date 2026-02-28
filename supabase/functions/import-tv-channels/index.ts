/**
 * Import TV channels from cinetvembed.cineveo.site
 * Uses the allChannels JS variable for complete channel extraction.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCE_URL = "https://cinetvembed.cineveo.site/";
const EMBED_BASE = "https://cinetvembed.cineveo.site/embed/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Category mapping
const CATEGORY_MAP: Record<string, { id: number; name: string }> = {
  "BBB - 2026": { id: 8, name: "BBB 2026" },
  "Desenhos": { id: 2, name: "Infantil" },
  "Premiere": { id: 9, name: "Premiere" },
  "⚽ DAZN BR": { id: 10, name: "DAZN" },
  "⚽ ESPORTES": { id: 1, name: "Esportes" },
  "⚽ PARAMOUNT": { id: 11, name: "Paramount" },
  "⚽ PAY-PER-VIEW": { id: 12, name: "Pay-Per-View" },
  "Abertos": { id: 3, name: "Abertos" },
  "Filmes e Séries": { id: 4, name: "Filmes e Séries" },
  "Infantil": { id: 2, name: "Infantil" },
  "Notícias": { id: 5, name: "Notícias" },
  "Variedades": { id: 6, name: "Variedades" },
  "Documentários": { id: 13, name: "Documentários" },
  "Música": { id: 14, name: "Música" },
};

function slugToId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[•\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface RawChannel {
  id?: string;
  name?: string;
  slug?: string;
  category?: string;
  logo?: string;
  image?: string;
  img?: string;
}

interface ParsedChannel {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
}

function parseAllChannels(html: string): ParsedChannel[] {
  // Extract the allChannels JS variable
  const patterns = [
    /const\s+allChannels\s*=\s*(\[[\s\S]*?\]);/m,
    /var\s+allChannels\s*=\s*(\[[\s\S]*?\]);/m,
    /let\s+allChannels\s*=\s*(\[[\s\S]*?\]);/m,
    /allChannels\s*=\s*(\[[\s\S]*?\]);/m,
  ];

  let rawJson: string | null = null;
  for (const p of patterns) {
    const m = p.exec(html);
    if (m?.[1]) {
      rawJson = m[1];
      break;
    }
  }

  if (!rawJson) {
    console.log("[import-tv] allChannels variable not found, falling back to HTML parsing");
    return [];
  }

  // Clean up JS object notation to valid JSON
  // Replace single quotes with double quotes, handle trailing commas
  let jsonStr = rawJson
    .replace(/'/g, '"')
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    // Handle unquoted keys
    .replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

  let channels: RawChannel[];
  try {
    channels = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[import-tv] Failed to parse allChannels JSON:", e);
    return [];
  }

  console.log(`[import-tv] Parsed ${channels.length} channels from allChannels`);

  const seen = new Set<string>();
  const result: ParsedChannel[] = [];

  for (const ch of channels) {
    const name = (ch.name || "").replace(/^[•\s]+/, "").trim();
    if (!name) continue;

    const slug = ch.slug || ch.id || slugToId(name);
    const id = slugToId(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const cat = ch.category || "Outros";
    const mapped = CATEGORY_MAP[cat];
    const imageUrl = ch.logo || ch.image || ch.img || null;
    const embedUrl = `${EMBED_BASE}${slug}`;

    result.push({
      id,
      name,
      slug,
      image_url: imageUrl && !imageUrl.includes("placeholder") ? imageUrl : null,
      stream_url: embedUrl,
      category: mapped?.name || cat,
      categories: mapped ? [mapped.id] : [7],
    });
  }

  return result;
}

// Fallback: parse HTML directly (legacy method)
function parseChannelsFromHtml(html: string): ParsedChannel[] {
  const channels: ParsedChannel[] = [];
  const seen = new Set<string>();

  const nameRegex = /<div class="channel-name">([^<]+)<\/div>/g;
  const catRegex = /<div class="channel-cat-tag">([^<]+)<\/div>/g;
  const imgRegex = /<img src="([^"]*)"[^>]*alt="[^"]*"[^>]*loading="lazy">/g;
  const embedRegex = /value="(https:\/\/cinetvembed\.cineveo\.site\/embed\/[^"]+)"/g;

  const names: string[] = [], cats: string[] = [], imgs: string[] = [], embeds: string[] = [];
  let m;
  while ((m = nameRegex.exec(html)) !== null) names.push(m[1].trim());
  while ((m = catRegex.exec(html)) !== null) cats.push(m[1].trim());
  while ((m = imgRegex.exec(html)) !== null) imgs.push(m[1]);
  while ((m = embedRegex.exec(html)) !== null) embeds.push(m[1]);

  const count = Math.min(names.length, cats.length, embeds.length);
  for (let i = 0; i < count; i++) {
    const name = names[i].replace(/^[•\s]+/, "").trim();
    const cat = cats[i];
    const embedUrl = embeds[i];
    const img = i < imgs.length ? imgs[i] : null;
    const id = slugToId(name);
    const slug = embedUrl.split("/embed/")[1] || id;

    if (!id || seen.has(id)) continue;
    seen.add(id);

    const mapped = CATEGORY_MAP[cat];
    channels.push({
      id,
      name,
      slug,
      image_url: img && !img.includes("placeholder") ? img : null,
      stream_url: embedUrl,
      category: mapped?.name || cat,
      categories: mapped ? [mapped.id] : [7],
    });
  }

  return channels;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[import-tv] Fetching channel list from cineveo...");

    const resp = await fetch(SOURCE_URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch source", status: resp.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await resp.text();

    // Try allChannels first, fallback to HTML parsing
    let channels = parseAllChannels(html);
    const method = channels.length > 0 ? "allChannels" : "html-fallback";
    if (channels.length === 0) {
      channels = parseChannelsFromHtml(html);
    }

    console.log(`[import-tv] Method: ${method}, parsed ${channels.length} channels`);

    // Ensure categories exist
    const allCatIds = new Set<number>();
    for (const ch of channels) ch.categories.forEach(id => allCatIds.add(id));

    const catEntries = Object.values(CATEGORY_MAP);
    for (const cat of catEntries) {
      await supabase.from("tv_categories").upsert(
        { id: cat.id, name: cat.name, sort_order: cat.id },
        { onConflict: "id" }
      );
    }

    // Upsert channels in batches
    let upserted = 0;
    const BATCH = 50;

    for (let i = 0; i < channels.length; i += BATCH) {
      const batch = channels.slice(i, i + BATCH);
      const { error } = await supabase
        .from("tv_channels")
        .upsert(
          batch.map((ch, idx) => ({
            id: ch.id,
            name: ch.name,
            image_url: ch.image_url,
            stream_url: ch.stream_url,
            category: ch.category,
            categories: ch.categories,
            active: true,
            sort_order: i + idx,
          })),
          { onConflict: "id" }
        );

      if (error) {
        console.error(`[import-tv] Batch ${i} error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    console.log(`[import-tv] Done: ${upserted} channels upserted`);

    return new Response(JSON.stringify({
      success: true,
      method,
      total_parsed: channels.length,
      channels_upserted: upserted,
      sample: channels.slice(0, 5).map(c => ({ id: c.id, name: c.name, slug: c.slug, category: c.category })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[import-tv] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
