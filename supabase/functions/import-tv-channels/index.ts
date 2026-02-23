/**
 * Import TV channels from cinetvembed.cineveo.site
 * Parses the HTML page, extracts all channels and upserts into tv_channels + tv_categories.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCE_URL = "https://cinetvembed.cineveo.site/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Map source categories to our tv_categories IDs
const CATEGORY_MAP: Record<string, { id: number; name: string }> = {
  "BBB - 2026": { id: 8, name: "BBB 2026" },
  "Desenhos": { id: 2, name: "Infantil" },
  "Premiere": { id: 9, name: "Premiere" },
  "⚽ DAZN BR": { id: 10, name: "DAZN" },
  "⚽ ESPORTES": { id: 1, name: "Esportes" },
  "⚽ PARAMOUNT": { id: 11, name: "Paramount" },
  "⚽ PAY-PER-VIEW": { id: 12, name: "Pay-Per-View" },
};

function slugToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[•\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ParsedChannel {
  id: string;
  name: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
}

function parseChannels(html: string): { channels: ParsedChannel[]; categories: Set<string> } {
  const channels: ParsedChannel[] = [];
  const categories = new Set<string>();
  const seen = new Set<string>();

  // Match channel-name and channel-cat-tag pairs
  const nameRegex = /<div class="channel-name">([^<]+)<\/div>/g;
  const catRegex = /<div class="channel-cat-tag">([^<]+)<\/div>/g;
  const imgRegex = /<img src="([^"]*)"[^>]*alt="[^"]*"[^>]*loading="lazy">/g;
  const embedRegex = /value="(https:\/\/cinetvembed\.cineveo\.site\/embed\/[^"]+)"/g;

  const names: string[] = [];
  const cats: string[] = [];
  const imgs: string[] = [];
  const embeds: string[] = [];

  let m;
  while ((m = nameRegex.exec(html)) !== null) names.push(m[1].trim());
  while ((m = catRegex.exec(html)) !== null) cats.push(m[1].trim());
  while ((m = imgRegex.exec(html)) !== null) imgs.push(m[1]);
  while ((m = embedRegex.exec(html)) !== null) embeds.push(m[1]);

  console.log(`[import-tv] Raw parsed: ${names.length} names, ${cats.length} cats, ${imgs.length} imgs, ${embeds.length} embeds`);

  const count = Math.min(names.length, cats.length, embeds.length);

  for (let i = 0; i < count; i++) {
    const name = names[i].replace(/^[•\s]+/, "").trim();
    const cat = cats[i];
    const embedUrl = embeds[i];
    const img = i < imgs.length ? imgs[i] : null;
    const id = slugToId(name);

    if (!id || seen.has(id)) continue;
    seen.add(id);
    categories.add(cat);

    const imageUrl = img && !img.includes("placeholder") ? img : null;
    const mapped = CATEGORY_MAP[cat];
    const catIds = mapped ? [mapped.id] : [7];

    channels.push({
      id,
      name,
      image_url: imageUrl,
      stream_url: embedUrl,
      category: mapped?.name || cat,
      categories: catIds,
    });
  }

  return { channels, categories };
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
    const { channels, categories } = parseChannels(html);

    console.log(`[import-tv] Parsed ${channels.length} unique channels across ${categories.size} categories`);

    // Ensure new categories exist
    const newCats = [
      { id: 9, name: "Premiere", sort_order: 9 },
      { id: 10, name: "DAZN", sort_order: 10 },
      { id: 11, name: "Paramount", sort_order: 11 },
      { id: 12, name: "Pay-Per-View", sort_order: 12 },
    ];

    for (const cat of newCats) {
      await supabase.from("tv_categories").upsert(cat, { onConflict: "id" });
    }

    // Upsert channels in batches
    let inserted = 0;
    let updated = 0;
    const BATCH = 50;

    for (let i = 0; i < channels.length; i += BATCH) {
      const batch = channels.slice(i, i + BATCH);
      const { data, error } = await supabase
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
        inserted += batch.length;
      }
    }

    console.log(`[import-tv] Done: ${inserted} channels upserted`);

    return new Response(JSON.stringify({
      success: true,
      total_parsed: channels.length,
      categories_found: Array.from(categories),
      channels_upserted: inserted,
      sample: channels.slice(0, 5).map(c => ({ id: c.id, name: c.name, category: c.category })),
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
