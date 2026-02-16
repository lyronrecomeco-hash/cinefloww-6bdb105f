const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  tmdb_id: number;
  imdb_id?: string | null;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8" | "embed";
  headers?: Record<string, string>;
}

interface ExtractResponse {
  success: boolean;
  sources: VideoSource[];
  error?: string;
}

// ====== PROVIDER EXTRACTORS ======

async function extractFromVidSrcXyz(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://vidsrc.xyz/embed/movie/${req.tmdb_id}`
      : `https://vidsrc.xyz/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;
    
    const resp = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://vidsrc.xyz/",
      },
    });
    
    if (!resp.ok) return sources;
    const html = await resp.text();
    
    // Extract m3u8 URLs from the page
    const m3u8Matches = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
    if (m3u8Matches) {
      for (const url of [...new Set(m3u8Matches)]) {
        sources.push({ url, quality: "auto", provider: "vidsrc.xyz", type: "m3u8" });
      }
    }
    
    // Extract mp4 URLs
    const mp4Matches = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);
    if (mp4Matches) {
      for (const url of [...new Set(mp4Matches)]) {
        const qualityMatch = url.match(/(\d{3,4})p/);
        sources.push({ url, quality: qualityMatch?.[1] ? `${qualityMatch[1]}p` : "auto", provider: "vidsrc.xyz", type: "mp4" });
      }
    }
    
    // Try to find source URLs in script tags
    const srcMatches = html.match(/(?:src|file|source)\s*[:=]\s*["'](https?:\/\/[^"']+(?:\.m3u8|\.mp4)[^"']*)/gi);
    if (srcMatches) {
      for (const match of srcMatches) {
        const urlMatch = match.match(/(https?:\/\/[^"']+)/);
        if (urlMatch) {
          const url = urlMatch[1];
          const isM3u8 = url.includes(".m3u8");
          if (!sources.find(s => s.url === url)) {
            sources.push({ url, quality: "auto", provider: "vidsrc.xyz", type: isM3u8 ? "m3u8" : "mp4" });
          }
        }
      }
    }
  } catch (e) {
    console.error("vidsrc.xyz extraction error:", e);
  }
  return sources;
}

async function extractFromVidSrcNet(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://vidsrc.net/embed/movie/${req.tmdb_id}`
      : `https://vidsrc.net/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;
    
    const resp = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://vidsrc.net/",
      },
    });
    
    if (!resp.ok) return sources;
    const html = await resp.text();
    
    // Extract iframe src for sub-sources
    const iframeMatches = html.match(/src=["'](https?:\/\/[^"']+)["']/gi);
    if (iframeMatches) {
      for (const iframe of iframeMatches) {
        const urlMatch = iframe.match(/(https?:\/\/[^"']+)/);
        if (!urlMatch) continue;
        const subUrl = urlMatch[1];
        
        try {
          const subResp = await fetch(subUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": baseUrl,
            },
          });
          
          if (!subResp.ok) continue;
          const subHtml = await subResp.text();
          
          const m3u8s = subHtml.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
          if (m3u8s) {
            for (const url of [...new Set(m3u8s)]) {
              sources.push({ url, quality: "auto", provider: "vidsrc.net", type: "m3u8" });
            }
          }
          
          const mp4s = subHtml.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
          if (mp4s) {
            for (const url of [...new Set(mp4s)]) {
              sources.push({ url, quality: "auto", provider: "vidsrc.net", type: "mp4" });
            }
          }
        } catch { /* skip sub-source */ }
      }
    }
  } catch (e) {
    console.error("vidsrc.net extraction error:", e);
  }
  return sources;
}

async function extractFromEmbedSu(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://embed.su/embed/movie/${req.tmdb_id}`
      : `https://embed.su/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;
    
    const resp = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://embed.su/",
      },
    });
    
    if (!resp.ok) return sources;
    const html = await resp.text();
    
    // Look for encoded/obfuscated stream URLs
    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        sources.push({ url, quality: "auto", provider: "embed.su", type: "m3u8" });
      }
    }
    
    const mp4s = html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
    if (mp4s) {
      for (const url of [...new Set(mp4s)]) {
        sources.push({ url, quality: "auto", provider: "embed.su", type: "mp4" });
      }
    }
    
    // Check for base64 encoded sources
    const b64Matches = html.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/g);
    if (b64Matches) {
      for (const match of b64Matches) {
        const b64 = match.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/);
        if (b64?.[1]) {
          try {
            const decoded = atob(b64[1]);
            if (decoded.includes(".m3u8") || decoded.includes(".mp4")) {
              const urls = decoded.match(/https?:\/\/[^\s"']+/g);
              if (urls) {
                for (const url of urls) {
                  const isM3u8 = url.includes(".m3u8");
                  sources.push({ url, quality: "auto", provider: "embed.su", type: isM3u8 ? "m3u8" : "mp4" });
                }
              }
            }
          } catch { /* not valid base64 */ }
        }
      }
    }
  } catch (e) {
    console.error("embed.su extraction error:", e);
  }
  return sources;
}

async function extractFromVidSrcIcu(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://vidsrc.icu/embed/movie/${req.tmdb_id}`
      : `https://vidsrc.icu/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;
    
    const resp = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://vidsrc.icu/",
      },
    });
    
    if (!resp.ok) return sources;
    const html = await resp.text();
    
    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        sources.push({ url, quality: "auto", provider: "vidsrc.icu", type: "m3u8" });
      }
    }
    
    const mp4s = html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
    if (mp4s) {
      for (const url of [...new Set(mp4s)]) {
        sources.push({ url, quality: "auto", provider: "vidsrc.icu", type: "mp4" });
      }
    }
  } catch (e) {
    console.error("vidsrc.icu extraction error:", e);
  }
  return sources;
}

async function extractFromAutoEmbed(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://autoembed.co/movie/tmdb/${req.tmdb_id}`
      : `https://autoembed.co/tv/tmdb/${req.tmdb_id}-${req.season ?? 1}-${req.episode ?? 1}`;
    
    const resp = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://autoembed.co/",
      },
    });
    
    if (!resp.ok) return sources;
    const html = await resp.text();
    
    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        sources.push({ url, quality: "auto", provider: "autoembed", type: "m3u8" });
      }
    }
    
    const mp4s = html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
    if (mp4s) {
      for (const url of [...new Set(mp4s)]) {
        sources.push({ url, quality: "auto", provider: "autoembed", type: "mp4" });
      }
    }
  } catch (e) {
    console.error("autoembed extraction error:", e);
  }
  return sources;
}

// ====== MAIN HANDLER ======

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ExtractRequest = await req.json();
    const { tmdb_id, imdb_id, type, season, episode } = body;

    if (!tmdb_id || !type) {
      return new Response(
        JSON.stringify({ success: false, sources: [], error: "tmdb_id and type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Extracting sources for ${type} ${tmdb_id} (S${season}E${episode})`);

    // Run all extractors in parallel for speed
    const extractors = [
      extractFromVidSrcXyz(body),
      extractFromVidSrcNet(body),
      extractFromEmbedSu(body),
      extractFromVidSrcIcu(body),
      extractFromAutoEmbed(body),
    ];

    const results = await Promise.allSettled(extractors);
    const allSources: VideoSource[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        allSources.push(...result.value);
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueSources = allSources.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    // Sort: mp4 first, then m3u8, prioritize higher quality
    uniqueSources.sort((a, b) => {
      if (a.type === "mp4" && b.type !== "mp4") return -1;
      if (a.type !== "mp4" && b.type === "mp4") return 1;
      const qA = parseInt(a.quality) || 0;
      const qB = parseInt(b.quality) || 0;
      return qB - qA;
    });

    console.log(`Found ${uniqueSources.length} sources`);

    const response: ExtractResponse = {
      success: uniqueSources.length > 0,
      sources: uniqueSources,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Extract error:", error);
    return new Response(
      JSON.stringify({ success: false, sources: [], error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
