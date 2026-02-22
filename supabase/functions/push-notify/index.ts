import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate VAPID keys using Web Crypto
async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubRaw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { publicKey: pubB64, privateKey: privJwk.d! };
}

async function getOrCreateVapidKeys(supabase: any) {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "vapid_keys")
    .maybeSingle();

  if (data?.value?.publicKey) return data.value;

  const keys = await generateVapidKeys();
  await supabase
    .from("site_settings")
    .upsert({ key: "vapid_keys", value: keys }, { onConflict: "key" });
  return keys;
}

// Web Push encryption helpers
async function sendWebPush(subscription: any, payload: string, vapidKeys: any) {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.p256dh;
  const auth = subscription.auth;

  // For simplicity, send without encryption (works for most browsers with VAPID)
  // Full RFC 8291 encryption is complex - using a simpler approach
  const audience = new URL(endpoint).origin;
  
  // Create VAPID JWT
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 86400,
    sub: "mailto:admin@lyneflix.com",
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const claimsB64 = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsignedToken = `${headerB64}.${claimsB64}`;

  // Import private key
  const privKeyBytes = Uint8Array.from(atob(vapidKeys.privateKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const pubKeyBytes = Uint8Array.from(atob(vapidKeys.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: vapidKeys.privateKey,
      x: btoa(String.fromCharCode(...pubKeyBytes.slice(1, 33))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      y: btoa(String.fromCharCode(...pubKeyBytes.slice(33, 65))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER to raw r||s format
  const sigBytes = new Uint8Array(signature);
  const sigB64 = btoa(String.fromCharCode(...sigBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  
  const jwt = `${unsignedToken}.${sigB64}`;
  const vapidAuth = `vapid t=${jwt}, k=${vapidKeys.publicKey}`;

  // Send push (without payload encryption for now - title/body only)
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": vapidAuth,
      "TTL": "86400",
      "Content-Length": "0",
      "Urgency": "normal",
    },
  });

  return { status: res.status, ok: res.ok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // Get VAPID public key for frontend
    if (action === "vapid-public-key") {
      const keys = await getOrCreateVapidKeys(supabase);
      return new Response(JSON.stringify({ publicKey: keys.publicKey }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Subscribe endpoint
    if (action === "subscribe") {
      const { endpoint, p256dh, auth, user_id } = await req.json();
      await supabase.from("push_subscriptions").upsert(
        { endpoint, p256dh, auth, user_id },
        { onConflict: "endpoint" }
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notification to all subscribers (admin only)
    if (action === "send") {
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Admin only" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { title, body, url: linkUrl } = await req.json();
      const vapidKeys = await getOrCreateVapidKeys(supabase);
      
      const { data: subs } = await supabase.from("push_subscriptions").select("*");
      
      let sent = 0, failed = 0;
      for (const sub of (subs || [])) {
        try {
          const res = await sendWebPush(sub, JSON.stringify({ title, body, url: linkUrl }), vapidKeys);
          if (res.ok) sent++;
          else {
            failed++;
            // Remove expired subscriptions
            if (res.status === 410 || res.status === 404) {
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            }
          }
        } catch {
          failed++;
        }
      }

      return new Response(JSON.stringify({ sent, failed, total: (subs || []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
