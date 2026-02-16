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
  type: "mp4" | "m3u8";
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ====== DECODE FUNCTIONS (ported from vidsrc-resolver) ======

class DecodeURL {
  bMGyx71TzQLfdonN(value: string): string {
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += 3) {
      chunks.push(value.substring(i, i + 3));
    }
    chunks.reverse();
    return chunks.join("");
  }

  Iry9MQXnLs(encoded: string): string {
    const key = 'pWB9V)[*4I`nJpp?ozyB~dbr9yt!_n4u';
    const hexValues = encoded.match(/.{1,2}/g)?.map(h => String.fromCharCode(parseInt(h, 16))).join("") || "";
    let decoded = "";
    for (let i = 0; i < hexValues.length; i++) {
      decoded += String.fromCharCode(hexValues.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    let adjusted = "";
    for (const char of decoded) {
      adjusted += String.fromCharCode(char.charCodeAt(0) - 3);
    }
    return atob(adjusted);
  }

  IGLImMhWrI(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const rot13 = reversed.split("").map(c => {
      if ((c >= 'a' && c < 'n') || (c >= 'A' && c < 'N')) return String.fromCharCode(c.charCodeAt(0) + 13);
      if ((c >= 'n' && c <= 'z') || (c >= 'N' && c <= 'Z')) return String.fromCharCode(c.charCodeAt(0) - 13);
      return c;
    }).join("");
    return atob(rot13.split("").reverse().join(""));
  }

  GTAxQyTyBx(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    let filtered = "";
    for (let i = 0; i < reversed.length; i += 2) {
      filtered += reversed[i];
    }
    return atob(filtered);
  }

  C66jPHx8qu(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const hexValues = reversed.match(/.{1,2}/g)?.map(h => String.fromCharCode(parseInt(h, 16))).join("") || "";
    const key = 'X9a(O;FMV2-7VO5x;Ao\x05:dN1NoFs?j,';
    let decoded = "";
    for (let i = 0; i < hexValues.length; i++) {
      decoded += String.fromCharCode(hexValues.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decoded;
  }

  MyL1IRSfHe(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const adjusted = reversed.split("").map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join("");
    let result = "";
    for (let i = 0; i < adjusted.length; i += 2) {
      result += String.fromCharCode(parseInt(adjusted.substring(i, i + 2), 16));
    }
    return result;
  }

  detdj7JHiK(encoded: string): string {
    const extracted = encoded.substring(10, encoded.length - 16);
    const key = '3SAY~#%Y(V%>5d/Yg"$G[Lh1rK4a;7ok';
    const decoded = atob(extracted);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  nZlUnj2VSo(encoded: string): string {
    const mapping: Record<string, string> = {
      "x": "a", "y": "b", "z": "c", "a": "d", "b": "e", "c": "f", "d": "g",
      "e": "h", "f": "i", "g": "j", "h": "k", "i": "l", "j": "m", "k": "n",
      "l": "o", "m": "p", "n": "q", "o": "r", "p": "s", "q": "t", "r": "u",
      "s": "v", "t": "w", "u": "x", "v": "y", "w": "z", "X": "A", "Y": "B",
      "Z": "C", "A": "D", "B": "E", "C": "F", "D": "G", "E": "H", "F": "I",
      "G": "J", "H": "K", "I": "L", "J": "M", "K": "N", "L": "O", "M": "P",
      "N": "Q", "O": "R", "P": "S", "Q": "T", "R": "U", "S": "V", "T": "W",
      "U": "X", "V": "Y", "W": "Z",
    };
    return encoded.split("").map(c => mapping[c] || c).join("");
  }

  laM1dAi3vO(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const fixed = reversed.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(fixed);
    return decoded.split("").map(c => String.fromCharCode(c.charCodeAt(0) - 5)).join("");
  }

  GuxKGDsA2T(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const fixed = reversed.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(fixed);
    return decoded.split("").map(c => String.fromCharCode(c.charCodeAt(0) - 7)).join("");
  }

  LXVUMCoAHJ(encoded: string): string {
    const reversed = encoded.split("").reverse().join("");
    const fixed = reversed.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(fixed);
    return decoded.split("").map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join("");
  }

  SqmOaLsKHv7vWtli(value: string): string {
    return value;
  }

  decode(funcName: string, encoded: string): string | null {
    try {
      const fn = (this as any)[funcName];
      if (typeof fn === "function") {
        return fn.call(this, encoded);
      }
    } catch (e) {
      console.error(`Decode error for ${funcName}:`, e);
    }
    return null;
  }
}

// ====== VIDSRC.NET EXTRACTOR (reverse engineered) ======

async function extractFromVidSrcNet(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  const decoder = new DecodeURL();
  
  try {
    // Step 1: Get embed page
    const embedUrl = req.type === "movie"
      ? `https://vidsrc.net/embed/${req.type}?tmdb=${req.tmdb_id}`
      : `https://vidsrc.net/embed/${req.type}?tmdb=${req.tmdb_id}&season=${req.season ?? 1}&episode=${req.episode ?? 1}`;

    console.log(`[vidsrc.net] Step 1: Fetching embed page: ${embedUrl}`);
    const resp = await fetch(embedUrl, {
      method: "POST",
      headers: { "User-Agent": UA, "Referer": "https://vidsrc.net/" },
    });
    if (!resp.ok) { console.log(`[vidsrc.net] Embed page returned ${resp.status}`); return sources; }
    const html = await resp.text();

    // Step 2: Extract player_iframe src
    const iframeMatch = html.match(/id=["']player_iframe["'][^>]*src=["']([^"']+)["']/i) 
      || html.match(/src=["'](\/\/[^"']+)["'][^>]*id=["']player_iframe["']/i);
    if (!iframeMatch) { console.log("[vidsrc.net] No player_iframe found"); return sources; }
    
    let rcpUrl = iframeMatch[1];
    if (rcpUrl.startsWith("//")) rcpUrl = "https:" + rcpUrl;
    const parsedUrl = new URL(rcpUrl);
    const domain = parsedUrl.hostname;
    const rcpPath = parsedUrl.pathname + parsedUrl.search;

    console.log(`[vidsrc.net] Step 2: Found RCP domain=${domain}, path=${rcpPath}`);

    // Step 3: Fetch RCP page
    const rcpResp = await fetch(`https://${domain}${rcpPath}`, {
      method: "POST",
      headers: { "User-Agent": UA, "Referer": embedUrl },
    });
    if (!rcpResp.ok) { console.log(`[vidsrc.net] RCP returned ${rcpResp.status}`); return sources; }
    const rcpHtml = await rcpResp.text();

    // Step 4: Extract /prorcp URL
    const prorcpMatch = rcpHtml.match(/src:\s*['"](\/?prorcp[^'"]*)['"]/);
    if (!prorcpMatch) { console.log("[vidsrc.net] No /prorcp found"); return sources; }
    const prorcpPath = prorcpMatch[1].startsWith("/") ? prorcpMatch[1] : "/" + prorcpMatch[1];

    console.log(`[vidsrc.net] Step 3: Found prorcp: ${prorcpPath}`);

    // Step 5: Fetch prorcp page
    const prorcpResp = await fetch(`https://${domain}${prorcpPath}`, {
      headers: { "User-Agent": UA, "Referer": `https://${domain}/` },
    });
    if (!prorcpResp.ok) { console.log(`[vidsrc.net] Prorcp returned ${prorcpResp.status}`); return sources; }
    const prorcpHtml = await prorcpResp.text();

    // Step 6: Find decode script
    const cptMatch = prorcpHtml.match(/src=["']([^"']*cpt\.js[^"']*)["']/i);
    if (!cptMatch) { console.log("[vidsrc.net] No cpt.js found"); return sources; }

    // Find the script tag before cpt.js
    const scriptTags = prorcpHtml.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || [];
    let decodeScriptPath: string | null = null;
    for (let i = 0; i < scriptTags.length; i++) {
      if (scriptTags[i].includes("cpt.js") && i > 0) {
        const prevSrcMatch = scriptTags[i - 1].match(/src=["']([^"']+)["']/);
        if (prevSrcMatch) decodeScriptPath = prevSrcMatch[1];
      }
    }

    if (!decodeScriptPath) { console.log("[vidsrc.net] No decode script found"); return sources; }

    console.log(`[vidsrc.net] Step 4: Found decode script: ${decodeScriptPath}`);

    // Step 7: Fetch decode script
    const dsUrl = decodeScriptPath.startsWith("http") ? decodeScriptPath : `https://${domain}${decodeScriptPath}`;
    const dsResp = await fetch(dsUrl, {
      headers: { "User-Agent": UA, "Referer": `https://${domain}/` },
    });
    if (!dsResp.ok) { console.log(`[vidsrc.net] Decode script returned ${dsResp.status}`); return sources; }
    const dsSource = await dsResp.text();

    // Step 8: Extract function name and element ID
    const pattern = /\}\}window\[([^\]]+)\("([^"]+)"\)/;
    const funcMatches = dsSource.match(pattern);
    if (!funcMatches) { console.log("[vidsrc.net] No decode function pattern found"); return sources; }

    const decoderFuncName = funcMatches[1];
    const encodedElementId = funcMatches[2];

    console.log(`[vidsrc.net] Step 5: Decoder func=${decoderFuncName}, encodedId=${encodedElementId}`);

    // Decode the element ID
    const elementId = decoder.decode(decoderFuncName, encodedElementId);
    if (!elementId) { console.log("[vidsrc.net] Could not decode element ID"); return sources; }

    console.log(`[vidsrc.net] Step 6: Decoded element ID: ${elementId}`);

    // Step 9: Extract encoded stream URL from element
    const elementPattern = new RegExp(`id=["']${elementId}["'][^>]*>([^<]+)<`);
    const elementMatch = prorcpHtml.match(elementPattern);
    if (!elementMatch) { console.log("[vidsrc.net] Could not find element with decoded ID"); return sources; }

    const encodedStreamUrl = elementMatch[1].trim();
    
    // Decode stream URL
    const streamUrl = decoder.decode(encodedElementId, encodedStreamUrl);
    if (!streamUrl) { console.log("[vidsrc.net] Could not decode stream URL"); return sources; }

    console.log(`[vidsrc.net] SUCCESS: Extracted stream URL`);

    // Determine type
    const isM3u8 = streamUrl.includes(".m3u8");
    sources.push({
      url: streamUrl,
      quality: "auto",
      provider: "VidSrc.net",
      type: isM3u8 ? "m3u8" : "mp4",
    });

    // Try to get variant playlists for m3u8
    if (isM3u8) {
      try {
        const m3u8Resp = await fetch(streamUrl, {
          headers: { "User-Agent": UA, "Referer": `https://${domain}/` },
        });
        if (m3u8Resp.ok) {
          const m3u8Text = await m3u8Resp.text();
          const variantLines = m3u8Text.split("\n");
          for (let i = 0; i < variantLines.length; i++) {
            const resMatch = variantLines[i].match(/RESOLUTION=(\d+)x(\d+)/);
            if (resMatch && i + 1 < variantLines.length) {
              const variantUrl = variantLines[i + 1].trim();
              if (variantUrl && !variantUrl.startsWith("#")) {
                const fullUrl = variantUrl.startsWith("http") ? variantUrl : new URL(variantUrl, streamUrl).href;
                sources.push({
                  url: fullUrl,
                  quality: `${resMatch[2]}p`,
                  provider: "VidSrc.net",
                  type: "m3u8",
                });
              }
            }
          }
        }
      } catch { /* variant extraction failed */ }
    }
  } catch (e) {
    console.error("[vidsrc.net] Extraction error:", e);
  }
  return sources;
}

// ====== VIDSRC.XYZ EXTRACTOR ======

async function extractFromVidSrcXyz(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://vidsrc.xyz/embed/movie/${req.tmdb_id}`
      : `https://vidsrc.xyz/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;

    const resp = await fetch(baseUrl, {
      headers: { "User-Agent": UA, "Referer": "https://vidsrc.xyz/" },
    });
    if (!resp.ok) return sources;
    const html = await resp.text();

    // Follow same pattern as vidsrc.net if iframe found
    const iframeMatch = html.match(/src=["'](https?:\/\/[^"']+)["']/i);
    if (iframeMatch) {
      try {
        const subResp = await fetch(iframeMatch[1], {
          headers: { "User-Agent": UA, "Referer": baseUrl },
        });
        if (subResp.ok) {
          const subHtml = await subResp.text();
          const m3u8s = subHtml.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
          if (m3u8s) {
            for (const url of [...new Set(m3u8s)]) {
              sources.push({ url, quality: "auto", provider: "VidSrc.xyz", type: "m3u8" });
            }
          }
          const mp4s = subHtml.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
          if (mp4s) {
            for (const url of [...new Set(mp4s)]) {
              sources.push({ url, quality: "auto", provider: "VidSrc.xyz", type: "mp4" });
            }
          }
        }
      } catch { /* skip */ }
    }

    // Direct extraction from initial page
    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        if (!sources.find(s => s.url === url)) {
          sources.push({ url, quality: "auto", provider: "VidSrc.xyz", type: "m3u8" });
        }
      }
    }
  } catch (e) {
    console.error("[vidsrc.xyz] Error:", e);
  }
  return sources;
}

// ====== VIDSRC.ICU EXTRACTOR ======

async function extractFromVidSrcIcu(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://vidsrc.icu/embed/movie/${req.tmdb_id}`
      : `https://vidsrc.icu/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;

    const resp = await fetch(baseUrl, {
      headers: { "User-Agent": UA, "Referer": "https://vidsrc.icu/" },
    });
    if (!resp.ok) return sources;
    const html = await resp.text();

    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        sources.push({ url, quality: "auto", provider: "VidSrc.icu", type: "m3u8" });
      }
    }
    const mp4s = html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
    if (mp4s) {
      for (const url of [...new Set(mp4s)]) {
        sources.push({ url, quality: "auto", provider: "VidSrc.icu", type: "mp4" });
      }
    }
  } catch (e) {
    console.error("[vidsrc.icu] Error:", e);
  }
  return sources;
}

// ====== EMBED.SU EXTRACTOR ======

async function extractFromEmbedSu(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://embed.su/embed/movie/${req.tmdb_id}`
      : `https://embed.su/embed/tv/${req.tmdb_id}/${req.season ?? 1}/${req.episode ?? 1}`;

    const resp = await fetch(baseUrl, {
      headers: { "User-Agent": UA, "Referer": "https://embed.su/" },
    });
    if (!resp.ok) return sources;
    const html = await resp.text();

    // Look for encoded sources in script tags
    const b64Matches = html.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/g);
    if (b64Matches) {
      for (const match of b64Matches) {
        const b64 = match.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/);
        if (b64?.[1]) {
          try {
            const decoded = atob(b64[1]);
            const urls = decoded.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)[^\s"']*/g);
            if (urls) {
              for (const url of urls) {
                const isM3u8 = url.includes(".m3u8");
                sources.push({ url, quality: "auto", provider: "Embed.su", type: isM3u8 ? "m3u8" : "mp4" });
              }
            }
          } catch { /* not valid */ }
        }
      }
    }

    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        if (!sources.find(s => s.url === url)) {
          sources.push({ url, quality: "auto", provider: "Embed.su", type: "m3u8" });
        }
      }
    }
  } catch (e) {
    console.error("[embed.su] Error:", e);
  }
  return sources;
}

// ====== AUTOEMBED EXTRACTOR ======

async function extractFromAutoEmbed(req: ExtractRequest): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const baseUrl = req.type === "movie"
      ? `https://autoembed.co/movie/tmdb/${req.tmdb_id}`
      : `https://autoembed.co/tv/tmdb/${req.tmdb_id}-${req.season ?? 1}-${req.episode ?? 1}`;

    const resp = await fetch(baseUrl, {
      headers: { "User-Agent": UA, "Referer": "https://autoembed.co/" },
    });
    if (!resp.ok) return sources;
    const html = await resp.text();

    const m3u8s = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g);
    if (m3u8s) {
      for (const url of [...new Set(m3u8s)]) {
        sources.push({ url, quality: "auto", provider: "AutoEmbed", type: "m3u8" });
      }
    }
    const mp4s = html.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g);
    if (mp4s) {
      for (const url of [...new Set(mp4s)]) {
        sources.push({ url, quality: "auto", provider: "AutoEmbed", type: "mp4" });
      }
    }
  } catch (e) {
    console.error("[autoembed] Error:", e);
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
    const { tmdb_id, type, season, episode } = body;

    if (!tmdb_id || !type) {
      return new Response(
        JSON.stringify({ success: false, sources: [], error: "tmdb_id and type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`=== Extracting sources for ${type} ${tmdb_id} (S${season}E${episode}) ===`);

    // Run all extractors in parallel
    const results = await Promise.allSettled([
      extractFromVidSrcNet(body),
      extractFromVidSrcXyz(body),
      extractFromVidSrcIcu(body),
      extractFromEmbedSu(body),
      extractFromAutoEmbed(body),
    ]);

    const allSources: VideoSource[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allSources.push(...result.value);
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    const uniqueSources = allSources.filter(s => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });

    // Sort: mp4 first, then higher quality m3u8
    uniqueSources.sort((a, b) => {
      if (a.type === "mp4" && b.type !== "mp4") return -1;
      if (a.type !== "mp4" && b.type === "mp4") return 1;
      const qA = parseInt(a.quality) || 0;
      const qB = parseInt(b.quality) || 0;
      return qB - qA;
    });

    console.log(`=== Found ${uniqueSources.length} unique sources ===`);

    return new Response(JSON.stringify({
      success: uniqueSources.length > 0,
      sources: uniqueSources,
    }), {
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
