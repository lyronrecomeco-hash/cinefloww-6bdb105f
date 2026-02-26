import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME")!;
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// AWS Signature V4 helpers
async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secret: string, date: string, region: string, service: string): Promise<Uint8Array> {
  let key = await hmacSha256(new TextEncoder().encode("AWS4" + secret), date);
  key = await hmacSha256(key, region);
  key = await hmacSha256(key, service);
  key = await hmacSha256(key, "aws4_request");
  return key;
}

async function signRequest(method: string, url: string, headers: Record<string, string>, body: Uint8Array | string | null) {
  const u = new URL(url);
  const now = new Date();
  const date = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dateShort = date.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const payloadHash = body ? await sha256Hex(body instanceof Uint8Array ? body : new TextEncoder().encode(body)) : "UNSIGNED-PAYLOAD";

  headers["x-amz-date"] = date;
  headers["x-amz-content-sha256"] = payloadHash;
  headers["host"] = u.host;

  const signedHeaderKeys = Object.keys(headers).sort().map(k => k.toLowerCase());
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}`).join("\n") + "\n";

  const canonicalRequest = [method, u.pathname, u.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await getSigningKey(R2_SECRET_ACCESS_KEY, dateShort, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

async function r2Upload(key: string, data: Uint8Array, contentType: string): Promise<boolean> {
  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
  const headers: Record<string, string> = { "content-type": contentType, "content-length": String(data.byteLength) };
  await signRequest("PUT", url, headers, data);
  const resp = await fetch(url, { method: "PUT", headers, body: data });
  return resp.ok;
}

async function r2Delete(key: string): Promise<boolean> {
  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`;
  const headers: Record<string, string> = {};
  await signRequest("DELETE", url, headers, null);
  const resp = await fetch(url, { method: "DELETE", headers });
  return resp.ok || resp.status === 204;
}

async function r2List(prefix: string): Promise<Array<{ key: string; size: number; lastModified: string }>> {
  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const headers: Record<string, string> = {};
  await signRequest("GET", url, headers, null);
  const resp = await fetch(url, { headers });
  const xml = await resp.text();
  
  const items: Array<{ key: string; size: number; lastModified: string }> = [];
  const matches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
  for (const m of matches) {
    const keyMatch = m[1].match(/<Key>(.*?)<\/Key>/);
    const sizeMatch = m[1].match(/<Size>(.*?)<\/Size>/);
    const dateMatch = m[1].match(/<LastModified>(.*?)<\/LastModified>/);
    if (keyMatch) {
      items.push({
        key: keyMatch[1],
        size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
        lastModified: dateMatch ? dateMatch[1] : "",
      });
    }
  }
  return items;
}

// Generate presigned URL for direct browser upload
async function presignPut(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const url = new URL(`${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`);
  const now = new Date();
  const date = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dateShort = date.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${R2_ACCESS_KEY_ID}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", date);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");

  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\n`;
  const canonicalRequest = [
    "PUT", url.pathname, url.searchParams.toString(),
    canonicalHeaders, "content-type;host", "UNSIGNED-PAYLOAD"
  ].join("\n");

  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const signingKey = await getSigningKey(R2_SECRET_ACCESS_KEY, dateShort, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}

// Public URL via custom CDN domain
function getPublicUrl(key: string): string {
  return `https://cdn.lyneflix.online/${key}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

    // === PRESIGN: Get presigned URL for direct upload ===
    if (action === "presign") {
      const { filename, content_type } = body;
      if (!filename || !content_type) {
        return new Response(JSON.stringify({ error: "filename and content_type required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const key = `vd/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const presignedUrl = await presignPut(key, content_type);
      const publicUrl = getPublicUrl(key);

      return new Response(JSON.stringify({ presigned_url: presignedUrl, public_url: publicUrl, key }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === INDEX: Save to video_cache after upload ===
    if (action === "index") {
      const { tmdb_id, content_type, title, video_url, video_type, season, episode, audio_type } = body;
      if (!tmdb_id || !content_type || !video_url) {
        return new Response(JSON.stringify({ error: "tmdb_id, content_type, video_url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: upsertErr } = await supabase.from("video_cache").upsert({
        tmdb_id,
        content_type,
        video_url,
        video_type: video_type || "mp4",
        provider: "r2-cdn",
        audio_type: audio_type || "dublado",
        season: season || 0,
        episode: episode || 0,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === LIST: List uploaded files ===
    if (action === "list") {
      const prefix = body.prefix || "vd/";
      const items = await r2List(prefix);
      return new Response(JSON.stringify({ items }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === DELETE: Remove file from R2 ===
    if (action === "delete") {
      const { key } = body;
      if (!key) {
        return new Response(JSON.stringify({ error: "key required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await r2Delete(key);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === INFO: Return bucket info ===
    if (action === "info") {
      return new Response(JSON.stringify({
        bucket: R2_BUCKET_NAME,
        endpoint: R2_ENDPOINT,
        configured: !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_BUCKET_NAME),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[upload-r2] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
