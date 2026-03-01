/**
 * Fetch TV channels from CineVeo API in real-time.
 * Returns all pages of channels for the frontend to display.
 * No database storage - pure API proxy.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://cinetvembed.cineveo.site/api/catalog.php";
const USERNAME = "lyneflix-vods";
const PASSWORD = "uVljs2d";

interface ApiChannel {
  id: number;
  title: string;
  type: string;
  poster: string;
  category: string;
  stream_url: string;
}

interface ApiResponse {
  success: boolean;
  pagination: {
    current_page: number;
    total_pages: number;
    total_items: number;
    limit: number;
  };
  data: ApiChannel[];
}

async function fetchPage(page: number): Promise<ApiResponse | null> {
  const url = `${API_BASE}?username=${USERNAME}&password=${PASSWORD}&type=canais&page=${page}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse optional page param from body
    let requestedPage: number | null = null;
    try {
      const body = await req.json();
      requestedPage = body?.page || null;
    } catch {
      // No body = fetch all
    }

    // If specific page requested, return just that page
    if (requestedPage) {
      const pageData = await fetchPage(requestedPage);
      if (!pageData?.success) {
        return new Response(JSON.stringify({ error: "API unavailable" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(pageData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ALL pages
    const firstPage = await fetchPage(1);
    if (!firstPage?.success) {
      return new Response(JSON.stringify({ error: "API unavailable" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPages = firstPage.pagination.total_pages;
    const allChannels: ApiChannel[] = [...firstPage.data];

    // Fetch remaining pages in parallel batches of 6
    const PARALLEL = 6;
    for (let batch = 2; batch <= totalPages; batch += PARALLEL) {
      const promises: Promise<ApiResponse | null>[] = [];
      for (let p = batch; p < batch + PARALLEL && p <= totalPages; p++) {
        promises.push(fetchPage(p));
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r?.data) allChannels.push(...r.data);
      }
    }

    // Group by category
    const categories = new Map<string, ApiChannel[]>();
    for (const ch of allChannels) {
      const cat = ch.category || "Outros";
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(ch);
    }

    return new Response(JSON.stringify({
      success: true,
      total: allChannels.length,
      total_pages: totalPages,
      channels: allChannels,
      categories: Array.from(categories.keys()),
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache 5 min
      },
    });

  } catch (err: any) {
    console.error("[fetch-tv-channels] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
