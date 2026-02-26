import { useState, useEffect, useCallback } from "react";
import {
  Server, Copy, Check, Terminal, RefreshCw, Play, Download, Zap, Wifi, WifiOff,
  Activity, Clock, Cpu, HardDrive, Eye, EyeOff, Save, Trash2, Search,
  Database, Link2, RotateCcw, Loader2, ChevronLeft, ChevronRight, Filter
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface VpsHeartbeat {
  status: "online" | "offline";
  uptime_seconds?: number;
  workers?: Record<string, string>;
  last_beat?: string;
  hostname?: string;
  memory_mb?: number;
  node_version?: string;
}

interface CachedLink {
  id: string;
  tmdb_id: number;
  content_type: string;
  audio_type: string;
  video_type: string;
  provider: string;
  season: number | null;
  episode: number | null;
  expires_at: string;
  created_at: string;
  video_url: string;
  title?: string;
}

// ── Helpers ──

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

function parseHeartbeatValue(raw: unknown): VpsHeartbeat | null {
  if (!raw) return null;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return null; } }
  if (typeof raw === "object") return raw as VpsHeartbeat;
  return null;
}

function isHeartbeatOnline(hb: VpsHeartbeat | null): boolean {
  if (!hb || hb.status === "offline") return false;
  if (!hb.last_beat) return hb.status === "online";
  return Date.now() - new Date(hb.last_beat).getTime() < HEARTBEAT_STALE_MS;
}

// ── Install script (uses string concat — NO template literals in .mjs) ──

function buildInstallScript(supabaseUrl: string, serviceKey: string, vpsPort: string = "3377"): string {
  const keyOrPlaceholder = serviceKey || "COLE_SUA_SERVICE_ROLE_KEY_AQUI";
  return `#!/bin/bash
set -e

echo "🚀 Instalando ambiente LyneFlix VPS..."

# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 global
sudo npm i -g pm2

# Criar diretório do projeto
mkdir -p ~/lyneflix-vps && cd ~/lyneflix-vps

# package.json
cat > package.json << 'PKGJSON'
{
  "name": "lyneflix-vps",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "start": "pm2 start ecosystem.config.cjs",
    "stop": "pm2 stop all",
    "logs": "pm2 logs",
    "status": "pm2 status"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.95.3",
    "node-fetch": "^3.3.2",
    "dotenv": "^16.4.7"
  }
}
PKGJSON

npm install

# Criar .env
cat > .env << 'ENVFILE'
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${keyOrPlaceholder}
VPS_API_PORT=${vpsPort}
RESOLVE_CONCURRENCY=2
RESOLVE_BATCH_SIZE=8
RESOLVE_LOOP_DELAY_MS=4000
CATALOG_PAGES_PER_WAVE=6
CATALOG_DELAY_MS=1200
API_TIMEOUT_MS=12000
ENVFILE

# ecosystem.config.cjs — com limites de concorrência para não sobrecarregar o banco
cat > ecosystem.config.cjs << 'ECOFILE'
module.exports = {
  apps: [
    {
      name: "api-server",
      script: "scripts/api-server.mjs",
      autorestart: true,
      max_memory_restart: "300M",
      env: { PORT: process.env.VPS_API_PORT || "3377", API_TIMEOUT_MS: "12000" }
    },
    {
      name: "heartbeat",
      script: "scripts/heartbeat.mjs",
      cron_restart: "*/2 * * * *",
      autorestart: false,
      max_memory_restart: "100M"
    },
    {
      name: "content-watcher",
      script: "scripts/content-watcher.mjs",
      autorestart: true,
      max_memory_restart: "150M",
      restart_delay: 5000
    },
    {
      name: "backup-sync",
      script: "scripts/backup-sync.mjs",
      cron_restart: "0 */6 * * *",
      autorestart: false,
      max_memory_restart: "150M"
    },
    {
      name: "cineveo-catalog",
      script: "scripts/cineveo-catalog.mjs",
      cron_restart: "0 */4 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: { CATALOG_PAGES_PER_WAVE: "6", CATALOG_DELAY_MS: "1200" }
    },
    {
      name: "batch-resolve",
      script: "scripts/batch-resolve.mjs",
      cron_restart: "0 */3 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: { RESOLVE_CONCURRENCY: "2", RESOLVE_BATCH_SIZE: "8", RESOLVE_LOOP_DELAY_MS: "4000" }
    },
    {
      name: "turbo-resolve",
      script: "scripts/turbo-resolve.mjs",
      cron_restart: "30 */2 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: { RESOLVE_CONCURRENCY: "2", RESOLVE_BATCH_SIZE: "8", RESOLVE_LOOP_DELAY_MS: "4000" }
    },
    {
      name: "refresh-links",
      script: "scripts/refresh-links.mjs",
      cron_restart: "0 4 * * *",
      autorestart: false,
      max_memory_restart: "200M"
    },
    {
      name: "cleanup",
      script: "scripts/cleanup.mjs",
      cron_restart: "0 5 * * *",
      autorestart: false,
      max_memory_restart: "100M"
    },
    {
      name: "iptv-indexer",
      script: "scripts/iptv-indexer.mjs",
      autorestart: true,
      max_memory_restart: "256M"
    },
  ],
};
ECOFILE

mkdir -p scripts

# ── api-server.mjs — VPS API Server with in-memory cache ──
cat > scripts/api-server.mjs << 'SCRIPTEOF'
import http from "http";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var PORT = parseInt(process.env.VPS_API_PORT || "3377");

// ── In-memory catalog cache ──
var catalogCache = { data: [], updated: 0, ttl: 5 * 60 * 1000 };
var videoStatusCache = new Map(); // tmdb_id -> { url, type, provider, expires }

async function refreshCatalog() {
  try {
    var all = [];
    var page = 0;
    var pageSize = 1000;
    while (true) {
      var r = await sb.from("content").select("tmdb_id, title, content_type, poster_path, backdrop_path, overview, release_date, vote_average, featured, audio_type, imdb_id, number_of_seasons, number_of_episodes").range(page * pageSize, (page + 1) * pageSize - 1);
      if (r.error) break;
      all = all.concat(r.data);
      if (r.data.length < pageSize) break;
      page++;
    }
    catalogCache.data = all;
    catalogCache.updated = Date.now();
    console.log("[api-server] Catalog refreshed: " + all.length + " items");
  } catch (e) { console.error("[api-server] Catalog refresh error:", e.message); }
}

async function refreshVideoStatuses() {
  try {
    var all = [];
    var page = 0;
    var pageSize = 1000;
    while (true) {
      var r = await sb.from("video_cache").select("tmdb_id, content_type, video_url, video_type, provider, season, episode, expires_at").gt("expires_at", new Date().toISOString()).range(page * pageSize, (page + 1) * pageSize - 1);
      if (r.error) break;
      all = all.concat(r.data);
      if (r.data.length < pageSize) break;
      page++;
    }
    videoStatusCache.clear();
    for (var v of all) {
      var key = v.tmdb_id + "_" + v.content_type + "_" + (v.season || 0) + "_" + (v.episode || 0);
      videoStatusCache.set(key, v);
    }
    console.log("[api-server] Video cache loaded: " + all.length + " links");
  } catch (e) { console.error("[api-server] Video cache refresh error:", e.message); }
}

// Initial load + periodic refresh
refreshCatalog();
refreshVideoStatuses();
setInterval(refreshCatalog, 5 * 60 * 1000);
setInterval(refreshVideoStatuses, 3 * 60 * 1000);

// ── HTTP Server ──
function parseBody(req) {
  return new Promise(function(resolve) {
    var body = "";
    req.on("data", function(c) { body += c; });
    req.on("end", function() {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function sendJson(res, data, status) {
  res.writeHead(status || 200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

var server = http.createServer(async function(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  var url = new URL(req.url, "http://localhost");
  var path = url.pathname;

  // ── Health ──
  if (path === "/health") {
    return sendJson(res, {
      status: "ok",
      uptime: process.uptime(),
      catalog_size: catalogCache.data.length,
      video_cache_size: videoStatusCache.size,
      catalog_age_seconds: Math.round((Date.now() - catalogCache.updated) / 1000),
    });
  }

  // ── Catalog list ──
  if (path === "/api/catalog" && req.method === "GET") {
    var type = url.searchParams.get("type");
    var items = catalogCache.data;
    if (type) items = items.filter(function(i) { return i.content_type === type; });
    return sendJson(res, { items: items, total: items.length, cached: true });
  }

  // ── Catalog detail ──
  if (path.startsWith("/api/catalog/") && req.method === "GET") {
    var tmdbId = parseInt(path.split("/")[3]);
    var ctype = url.searchParams.get("type") || "movie";
    var item = catalogCache.data.find(function(i) { return i.tmdb_id === tmdbId && i.content_type === ctype; });
    if (!item) return sendJson(res, { error: "Not found" }, 404);
    // Attach video status
    var vkey = tmdbId + "_" + ctype + "_0_0";
    var vs = videoStatusCache.get(vkey) || null;
    return sendJson(res, { ...item, video_status: vs });
  }

  // ── Extract video (proxy to Edge Function with long timeout) ──
  if (path === "/api/extract-video" && req.method === "POST") {
    var params = await parseBody(req);
    try {
      var r2 = await fetch(process.env.SUPABASE_URL + "/functions/v1/extract-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(300000), // 5 min timeout
      });
      var data = await r2.json();
      // Update local video cache if successful
      if (data && data.url) {
        var cacheKey = (params.tmdb_id || 0) + "_" + (params.content_type || "movie") + "_" + (params.season || 0) + "_" + (params.episode || 0);
        videoStatusCache.set(cacheKey, { video_url: data.url, video_type: data.type, provider: data.provider, tmdb_id: params.tmdb_id });
      }
      return sendJson(res, data);
    } catch (e) {
      return sendJson(res, { error: e.message || "Timeout" }, 500);
    }
  }

  // ── Force refresh caches ──
  if (path === "/api/refresh-cache" && req.method === "POST") {
    await Promise.all([refreshCatalog(), refreshVideoStatuses()]);
    return sendJson(res, { message: "Caches refreshed", catalog: catalogCache.data.length, videos: videoStatusCache.size });
  }


  // ── Notify new content (webhook from admin/imports) ──
  if (path === "/api/notify-new-content" && req.method === "POST") {
    var payload = await parseBody(req);
    var items = payload.items || [];
    if (items.length === 0 && payload.tmdb_id) items = [payload];
    console.log("[api-server] 🆕 Notified of " + items.length + " new content items to resolve");
    // Queue them for resolution in background
    (async function() {
      var ok = 0, fail = 0;
      for (var item of items) {
        try {
          var r3 = await fetch(process.env.SUPABASE_URL + "/functions/v1/extract-video", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
            body: JSON.stringify({ tmdb_id: item.tmdb_id, imdb_id: item.imdb_id || null, content_type: item.content_type || "movie", title: item.title || "" }),
            signal: AbortSignal.timeout(120000),
          });
          var d3 = await r3.json();
          if (d3 && d3.url) { ok++; var ck = item.tmdb_id + "_" + (item.content_type || "movie") + "_0_0"; videoStatusCache.set(ck, d3); }
          else fail++;
        } catch(e) { fail++; }
      }
      console.log("[api-server] Resolve done: ok=" + ok + " fail=" + fail);
    })();
    return sendJson(res, { queued: items.length, message: "Processing in background" });
  }

  // ── Trigger CineVeo catalog sync ──
  if (path === "/api/trigger-cineveo" && req.method === "POST") {
    console.log("[api-server] 🎬 Triggering CineVeo catalog sync via PM2...");
    try {
      var { execSync } = await import("child_process");
      execSync("pm2 restart cineveo-catalog", { encoding: "utf-8" });
      return sendJson(res, { message: "CineVeo catalog sync triggered", status: "ok" });
    } catch(e) {
      return sendJson(res, { message: "Trigger sent", error: e.message });
    }
  }

  // ── 404 ──
  sendJson(res, { error: "Not found" }, 404);
});

server.listen(PORT, "0.0.0.0", function() {
  console.log("[api-server] 🚀 VPS API Server rodando na porta " + PORT);
});
SCRIPTEOF

# ── heartbeat.mjs ──
cat > scripts/heartbeat.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { config } from "dotenv";
import os from "os";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function send() {
  var workers = {};
  try {
    var apps = JSON.parse(execSync("pm2 jlist", { encoding: "utf-8" }));
    for (var a of apps) workers[a.name] = a.pm2_env?.status || "unknown";
  } catch(e) { workers = { error: "pm2 err" }; }

  var hb = {
    status: "online",
    uptime_seconds: os.uptime(),
    workers: workers,
    last_beat: new Date().toISOString(),
    hostname: os.hostname(),
    memory_mb: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
    node_version: process.version,
  };

  var r = await sb.from("site_settings").upsert({ key: "vps_heartbeat", value: hb }, { onConflict: "key" });
  if (r.error) console.error("[heartbeat] Erro:", r.error.message);
  else console.log("[heartbeat] OK", new Date().toISOString());
}

send().catch(console.error);
SCRIPTEOF

# ── batch-resolve.mjs ──
cat > scripts/batch-resolve.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var BATCH = parseInt(process.env.BATCH_SIZE || "1000");
var CONC = parseInt(process.env.CONCURRENCY || "40");

async function main() {
  console.log("[batch-resolve] Iniciando...");
  var r = await sb.rpc("get_unresolved_content", { batch_limit: BATCH });
  if (r.error) throw r.error;
  var items = r.data || [];
  if (!items.length) { console.log("[batch-resolve] Nada."); return; }
  console.log("[batch-resolve] " + items.length + " itens");

  var idx = 0, ok = 0, fail = 0;
  async function worker() {
    while (idx < items.length) {
      var i = idx++;
      var item = items[i];
      try {
        var res = await fetch(process.env.SUPABASE_URL + "/functions/v1/extract-video", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
          body: JSON.stringify({ tmdb_id: item.tmdb_id, imdb_id: item.imdb_id, content_type: item.content_type, title: item.title }),
          signal: AbortSignal.timeout(120000),
        });
        var data = await res.json();
        if (data && data.url && data.type !== "iframe-proxy") ok++;
        else fail++;
      } catch(e) { fail++; }
      if ((ok + fail) % 50 === 0) console.log("[batch] " + (ok + fail) + "/" + items.length + " (ok:" + ok + " fail:" + fail + ")");
    }
  }

  await Promise.all(Array.from({ length: CONC }, function() { return worker(); }));
  console.log("[batch-resolve] Done: ok=" + ok + " fail=" + fail);
}

main().catch(console.error);
SCRIPTEOF

# ── turbo-resolve.mjs ──
cat > scripts/turbo-resolve.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("[turbo] Limpando falhas...");
  await sb.from("resolve_failures").delete().gte("tmdb_id", 0);
  await sb.from("video_cache").delete().lt("expires_at", new Date().toISOString());
  console.log("[turbo] Disparando batch-resolve...");
  var res = await fetch(process.env.SUPABASE_URL + "/functions/v1/batch-resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ _wave: 1 }),
    signal: AbortSignal.timeout(300000),
  });
  var data = await res.json();
  console.log("[turbo] Resultado:", JSON.stringify(data));
}

main().catch(console.error);
SCRIPTEOF

# ── refresh-links.mjs ──
cat > scripts/refresh-links.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("[refresh] Iniciando...");
  var res = await fetch(process.env.SUPABASE_URL + "/functions/v1/refresh-links", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ mode: "expiring", session_id: "vps-" + Date.now() }),
    signal: AbortSignal.timeout(300000),
  });
  var data = await res.json();
  console.log("[refresh] Resultado:", JSON.stringify(data));
}

main().catch(console.error);
SCRIPTEOF

# ── cleanup.mjs ──
cat > scripts/cleanup.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("[cleanup] Limpando...");
  var now = Date.now();
  await sb.from("resolve_logs").delete().lt("created_at", new Date(now - 7*86400000).toISOString());
  await sb.from("resolve_failures").delete().lt("attempted_at", new Date(now - 3*86400000).toISOString());
  await sb.from("site_visitors").delete().lt("visited_at", new Date(now - 14*86400000).toISOString());
  await sb.from("video_cache").delete().lt("expires_at", new Date().toISOString());
  console.log("[cleanup] OK!");
}

main().catch(console.error);
SCRIPTEOF

# ── iptv-indexer.mjs — 24/7 IPTV M3U Indexer + MegaEmbed Replacer + Cache Cleaner ──
cat > scripts/iptv-indexer.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var CYCLE_HOURS = 6;
var BATCH_INSERT = 500;
var TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function saveProgress(phase, data) {
  await sb.from("site_settings").upsert({
    key: "iptv_indexer_progress",
    value: { phase: phase, updated_at: new Date().toISOString(), ...data },
  }, { onConflict: "key" });
}

function parseM3U(text) {
  var lines = text.split("\\n");
  var entries = [];
  var infoLine = "";
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) { infoLine = line; continue; }
    if (line.startsWith("#") || !line) continue;
    if (infoLine) {
      var entry = parseEntry(infoLine, line);
      if (entry) entries.push(entry);
      infoLine = "";
    }
  }
  return entries;
}

function parseEntry(info, url) {
  var groupMatch = info.match(/group-title="([^"]*)"/);
  var nameMatch = info.match(/,\\s*(.+)$/);
  var title = nameMatch ? nameMatch[1].trim() : "";
  if (!title || !url) return null;
  var group = groupMatch ? groupMatch[1] : "";

  var tmdbId = null;
  var contentType = "movie";
  var tvgMatch = info.match(/tvg-id="(?:movie|tv|series):(\\d+)"/);
  if (tvgMatch) {
    tmdbId = parseInt(tvgMatch[1]);
    if (info.match(/tvg-id="(?:tv|series):/)) contentType = "series";
  }
  if (!tmdbId) {
    var fMatch = url.match(/\\/(\\d+)\\.(?:mp4|m3u8|mkv|ts)/);
    if (fMatch) tmdbId = parseInt(fMatch[1]);
  }
  if (!tmdbId) {
    var pMatch = url.match(/\\/(?:movie|tv|embed)\\/.*?\\/(\\d+)/);
    if (pMatch) tmdbId = parseInt(pMatch[1]);
  }

  var season = null, episode = null;
  var seMatch = title.match(/S(\\d+)\\s*E(\\d+)/i) || url.match(/\\/(\\d+)\\/(\\d+)\\/?$/);
  if (seMatch) { season = parseInt(seMatch[1]); episode = parseInt(seMatch[2]); }

  var gl = group.toLowerCase();
  if (gl.includes("serie") || gl.includes("séri") || gl.includes("novela") || season !== null) contentType = "series";
  else if (gl.includes("dorama")) contentType = "dorama";
  else if (gl.includes("anime")) contentType = "anime";

  return { title: title, url: url, group: group, tmdbId: tmdbId, season: season, episode: episode, contentType: contentType };
}

function detectVideoType(url) {
  if (url.includes(".m3u8") || url.includes("/hls/")) return "m3u8";
  if (url.includes(".mp4")) return "mp4";
  return "m3u8";
}

function detectAudio(title, group) {
  var c = (title + " " + group).toLowerCase();
  if (c.includes("leg") || c.includes("legendado")) return "legendado";
  return "dublado";
}

// ── Phase 1: Replace all megaembed entries with cineveo-iptv ──
async function replaceMegaembed() {
  console.log("[iptv-indexer] Phase 1: Replacing megaembed entries...");
  var total = 0;
  while (true) {
    var r = await sb.from("video_cache").select("id, tmdb_id").eq("provider", "megaembed").limit(500);
    if (r.error || !r.data || r.data.length === 0) break;
    var ids = r.data.map(function(x) { return x.id; });
    await sb.from("video_cache").delete().in("id", ids);
    total += ids.length;
    console.log("[iptv-indexer] Deleted " + total + " megaembed entries so far...");
  }
  // Also check megaembed in backup
  while (true) {
    var r2 = await sb.from("video_cache_backup").select("id").eq("provider", "megaembed").limit(500);
    if (r2.error || !r2.data || r2.data.length === 0) break;
    var ids2 = r2.data.map(function(x) { return x.id; });
    await sb.from("video_cache_backup").delete().in("id", ids2);
  }
  console.log("[iptv-indexer] Megaembed cleanup done: " + total + " removed from cache.");
  return total;
}

// ── Phase 2: Clean expired cache ──
async function cleanExpiredCache() {
  console.log("[iptv-indexer] Phase 2: Cleaning expired cache...");
  var now = new Date().toISOString();
  var r = await sb.from("video_cache").delete().lt("expires_at", now);
  // Clean old logs
  var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  await sb.from("resolve_logs").delete().lt("created_at", weekAgo);
  var threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  await sb.from("resolve_failures").delete().lt("attempted_at", threeDaysAgo);
  console.log("[iptv-indexer] Cache cleanup done.");
}

// ── Phase 3: Download and index M3U ──
async function indexM3U() {
  console.log("[iptv-indexer] Phase 3: Fetching M3U URL from settings...");
  var r = await sb.from("site_settings").select("value").eq("key", "iptv_m3u_url").maybeSingle();
  if (!r.data || !r.data.value) { console.log("[iptv-indexer] No M3U URL configured. Skipping."); return 0; }
  var m3uUrl = typeof r.data.value === "string" ? r.data.value.replace(/^"|"$/g, "") : r.data.value.url || "";
  if (!m3uUrl) { console.log("[iptv-indexer] M3U URL empty. Skipping."); return 0; }

  console.log("[iptv-indexer] Downloading M3U: " + m3uUrl.substring(0, 80) + "...");
  await saveProgress("downloading", { url: m3uUrl });

  var res = await fetch(m3uUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) { console.error("[iptv-indexer] Failed to fetch M3U: " + res.status); return 0; }
  var text = await res.text();
  console.log("[iptv-indexer] Downloaded " + Math.round(text.length / 1024) + " KB");

  var entries = parseM3U(text);
  console.log("[iptv-indexer] Parsed " + entries.length + " entries");

  var valid = entries.filter(function(e) { return e.tmdbId && e.tmdbId > 100; });
  console.log("[iptv-indexer] " + valid.length + " valid with TMDB IDs");

  if (valid.length === 0) return 0;

  await saveProgress("importing_cache", { total: valid.length, imported: 0 });

  // Delete old cineveo-iptv entries for these IDs
  var tmdbIds = [...new Set(valid.map(function(e) { return e.tmdbId; }))];
  for (var i = 0; i < tmdbIds.length; i += 500) {
    await sb.from("video_cache").delete().eq("provider", "cineveo-iptv").in("tmdb_id", tmdbIds.slice(i, i + 500));
  }

  // Insert new cache rows
  var validTypes = new Set(["movie", "series", "dorama", "anime"]);
  var imported = 0;
  for (var i = 0; i < valid.length; i += BATCH_INSERT) {
    var rawBatch = valid.slice(i, i + BATCH_INSERT).map(function(e) {
      return {
        tmdb_id: e.tmdbId,
        content_type: validTypes.has(e.contentType) ? e.contentType : "movie",
        audio_type: detectAudio(e.title, e.group),
        video_url: e.url,
        video_type: detectVideoType(e.url),
        provider: "cineveo-iptv",
        season: Number(e.season ?? 0) || 0,
        episode: Number(e.episode ?? 0) || 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    });

    // Deduplicate by unique key before upsert to prevent batch conflicts
    var dedupe = new Map();
    for (var row of rawBatch) {
      var key = row.tmdb_id + "|" + row.content_type + "|" + row.audio_type + "|" + row.season + "|" + row.episode;
      dedupe.set(key, row);
    }

    var batch = Array.from(dedupe.values());
    if (batch.length === 0) continue;

    var ins = await sb.from("video_cache").upsert(batch, {
      onConflict: "tmdb_id,content_type,audio_type,season,episode"
    });
    if (ins.error) console.error("[iptv-indexer] Upsert error:", ins.error.message);
    else imported += batch.length;
    if (imported % 2000 === 0) await saveProgress("importing_cache", { total: valid.length, imported: imported });
  }
  console.log("[iptv-indexer] Cache imported: " + imported + " entries");

  // ── Phase 4: Enrich missing content with TMDB ──
  await saveProgress("enriching", { imported: imported });

  var allCacheIds = new Set();
  var offset = 0;
  while (true) {
    var cb = await sb.from("video_cache").select("tmdb_id").eq("provider", "cineveo-iptv").range(offset, offset + 999);
    if (!cb.data || cb.data.length === 0) break;
    cb.data.forEach(function(r) { allCacheIds.add(r.tmdb_id); });
    offset += 1000;
    if (cb.data.length < 1000) break;
  }

  var existingIds = new Set();
  var allIds = [...allCacheIds];
  for (var i = 0; i < allIds.length; i += 500) {
    var ex = await sb.from("content").select("tmdb_id").in("tmdb_id", allIds.slice(i, i + 500));
    if (ex.data) ex.data.forEach(function(e) { existingIds.add(e.tmdb_id); });
  }

  var newIds = allIds.filter(function(id) { return !existingIds.has(id); });
  console.log("[iptv-indexer] " + newIds.length + " new content to enrich from TMDB");

  if (newIds.length > 0) {
    // Get type mapping
    var typeMap = new Map();
    for (var i = 0; i < newIds.length; i += 500) {
      var tr = await sb.from("video_cache").select("tmdb_id, content_type").eq("provider", "cineveo-iptv").in("tmdb_id", newIds.slice(i, i + 500));
      if (tr.data) tr.data.forEach(function(r) { typeMap.set(r.tmdb_id, r.content_type); });
    }

    // TMDB enrichment with 5 parallel workers
    var queue = [...newIds];
    var tmdbDetails = new Map();
    var CONC = 5;

    async function enrichWorker() {
      while (queue.length > 0) {
        var id = queue.shift();
        if (!id) break;
        var ct = typeMap.get(id) || "movie";
        var type = (ct === "series" || ct === "dorama" || ct === "anime") ? "tv" : "movie";
        try {
          var r = await fetch("https://api.themoviedb.org/3/" + type + "/" + id + "?language=pt-BR&append_to_response=external_ids", {
            headers: { "Authorization": "Bearer " + TMDB_TOKEN, "Content-Type": "application/json" },
          });
          if (r.ok) tmdbDetails.set(id, await r.json());
        } catch(e) { /* skip */ }
        if (tmdbDetails.size % 50 === 0) console.log("[iptv-indexer] Enriched " + tmdbDetails.size + "/" + newIds.length);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONC, newIds.length) }, function() { return enrichWorker(); }));

    var contentRows = newIds.filter(function(id) { return tmdbDetails.has(id); }).map(function(id) {
      var d = tmdbDetails.get(id);
      var ct = typeMap.get(id) || "movie";
      return {
        tmdb_id: id,
        imdb_id: d.imdb_id || (d.external_ids ? d.external_ids.imdb_id : null) || null,
        content_type: validTypes.has(ct) ? ct : "movie",
        title: d.title || d.name || ("TMDB " + id),
        original_title: d.original_title || d.original_name || null,
        overview: d.overview || "",
        poster_path: d.poster_path || null,
        backdrop_path: d.backdrop_path || null,
        release_date: d.release_date || d.first_air_date || null,
        vote_average: d.vote_average || 0,
        runtime: d.runtime || null,
        number_of_seasons: d.number_of_seasons || null,
        number_of_episodes: d.number_of_episodes || null,
        status: "published",
        featured: false,
        audio_type: ["dublado"],
      };
    });

    var contentImported = 0;
    for (var i = 0; i < contentRows.length; i += 200) {
      var batch = contentRows.slice(i, i + 200);
      var ur = await sb.from("content").upsert(batch, { onConflict: "tmdb_id,content_type" });
      if (ur.error) console.error("[iptv-indexer] Content error:", ur.error.message);
      else contentImported += batch.length;
    }
    console.log("[iptv-indexer] Content enriched: " + contentImported + " items");
  }

  return imported;
}

// ── Main loop (24/7) ──
async function runCycle() {
  var start = Date.now();
  console.log("[iptv-indexer] ═══════ Cycle starting at " + new Date().toISOString() + " ═══════");

  try {
    await saveProgress("starting", {});
    var megaRemoved = await replaceMegaembed();
    await cleanExpiredCache();
    var imported = await indexM3U();

    var elapsed = Math.round((Date.now() - start) / 1000);
    await saveProgress("idle", {
      last_run: new Date().toISOString(),
      mega_removed: megaRemoved,
      imported: imported,
      elapsed_seconds: elapsed,
      next_run: new Date(Date.now() + CYCLE_HOURS * 3600000).toISOString(),
    });
    console.log("[iptv-indexer] ═══════ Cycle done in " + elapsed + "s. Next in " + CYCLE_HOURS + "h ═══════");
  } catch (e) {
    console.error("[iptv-indexer] Cycle error:", e.message || e);
    await saveProgress("error", { error: e.message || String(e) });
  }
}

// Run immediately, then every CYCLE_HOURS
runCycle();
setInterval(runCycle, CYCLE_HOURS * 3600 * 1000);
// Keep alive
setInterval(function() {}, 60000);
SCRIPTEOF

# ── content-watcher.mjs — Realtime watcher: auto-resolve new content ──
cat > scripts/content-watcher.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var CONC = parseInt(process.env.CONCURRENCY || "10");
var resolveQueue = [];
var processing = false;

async function resolveItem(item) {
  try {
    console.log("[content-watcher] Resolving: " + item.title + " (" + item.tmdb_id + ")");
    var res = await fetch(process.env.SUPABASE_URL + "/functions/v1/extract-video", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ tmdb_id: item.tmdb_id, imdb_id: item.imdb_id || null, content_type: item.content_type, title: item.title }),
      signal: AbortSignal.timeout(120000),
    });
    var data = await res.json();
    if (data && data.url && data.type !== "iframe-proxy") {
      console.log("[content-watcher] ✅ " + item.title + " -> " + data.provider);
    } else {
      console.log("[content-watcher] ❌ " + item.title + " sem link direto");
    }
  } catch(e) {
    console.error("[content-watcher] Erro " + item.title + ":", e.message);
  }
}

async function processQueue() {
  if (processing || resolveQueue.length === 0) return;
  processing = true;
  console.log("[content-watcher] Queue: " + resolveQueue.length + " itens");
  while (resolveQueue.length > 0) {
    var batch = resolveQueue.splice(0, CONC);
    await Promise.all(batch.map(resolveItem));
  }
  processing = false;
}

function startWatcher() {
  console.log("[content-watcher] 👀 Watching for new content via Realtime...");
  var channel = sb.channel("content-changes")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "content" }, function(payload) {
      var row = payload.new;
      console.log("[content-watcher] 🆕 Novo conteúdo: " + row.title + " (tmdb:" + row.tmdb_id + ")");
      resolveQueue.push({ tmdb_id: row.tmdb_id, imdb_id: row.imdb_id, content_type: row.content_type, title: row.title });
      processQueue();
    })
    .subscribe(function(status) {
      console.log("[content-watcher] Realtime status:", status);
    });
}

// Also do initial sweep for unresolved
async function initialSweep() {
  console.log("[content-watcher] Initial sweep for unresolved content...");
  var r = await sb.rpc("get_unresolved_content", { batch_limit: 200 });
  if (r.error) { console.error("[content-watcher] Sweep error:", r.error.message); return; }
  var items = r.data || [];
  if (items.length === 0) { console.log("[content-watcher] All resolved!"); return; }
  console.log("[content-watcher] " + items.length + " unresolved found, queueing...");
  resolveQueue.push(...items);
  processQueue();
}

startWatcher();
initialSweep();
// Keep alive
setInterval(function() {}, 60000);
SCRIPTEOF

# ── backup-sync.mjs — Backup video_cache to video_cache_backup periodically ──
cat > scripts/backup-sync.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("[backup-sync] Starting full backup...");
  var total = 0;
  var offset = 0;
  var pageSize = 500;

  while (true) {
    var r = await sb.from("video_cache").select("tmdb_id, content_type, audio_type, video_url, video_type, provider, season, episode").gt("expires_at", new Date().toISOString()).range(offset, offset + pageSize - 1);
    if (r.error) { console.error("[backup-sync] Read error:", r.error.message); break; }
    if (!r.data || r.data.length === 0) break;

    var rows = r.data.map(function(v) {
      return {
        tmdb_id: v.tmdb_id,
        content_type: v.content_type,
        audio_type: v.audio_type || "legendado",
        video_url: v.video_url,
        video_type: v.video_type || "m3u8",
        provider: v.provider || "unknown",
        season: v.season || 0,
        episode: v.episode || 0,
      };
    });

    for (var i = 0; i < rows.length; i += 100) {
      var batch = rows.slice(i, i + 100);
      var ur = await sb.from("video_cache_backup").upsert(batch, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });
      if (ur.error) console.error("[backup-sync] Upsert error:", ur.error.message);
    }

    total += r.data.length;
    offset += pageSize;
    if (r.data.length < pageSize) break;
  }

  console.log("[backup-sync] ✅ Backup concluído: " + total + " links salvos.");

  // Stats
  var statsR = await sb.from("video_cache_backup").select("id", { count: "exact", head: true });
  console.log("[backup-sync] Total no backup: " + (statsR.count || "?"));
}

main().catch(console.error);
SCRIPTEOF

# ── cineveo-catalog.mjs — Full pagination CineVeo API sync (VPS-heavy) ──
cat > scripts/cineveo-catalog.mjs << 'SCRIPTEOF'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

var sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
var CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
var CINEVEO_USER = "lyneflix-vods";
var CINEVEO_PASS = "uVljs2d";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function normalizeDate(val) {
  var raw = String(val ?? "").trim();
  if (!raw) return null;
  if (/^\\d{4}$/.test(raw)) { var y = Number(raw); return (y >= 1800 && y <= 2100) ? y + "-01-01" : null; }
  var d = raw.slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d)) return null;
  return d;
}

async function saveProgress(phase, data) {
  await sb.from("site_settings").upsert({
    key: "cineveo_vps_progress",
    value: { phase: phase, updated_at: new Date().toISOString(), ...data },
  }, { onConflict: "key" });
}

async function fetchPage(apiType, page) {
  var url = CINEVEO_API + "?username=" + CINEVEO_USER + "&password=" + CINEVEO_PASS + "&type=" + apiType + "&page=" + page;
  var res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(apiType + " page " + page + " returned " + res.status);
  var payload = await res.json();
  // API returns { success, pagination: { total_pages, total_items }, data: [...] }
  var items = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []);
  var totalPages = Number(payload?.pagination?.total_pages || 0) || null;
  var totalItems = Number(payload?.pagination?.total_items || 0) || 0;
  return { items: items, totalPages: totalPages, totalItems: totalItems };
}

async function main() {
  console.log("[cineveo-catalog] ═══════════════════════════════════════");
  console.log("[cineveo-catalog] 🎬 Starting FULL CineVeo API catalog sync");
  console.log("[cineveo-catalog] ═══════════════════════════════════════");
  var totalContent = 0, totalCache = 0, totalPages = 0;

  for (var apiType of ["movies", "series"]) {
    var contentType = apiType === "movies" ? "movie" : "series";
    var page = 1;
    var emptyStreak = 0;
    var errors = 0;

    console.log("");
    console.log("[cineveo-catalog] ── Processing: " + apiType.toUpperCase() + " ──");

    while (true) {
      var pageData;
      try {
        pageData = await fetchPage(apiType, page);
      } catch (e) {
        errors++;
        console.error("[cineveo-catalog] ❌ Page " + page + " error: " + e.message);
        if (errors >= 5) { console.log("[cineveo-catalog] Too many errors, moving on."); break; }
        page++;
        await sleep(2000);
        continue;
      }

      if (pageData.items.length === 0) { emptyStreak++; if (emptyStreak >= 2) break; page++; continue; }
      emptyStreak = 0;

      var contentRows = [];
      var cacheRows = [];

      for (var item of pageData.items) {
        var tmdbId = Number(item.tmdb_id || item.id);
        if (!tmdbId) continue;

        contentRows.push({
          tmdb_id: tmdbId, content_type: contentType,
          title: item.title || ("TMDB " + tmdbId),
          overview: item.synopsis || item.overview || "",
          poster_path: item.poster || item.poster_path || null,
          backdrop_path: item.backdrop || item.backdrop_path || null,
          release_date: normalizeDate(item.year || item.release_date),
          vote_average: item.vote_average || 0,
          imdb_id: item.imdb_id || null,
          status: "published", featured: false, audio_type: ["dublado"],
        });

        if (apiType === "movies") {
          if (item.stream_url) {
            cacheRows.push({
              tmdb_id: tmdbId, content_type: "movie",
              audio_type: "dublado",
              video_url: item.stream_url,
              video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
              provider: "cineveo-api", season: 0, episode: 0,
              expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            });
            // Log: Título + MP4
            console.log("  🎬 " + item.title + " → " + item.stream_url.substring(item.stream_url.lastIndexOf("/") + 1));
          }
        } else {
          var episodes = Array.isArray(item.episodes) ? item.episodes : [];
          if (episodes.length > 0) {
            for (var ep of episodes) {
              if (!ep.stream_url) continue;
              cacheRows.push({
                tmdb_id: tmdbId, content_type: "series",
                audio_type: "dublado",
                video_url: ep.stream_url,
                video_type: ep.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
                provider: "cineveo-api",
                season: Number(ep.season || 1),
                episode: Number(ep.episode || 1),
                expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              });
            }
            // Log: Título + qtd episódios
            console.log("  📺 " + item.title + " — " + episodes.length + " eps → " + (episodes[0].stream_url || "").substring((episodes[0].stream_url || "").lastIndexOf("/") + 1));
          } else if (item.stream_url) {
            cacheRows.push({
              tmdb_id: tmdbId, content_type: "series",
              audio_type: "dublado",
              video_url: item.stream_url,
              video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
              provider: "cineveo-api", season: 0, episode: 0,
              expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            });
            console.log("  📺 " + item.title + " → " + item.stream_url.substring(item.stream_url.lastIndexOf("/") + 1));
          }
        }
      }

      // Upsert batches
      for (var j = 0; j < contentRows.length; j += 200) {
        var b = contentRows.slice(j, j + 200);
        var r = await sb.from("content").upsert(b, { onConflict: "tmdb_id,content_type" });
        if (!r.error) totalContent += b.length;
      }
      for (var j = 0; j < cacheRows.length; j += 200) {
        var b = cacheRows.slice(j, j + 200);
        var r = await sb.from("video_cache").upsert(b, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });
        if (!r.error) totalCache += b.length;
      }

      totalPages++;
      await saveProgress("syncing", {
        current_type: apiType, current_page: page,
        total_pages_for_type: pageData.totalPages,
        total_items_for_type: pageData.totalItems,
        content_total: totalContent, cache_total: totalCache, pages_processed: totalPages,
        imported_content_total: totalContent, imported_cache_total: totalCache,
      });

      if (totalPages % 10 === 0) {
        console.log("[cineveo-catalog] 📊 " + apiType + " p." + page + "/" + (pageData.totalPages || "?") + " — " + totalContent + " conteúdos, " + totalCache + " links");
      }

      if (pageData.totalPages && page >= pageData.totalPages) break;
      page++;
      await sleep(300);
    }
  }

  await saveProgress("done", { done: true, content_total: totalContent, cache_total: totalCache, pages_processed: totalPages, imported_content_total: totalContent, imported_cache_total: totalCache });
  console.log("");
  console.log("[cineveo-catalog] ═══════════════════════════════════════");
  console.log("[cineveo-catalog] ✅ DONE: " + totalContent + " conteúdos, " + totalCache + " links, " + totalPages + " páginas");
  console.log("[cineveo-catalog] ═══════════════════════════════════════");
}

main().catch(function(e) {
  console.error("[cineveo-catalog] Fatal:", e);
  saveProgress("error", { error: e.message || String(e), done: true });
});
SCRIPTEOF

# Primeiro heartbeat
node scripts/heartbeat.mjs

# Iniciar PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "✅ Instalação completa! VPS rodando."
echo "   API Server: http://$(hostname -I | awk '{print $1}'):${vpsPort}"
echo "   pm2 status  — ver workers"
echo "   pm2 logs    — ver logs"`;
}

// ── Commands ──

const REMOTE_COMMANDS = [
  { id: "batch-resolve", label: "Batch Resolve", desc: "Indexar conteúdos sem link", icon: Database, fn: "batch-resolve" },
  { id: "turbo-resolve", label: "Turbo Resolve", desc: "Limpar falhas + indexar tudo", icon: Zap, fn: "turbo-resolve" },
  { id: "refresh-links", label: "Refresh Links", desc: "Atualizar links expirados", icon: RefreshCw, fn: "refresh-links" },
  { id: "smart-scraper", label: "Smart Scraper", desc: "Raspagem inteligente", icon: Search, fn: "smart-scraper" },
  { id: "auto-retry", label: "Auto Retry", desc: "Re-tentar falhas antigas", icon: RotateCcw, fn: "auto-retry-failures" },
];

const ITEMS_PER_PAGE = 50;

const VpsManagerPage = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [heartbeat, setHeartbeat] = useState<VpsHeartbeat | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [fetchingKey, setFetchingKey] = useState(false);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);
  const [cmdResults, setCmdResults] = useState<Record<string, any>>({});

  // VPS API URL state
  const [vpsApiUrl, setVpsApiUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  // IPTV M3U URL state
  const [iptvM3uUrl, setIptvM3uUrl] = useState("");
  const [savingIptv, setSavingIptv] = useState(false);

  // Links tab state
  const [links, setLinks] = useState<CachedLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksPage, setLinksPage] = useState(0);
  const [linksTotal, setLinksTotal] = useState(0);
  const [linksFilter, setLinksFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [providerStats, setProviderStats] = useState<{ provider: string; cnt: number }[]>([]);




  // ── Heartbeat ──
  useEffect(() => {
    let mounted = true;

    const apply = (raw: unknown) => {
      if (!mounted) return;
      const hb = parseHeartbeatValue(raw);
      setHeartbeat(hb);
      setIsOnline(isHeartbeatOnline(hb));
    };

    const load = async () => {
      const [keyRes, hbRes, urlRes] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "vps_service_key").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "vps_heartbeat").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "vps_api_url").maybeSingle(),
      ]);
      if (!mounted) return;
      if (keyRes.data?.value) {
        const val = keyRes.data.value as any;
        setServiceRoleKey(typeof val === "string" ? val.replace(/^"|"$/g, "") : val.key || "");
      }
      if (urlRes.data?.value) {
        const val = urlRes.data.value as any;
        setVpsApiUrl(typeof val === "string" ? val.replace(/^"|"$/g, "") : val.url || "");
      }
      // Load IPTV M3U URL
      const iptvRes = await supabase.from("site_settings").select("value").eq("key", "iptv_m3u_url").maybeSingle();
      if (iptvRes.data?.value) {
        const val = iptvRes.data.value as any;
        setIptvM3uUrl(typeof val === "string" ? val.replace(/^"|"$/g, "") : val.url || "");
      }
      apply(hbRes.data?.value);
    };

    load();

    const ch = supabase
      .channel("vps-hb")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings", filter: "key=eq.vps_heartbeat" }, (p) => {
        const v = p.new && typeof p.new === "object" && "value" in p.new ? (p.new as any).value : null;
        apply(v);
      })
      .subscribe();

    const iv = setInterval(async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "vps_heartbeat").maybeSingle();
      apply(data?.value);
    }, 10000);

    return () => { mounted = false; clearInterval(iv); supabase.removeChannel(ch); };
  }, []);

  // ── Save key ──
  const saveKey = async () => {
    if (!serviceRoleKey.trim()) return;
    setSavingKey(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "vps_service_key", value: JSON.stringify(serviceRoleKey.trim()) }, { onConflict: "key" });
    setSavingKey(false);
    if (error) toast.error("Erro: " + error.message);
    else toast.success("Service Role Key salva!");
  };

  // ── Save VPS API URL ──
  const saveVpsUrl = async () => {
    if (!vpsApiUrl.trim()) return;
    setSavingUrl(true);
    const url = vpsApiUrl.trim().replace(/\/+$/, "");
    const { error } = await supabase.from("site_settings").upsert(
      { key: "vps_api_url", value: JSON.stringify(url) },
      { onConflict: "key" }
    );
    setSavingUrl(false);
    if (error) toast.error("Erro: " + error.message);
    else toast.success("✅ VPS API URL salva! O site agora roteia chamadas pesadas pela VPS.");
  };

  // ── Save IPTV M3U URL ──
  const saveIptvUrl = async () => {
    if (!iptvM3uUrl.trim()) return;
    setSavingIptv(true);
    const { error } = await supabase.from("site_settings").upsert(
      { key: "iptv_m3u_url", value: JSON.stringify(iptvM3uUrl.trim()) },
      { onConflict: "key" }
    );
    setSavingIptv(false);
    if (error) toast.error("Erro: " + error.message);
    else toast.success("✅ URL M3U salva! O worker IPTV na VPS usará este link automaticamente.");
  };

  // ── Auto-fetch key from backend ──
  const fetchKeyAuto = async () => {
    setFetchingKey(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-service-key", {});
      if (error) throw error;
      if (data?.success) {
        // Reload from site_settings
        const { data: saved } = await supabase.from("site_settings").select("value").eq("key", "vps_service_key").maybeSingle();
        if (saved?.value) {
          const val = saved.value as any;
          setServiceRoleKey(typeof val === "string" ? val.replace(/^"|"$/g, "") : val.key || "");
        }
        toast.success("✅ Service Role Key capturada e salva automaticamente!");
      } else {
        toast.error(data?.error || "Erro ao buscar chave");
      }
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Falha ao buscar"));
    } finally {
      setFetchingKey(false);
    }
  };

  // ── Run remote command ──
  const runCommand = async (fnName: string, cmdId: string) => {
    setRunningCmd(cmdId);
    setCmdResults((prev) => ({ ...prev, [cmdId]: null }));
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setCmdResults((prev) => ({ ...prev, [cmdId]: data }));
      toast.success(`${cmdId} executado!`);
    } catch (err: any) {
      setCmdResults((prev) => ({ ...prev, [cmdId]: { error: err.message } }));
      toast.error("Erro: " + err.message);
    } finally {
      setRunningCmd(null);
    }
  };

  // ── Load links ──
  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      // Count
      let countQuery = supabase.from("video_cache").select("id", { count: "exact", head: true });
      if (providerFilter !== "all") countQuery = countQuery.eq("provider", providerFilter);
      if (typeFilter !== "all") countQuery = countQuery.eq("video_type", typeFilter);
      const { count } = await countQuery;
      setLinksTotal(count || 0);

      // Fetch page
      let query = supabase
        .from("video_cache")
        .select("id, tmdb_id, content_type, audio_type, video_type, provider, season, episode, expires_at, created_at, video_url")
        .order("created_at", { ascending: false })
        .range(linksPage * ITEMS_PER_PAGE, (linksPage + 1) * ITEMS_PER_PAGE - 1);

      if (providerFilter !== "all") query = query.eq("provider", providerFilter);
      if (typeFilter !== "all") query = query.eq("video_type", typeFilter);

      const { data } = await query;
      let items = (data || []) as CachedLink[];

      // Enrich with titles
      const tmdbIds = [...new Set(items.map((i) => i.tmdb_id))];
      if (tmdbIds.length > 0) {
        const { data: contentData } = await supabase.from("content").select("tmdb_id, title, content_type").in("tmdb_id", tmdbIds);
        const titleMap = new Map<string, string>();
        contentData?.forEach((c) => titleMap.set(`${c.tmdb_id}_${c.content_type}`, c.title));
        items = items.map((i) => ({ ...i, title: titleMap.get(`${i.tmdb_id}_${i.content_type}`) || `ID:${i.tmdb_id}` }));
      }

      // Client-side text filter
      if (linksFilter.trim()) {
        const f = linksFilter.toLowerCase();
        items = items.filter((i) => (i.title || "").toLowerCase().includes(f) || String(i.tmdb_id).includes(f));
      }

      setLinks(items);

      // Provider stats (first load only)
      if (providerStats.length === 0) {
        const { data: stats } = await supabase.rpc("get_video_stats_by_provider");
        if (stats) setProviderStats(stats);
      }
    } catch (err: any) {
      toast.error("Erro ao carregar links: " + err.message);
    } finally {
      setLinksLoading(false);
    }
  }, [linksPage, providerFilter, typeFilter, linksFilter, providerStats.length]);

  // ── Delete link ──
  const deleteLink = async (id: string) => {
    await supabase.from("video_cache").delete().eq("id", id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setLinksTotal((prev) => prev - 1);
    toast.success("Link removido");
  };

  // ── Re-index single item ──
  const reindexItem = async (item: CachedLink) => {
    toast.info(`Re-indexando ${item.title || item.tmdb_id}...`);
    try {
      await supabase.from("video_cache").delete().eq("id", item.id);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ tmdb_id: item.tmdb_id, content_type: item.content_type, title: item.title, season: item.season, episode: item.episode }),
      });
      const data = await res.json();
      if (data?.url) toast.success(`✅ ${item.title} → ${data.provider}`);
      else toast.error(`❌ ${item.title}: sem link`);
      loadLinks();
    } catch {
      toast.error("Erro ao re-indexar");
    }
  };

  const copyScript = () => {
    const script = buildInstallScript(SUPABASE_URL, serviceRoleKey);
    navigator.clipboard.writeText(script);
    setCopiedId("install");
    toast.success("Script copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const workerEntries = heartbeat?.workers ? Object.entries(heartbeat.workers) : [];
  const totalPages = Math.ceil(linksTotal / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">
            <Server className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            VPS Manager
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gerenciamento completo da infraestrutura</p>
        </div>
        <Badge
          variant={isOnline ? "default" : "secondary"}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
            isOnline ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-muted-foreground border border-white/10"
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isOnline ? "CONECTADO VPS" : "DESCONECTADO"}
        </Badge>
      </div>

      {/* Live Status */}
      {isOnline && heartbeat && (
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm font-semibold text-emerald-400">VPS Online</p>
            {heartbeat.last_beat && (
              <span className="text-xs text-muted-foreground ml-auto">Último beat: {new Date(heartbeat.last_beat).toLocaleTimeString("pt-BR")}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {heartbeat.hostname && (
              <div className="flex items-center gap-2 text-xs"><HardDrive className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Host:</span><span className="font-medium">{heartbeat.hostname}</span></div>
            )}
            {heartbeat.uptime_seconds != null && (
              <div className="flex items-center gap-2 text-xs"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Uptime:</span><span className="font-medium">{formatUptime(heartbeat.uptime_seconds)}</span></div>
            )}
            {heartbeat.memory_mb != null && (
              <div className="flex items-center gap-2 text-xs"><Cpu className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">RAM:</span><span className="font-medium">{heartbeat.memory_mb} MB</span></div>
            )}
            {heartbeat.node_version && (
              <div className="flex items-center gap-2 text-xs"><Terminal className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">Node:</span><span className="font-medium">{heartbeat.node_version}</span></div>
            )}
          </div>
          {workerEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {workerEntries.map(([name, status]) => (
                <Badge key={name} variant="secondary" className={`text-[10px] px-2 py-0.5 ${
                  status === "online" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                  status === "stopped" ? "bg-white/5 text-muted-foreground border-white/10" :
                  "bg-amber-500/15 text-amber-400 border-amber-500/20"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${status === "online" ? "bg-emerald-400" : status === "stopped" ? "bg-muted-foreground" : "bg-amber-400"}`} />
                  {name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {!isOnline && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <p className="text-xs text-muted-foreground">⏳ Aguardando conexão... Instale o script na aba <strong>Scripts</strong> e salve a Service Role Key.</p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="bg-white/[0.03] border border-white/5">
          <TabsTrigger value="painel" className="text-xs">⚡ Painel</TabsTrigger>
          <TabsTrigger value="links" onClick={() => { if (links.length === 0) loadLinks(); }} className="text-xs">🔗 Links ({linksTotal || "..."})</TabsTrigger>
          <TabsTrigger value="scripts" className="text-xs">📦 Scripts</TabsTrigger>
        </TabsList>

        {/* ── TAB: Painel ── */}
        <TabsContent value="painel" className="space-y-4">
          {/* Provider Stats */}
          {providerStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {providerStats.map((s) => (
                <div key={s.provider} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-xs text-muted-foreground">{s.provider}</p>
                  <p className="text-lg font-bold text-foreground">{s.cnt}</p>
                </div>
              ))}
            </div>
          )}

          {/* Remote Commands */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Terminal className="w-4 h-4 text-primary" /> Comandos Remotos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {REMOTE_COMMANDS.map((cmd) => {
                const Icon = cmd.icon;
                const isRunning = runningCmd === cmd.id;
                const result = cmdResults[cmd.id];
                return (
                  <div key={cmd.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{cmd.label}</p>
                        <p className="text-[10px] text-muted-foreground">{cmd.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => runCommand(cmd.fn, cmd.id)}
                      disabled={isRunning}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
                    >
                      {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {isRunning ? "Executando..." : "Executar"}
                    </button>
                    {result && (
                      <pre className="text-[10px] text-muted-foreground bg-white/[0.02] rounded-lg p-2 max-h-24 overflow-auto font-mono">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: Links ── */}
        <TabsContent value="links" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={linksFilter}
                onChange={(e) => setLinksFilter(e.target.value)}
                placeholder="Buscar por título ou TMDB ID..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-primary/40"
              />
            </div>
            <select
              value={providerFilter}
              onChange={(e) => { setProviderFilter(e.target.value); setLinksPage(0); }}
              className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              <option value="all">Todos providers</option>
              {providerStats.map((s) => <option key={s.provider} value={s.provider}>{s.provider} ({s.cnt})</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setLinksPage(0); }}
              className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none"
            >
              <option value="all">Todos tipos</option>
              <option value="m3u8">m3u8</option>
              <option value="mp4">mp4</option>
              <option value="iframe-proxy">iframe-proxy</option>
            </select>
            <button onClick={loadLinks} disabled={linksLoading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40">
              {linksLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Atualizar
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span><Database className="w-3 h-3 inline mr-1" />{linksTotal} links totais</span>
            <span>Página {linksPage + 1} de {totalPages || 1}</span>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-white/5 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-[10px]">Título</TableHead>
                  <TableHead className="text-[10px]">Provider</TableHead>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-[10px]">S/E</TableHead>
                  <TableHead className="text-[10px]">Expira</TableHead>
                  <TableHead className="text-[10px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linksLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></TableCell></TableRow>
                ) : links.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Nenhum link encontrado</TableCell></TableRow>
                ) : links.map((link) => {
                  const isExpired = new Date(link.expires_at) < new Date();
                  return (
                    <TableRow key={link.id} className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-xs max-w-[200px] truncate">
                        <span className="font-medium">{link.title || `ID:${link.tmdb_id}`}</span>
                        <span className="text-muted-foreground ml-1 text-[10px]">({link.content_type})</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{link.provider}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${
                          link.video_type === "iframe-proxy" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
                        }`}>{link.video_type}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {link.season && link.episode ? `S${link.season}E${link.episode}` : "—"}
                      </TableCell>
                      <TableCell className={`text-[10px] ${isExpired ? "text-red-400" : "text-muted-foreground"}`}>
                        {new Date(link.expires_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => reindexItem(link)} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-primary" title="Re-indexar">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(link.video_url); toast.success("URL copiada"); }} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground" title="Copiar URL">
                            <Copy className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteLink(link.id)} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-red-400" title="Excluir">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => { setLinksPage((p) => Math.max(0, p - 1)); loadLinks(); }} disabled={linksPage === 0} className="p-2 rounded-lg bg-white/[0.03] border border-white/5 disabled:opacity-30 hover:bg-white/[0.06]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground">{linksPage + 1} / {totalPages}</span>
              <button onClick={() => { setLinksPage((p) => Math.min(totalPages - 1, p + 1)); loadLinks(); }} disabled={linksPage >= totalPages - 1} className="p-2 rounded-lg bg-white/[0.03] border border-white/5 disabled:opacity-30 hover:bg-white/[0.06]">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Scripts ── */}
        <TabsContent value="scripts" className="space-y-4">
          {/* Service Role Key */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <p className="text-xs font-semibold flex items-center gap-2">
              🔑 Service Role Key
              <span className="text-muted-foreground font-normal">(necessária para autenticação)</span>
            </p>

            {/* Auto-fetch button */}
            {!serviceRoleKey && (
              <button
                onClick={fetchKeyAuto}
                disabled={fetchingKey}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 disabled:opacity-40"
              >
                {fetchingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {fetchingKey ? "Capturando automaticamente..." : "⚡ Capturar Service Role Key Automaticamente"}
              </button>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={serviceRoleKey}
                  onChange={(e) => setServiceRoleKey(e.target.value)}
                  placeholder="Cole manualmente ou use o botão acima..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono pr-8 focus:outline-none focus:border-primary/40"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button onClick={saveKey} disabled={savingKey || !serviceRoleKey.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40">
                <Save className="w-3 h-3" />{savingKey ? "Salvando..." : "Salvar"}
              </button>
              {serviceRoleKey && (
                <button onClick={fetchKeyAuto} disabled={fetchingKey} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-40" title="Re-capturar">
                  {fetchingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>

          {/* IPTV M3U URL */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <p className="text-xs font-semibold flex items-center gap-2">
              📺 URL da Lista IPTV (M3U)
              <span className="text-muted-foreground font-normal">(o worker 24/7 sincroniza automaticamente)</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              Cole a URL da lista M3U. O worker na VPS roda a cada 6h: baixa a lista, indexa os links no banco como <code className="text-primary/70">cineveo-iptv</code> e limpa cache expirado.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={iptvM3uUrl}
                onChange={(e) => setIptvM3uUrl(e.target.value)}
                placeholder="https://exemplo.com/lista.m3u"
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/40"
              />
              <button onClick={saveIptvUrl} disabled={savingIptv || !iptvM3uUrl.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40">
                <Save className="w-3 h-3" />{savingIptv ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {iptvM3uUrl && (
              <p className="text-[10px] text-emerald-400">
                ✅ O worker <strong>iptv-indexer</strong> na VPS usará esta URL automaticamente a cada ciclo (6h).
              </p>
            )}
          </div>

          {/* VPS API URL */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <p className="text-xs font-semibold flex items-center gap-2">
              🌐 VPS API URL
              <span className="text-muted-foreground font-normal">(o site usará a VPS para chamadas pesadas)</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              Após instalar o script, cole a URL do API Server. Ex: <code className="text-primary/70">http://SEU_IP:3377</code>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={vpsApiUrl}
                onChange={(e) => setVpsApiUrl(e.target.value)}
                placeholder="http://123.456.789.0:3377"
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/40"
              />
              <button onClick={saveVpsUrl} disabled={savingUrl || !vpsApiUrl.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40">
                <Save className="w-3 h-3" />{savingUrl ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {vpsApiUrl && (
              <p className="text-[10px] text-emerald-400">
                ✅ O frontend detectará automaticamente se a VPS está online e roteará extract-video e catálogo por lá.
              </p>
            )}
          </div>
          {/* Quick Start */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
            <p className="text-xs text-primary/80">
              🚀 <strong>Quick Start:</strong> 1) Cole a Service Role Key e salve. 2) Copie o script abaixo. 3) Cole no terminal da VPS.
            </p>
          </div>

          {/* Install Script */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-white/5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center"><Download className="w-4 h-4 text-primary" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Instalação Completa</p>
                <p className="text-xs text-muted-foreground">Node.js 20 + PM2 + todos os scripts + heartbeat automático</p>
              </div>
              <button onClick={copyScript} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20">
                {copiedId === "install" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId === "install" ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="p-4 text-xs text-foreground/80 overflow-x-auto max-h-[400px] overflow-y-auto font-mono leading-relaxed bg-transparent scrollbar-transparent">
              {buildInstallScript(SUPABASE_URL, serviceRoleKey)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VpsManagerPage;
