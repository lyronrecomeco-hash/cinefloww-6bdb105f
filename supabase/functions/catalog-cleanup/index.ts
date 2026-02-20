import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Block content without synopsis (null, empty, or too short < 20 chars)
    const { data: noSynopsis, error: fetchErr } = await adminClient
      .from("content")
      .select("id, title, content_type, overview")
      .eq("status", "published");

    if (fetchErr) throw fetchErr;

    // Filter to items with missing/bad synopsis
    const toBlock = (noSynopsis || []).filter((item: any) => {
      const ov = (item.overview || "").trim();
      return !ov || ov.length < 20;
    });

    let blocked = 0;
    if (toBlock.length > 0) {
      const ids = toBlock.map((item: any) => item.id);
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const { error } = await adminClient
          .from("content")
          .update({ status: "draft" })
          .in("id", batch);
        if (!error) blocked += batch.length;
      }
    }

    // 2. Remove anime from dorama category (genre check via TMDB)
    // Find doramas that are actually anime by checking if they have animation genre
    const { data: doramas } = await adminClient
      .from("content")
      .select("id, tmdb_id, title")
      .eq("content_type", "dorama")
      .eq("status", "published");

    let reclassified = 0;
    if (doramas && doramas.length > 0) {
      const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
      const headers = { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" };

      // Check in batches of 10
      for (let i = 0; i < doramas.length; i += 10) {
        const batch = doramas.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map(async (item: any) => {
            try {
              const res = await fetch(`https://api.themoviedb.org/3/tv/${item.tmdb_id}?language=pt-BR`, { headers });
              if (!res.ok) return null;
              const data = await res.json();
              const genreIds = data.genres?.map((g: any) => g.id) || [];
              // If it has Animation genre (16), it's anime not dorama
              if (genreIds.includes(16)) {
                await adminClient
                  .from("content")
                  .update({ content_type: "anime" })
                  .eq("id", item.id);
                return "reclassified";
              }
            } catch { /* skip */ }
            return null;
          })
        );
        reclassified += results.filter(r => r.status === "fulfilled" && r.value === "reclassified").length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        blocked_no_synopsis: blocked,
        reclassified_anime: reclassified,
        checked_doramas: doramas?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
