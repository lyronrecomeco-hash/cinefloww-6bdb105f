import { useState, useEffect, useCallback } from "react";
import { Server, Copy, Check, Terminal, RefreshCw, Play, FileCode, Download, Zap, Wifi, WifiOff, Activity, Clock, Cpu, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface VpsHeartbeat {
  status: "online" | "offline";
  uptime_seconds?: number;
  workers?: Record<string, string>;
  last_beat?: string;
  hostname?: string;
  memory_mb?: number;
  node_version?: string;
}

const SCRIPTS = [
  {
    id: "install",
    label: "Instalação Completa",
    description: "Instala Node.js 20, PM2, cria todos os scripts e inicia automaticamente. Basta colar e executar.",
    icon: Download,
    code: `#!/bin/bash
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
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "pm2 start ecosystem.config.cjs",
    "stop": "pm2 stop all",
    "logs": "pm2 logs",
    "status": "pm2 status",
    "update": "node scripts/update.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.95.3",
    "node-fetch": "^3.3.2",
    "dotenv": "^16.4.7"
  }
}
PKGJSON

npm install

# Criar .env (credenciais já preenchidas)
cat > .env << ENVFILE
SUPABASE_URL=\${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=\${SERVICE_ROLE_KEY}
BATCH_SIZE=1000
CONCURRENCY=40
ENVFILE

# ecosystem.config.cjs
cat > ecosystem.config.cjs << 'ECOFILE'
module.exports = {
  apps: [
    {
      name: "heartbeat",
      script: "scripts/heartbeat.mjs",
      cron_restart: "*/2 * * * *",
      autorestart: false,
      env: { NODE_ENV: "production" },
    },
    {
      name: "batch-resolve",
      script: "scripts/batch-resolve.mjs",
      cron_restart: "0 */3 * * *",
      autorestart: false,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "turbo-resolve",
      script: "scripts/turbo-resolve.mjs",
      cron_restart: "30 */2 * * *",
      autorestart: false,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "refresh-links",
      script: "scripts/refresh-links.mjs",
      cron_restart: "0 4 * * *",
      autorestart: false,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "cleanup",
      script: "scripts/cleanup.mjs",
      cron_restart: "0 5 * * *",
      autorestart: false,
      env: { NODE_ENV: "production" },
    },
  ],
};
ECOFILE

# Criar diretório de scripts
mkdir -p scripts

# heartbeat.mjs
cat > scripts/heartbeat.mjs << 'HBFILE'
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { config } from "dotenv";
import os from "os";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sendHeartbeat() {
  let workers = {};
  try {
    const pm2List = execSync("pm2 jlist", { encoding: "utf-8" });
    const apps = JSON.parse(pm2List);
    for (const app of apps) {
      workers[app.name] = app.pm2_env?.status || "unknown";
    }
  } catch { workers = { error: "pm2 not available" }; }

  const uptimeSeconds = os.uptime();
  const memoryMb = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);

  const heartbeat = {
    status: "online",
    uptime_seconds: uptimeSeconds,
    workers,
    last_beat: new Date().toISOString(),
    hostname: os.hostname(),
    memory_mb: memoryMb,
    node_version: process.version,
  };

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: "vps_heartbeat", value: heartbeat }, { onConflict: "key" });

  if (error) console.error("[heartbeat] Erro:", error.message);
  else console.log("[heartbeat] ✅ Status enviado:", new Date().toISOString());
}

sendHeartbeat().catch(console.error);
HBFILE

# batch-resolve.mjs
cat > scripts/batch-resolve.mjs << 'BRFILE'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BATCH = parseInt(process.env.BATCH_SIZE || "1000");
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "40");

async function getUnresolved() {
  const { data, error } = await supabase.rpc("get_unresolved_content", { batch_limit: BATCH });
  if (error) throw error;
  return data || [];
}

async function resolveItem(item) {
  try {
    const res = await fetch(\\\`\\\${process.env.SUPABASE_URL}/functions/v1/extract-video\\\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \\\`Bearer \\\${process.env.SUPABASE_SERVICE_ROLE_KEY}\\\`,
      },
      body: JSON.stringify({
        tmdbId: item.tmdb_id,
        imdbId: item.imdb_id,
        type: item.content_type,
        title: item.title,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    return { success: data?.type !== "iframe-proxy" && !!data?.url, item };
  } catch {
    return { success: false, item };
  }
}

async function processInParallel(items) {
  let idx = 0, success = 0, fail = 0;
  const total = items.length;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      const result = await resolveItem(items[i]);
      if (result.success) success++;
      else fail++;
      if ((success + fail) % 50 === 0) {
        console.log(\\\`[batch] \\\${success + fail}/\\\${total} (✅\\\${success} ❌\\\${fail})\\\`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { success, fail, total };
}

async function main() {
  console.log("[batch-resolve] Iniciando...");
  const items = await getUnresolved();
  if (!items.length) { console.log("[batch-resolve] Nada para resolver."); return; }
  console.log(\\\`[batch-resolve] \\\${items.length} itens para processar\\\`);
  const stats = await processInParallel(items);
  console.log(\\\`[batch-resolve] Concluído: \\\${JSON.stringify(stats)}\\\`);
}

main().catch(console.error);
BRFILE

# turbo-resolve.mjs (chama batch-resolve em loop)
cat > scripts/turbo-resolve.mjs << 'TRFILE'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function turbo() {
  console.log("[turbo-resolve] Limpando falhas antigas...");
  await supabase.from("resolve_failures").delete().gte("tmdb_id", 0);
  await supabase.from("video_cache").delete().lt("expires_at", new Date().toISOString());
  console.log("[turbo-resolve] Disparando batch-resolve...");
  
  const res = await fetch(\\\`\\\${process.env.SUPABASE_URL}/functions/v1/batch-resolve\\\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \\\`Bearer \\\${process.env.SUPABASE_SERVICE_ROLE_KEY}\\\`,
    },
    body: JSON.stringify({ _wave: 1 }),
    signal: AbortSignal.timeout(300000),
  });
  const data = await res.json();
  console.log("[turbo-resolve] Resultado:", JSON.stringify(data));
}

turbo().catch(console.error);
TRFILE

# refresh-links.mjs
cat > scripts/refresh-links.mjs << 'RLFILE'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function refresh() {
  console.log("[refresh-links] Iniciando refresh...");
  const res = await fetch(\\\`\\\${process.env.SUPABASE_URL}/functions/v1/refresh-links\\\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \\\`Bearer \\\${process.env.SUPABASE_SERVICE_ROLE_KEY}\\\`,
    },
    body: JSON.stringify({ mode: "expiring", session_id: "vps-" + Date.now() }),
    signal: AbortSignal.timeout(300000),
  });
  const data = await res.json();
  console.log("[refresh-links] Resultado:", JSON.stringify(data));
}

refresh().catch(console.error);
RLFILE

# cleanup.mjs
cat > scripts/cleanup.mjs << 'CLFILE'
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
  console.log("[cleanup] Iniciando limpeza...");

  await supabase.from("resolve_logs").delete().lt("created_at", new Date(Date.now() - 7*86400000).toISOString());
  await supabase.from("resolve_failures").delete().lt("attempted_at", new Date(Date.now() - 3*86400000).toISOString());
  await supabase.from("site_visitors").delete().lt("visited_at", new Date(Date.now() - 14*86400000).toISOString());
  await supabase.from("video_cache").delete().lt("expires_at", new Date().toISOString());

  console.log("[cleanup] ✅ Limpeza concluída!");
}

cleanup().catch(console.error);
CLFILE

# update.mjs
cat > scripts/update.mjs << 'UPFILE'
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function update() {
  console.log("[update] Buscando scripts atualizados...");
  const { data } = await supabase.from("site_settings").select("value").eq("key", "vps_scripts").maybeSingle();
  if (!data?.value) { console.log("[update] Nenhum script remoto."); return; }
  mkdirSync("scripts", { recursive: true });
  for (const [filename, content] of Object.entries(data.value)) {
    writeFileSync("scripts/" + filename, content);
    console.log("[update] ✅ " + filename);
  }
  const { execSync } = await import("child_process");
  execSync("pm2 restart all", { stdio: "inherit" });
}

update().catch(console.error);
UPFILE

# Rodar primeiro heartbeat
node scripts/heartbeat.mjs

# Iniciar PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

echo ""
echo "✅ Instalação completa! VPS rodando."
echo "📌 Comandos úteis:"
echo "   pm2 status    — ver workers"
echo "   pm2 logs      — ver logs"
echo "   npm run update — atualizar scripts remotamente"`,
  },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const VpsManagerPage = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>("install");
  const [serviceRoleKey, setServiceRoleKey] = useState<string>("");
  const [heartbeat, setHeartbeat] = useState<VpsHeartbeat | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  // Load service role key + heartbeat
  useEffect(() => {
    const loadData = async () => {
      const [keyRes, hbRes] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "vps_service_key").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "vps_heartbeat").maybeSingle(),
      ]);
      if (keyRes.data?.value) {
        const val = keyRes.data.value as any;
        setServiceRoleKey(typeof val === "string" ? val.replace(/^"|"$/g, '') : val.key || "");
      }
      if (hbRes.data?.value) {
        const hb = hbRes.data.value as unknown as VpsHeartbeat;
        setHeartbeat(hb);
        // Consider online if last beat < 5 min ago
        if (hb.last_beat) {
          const diff = Date.now() - new Date(hb.last_beat).getTime();
          setIsOnline(diff < 5 * 60 * 1000);
        }
      }
    };
    loadData();

    // Poll heartbeat every 30s
    const interval = setInterval(async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "vps_heartbeat").maybeSingle();
      if (data?.value) {
        const hb = data.value as unknown as VpsHeartbeat;
        setHeartbeat(hb);
        if (hb.last_beat) {
          const diff = Date.now() - new Date(hb.last_beat).getTime();
          setIsOnline(diff < 5 * 60 * 1000);
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    let finalText = text
      .replace(/\$\{SUPABASE_URL\}/g, SUPABASE_URL)
      .replace(/\$\{SERVICE_ROLE_KEY\}/g, serviceRoleKey || "COLE_SUA_SERVICE_ROLE_KEY_AQUI");
    navigator.clipboard.writeText(finalText);
    setCopiedId(id);
    toast.success("Copiado para área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getDisplayCode = (code: string) => {
    return code
      .replace(/\$\{SUPABASE_URL\}/g, SUPABASE_URL)
      .replace(/\$\{SERVICE_ROLE_KEY\}/g, serviceRoleKey || "COLE_SUA_SERVICE_ROLE_KEY_AQUI");
  };

  const workerEntries = heartbeat?.workers ? Object.entries(heartbeat.workers) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">
            <Server className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            VPS Manager
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Scripts e configuração para a VPS de processamento pesado
          </p>
        </div>
        <Badge
          variant={isOnline ? "default" : "secondary"}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
            isOnline
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-white/5 text-muted-foreground border border-white/10"
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isOnline ? "CONECTADO VPS" : "DESCONECTADO"}
        </Badge>
      </div>

      {/* Real-time Status Panel */}
      {isOnline && heartbeat && (
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm font-semibold text-emerald-400">VPS Online — Sincronizado</p>
            {heartbeat.last_beat && (
              <span className="text-xs text-muted-foreground ml-auto">
                Último beat: {new Date(heartbeat.last_beat).toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {heartbeat.hostname && (
              <div className="flex items-center gap-2 text-xs">
                <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Host:</span>
                <span className="font-medium">{heartbeat.hostname}</span>
              </div>
            )}
            {heartbeat.uptime_seconds != null && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Uptime:</span>
                <span className="font-medium">{formatUptime(heartbeat.uptime_seconds)}</span>
              </div>
            )}
            {heartbeat.memory_mb != null && (
              <div className="flex items-center gap-2 text-xs">
                <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">RAM:</span>
                <span className="font-medium">{heartbeat.memory_mb} MB</span>
              </div>
            )}
            {heartbeat.node_version && (
              <div className="flex items-center gap-2 text-xs">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Node:</span>
                <span className="font-medium">{heartbeat.node_version}</span>
              </div>
            )}
          </div>

          {workerEntries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {workerEntries.map(([name, status]) => (
                <Badge
                  key={name}
                  variant="secondary"
                  className={`text-[10px] px-2 py-0.5 ${
                    status === "online"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                      : status === "stopped"
                      ? "bg-white/5 text-muted-foreground border-white/10"
                      : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 inline-block ${
                    status === "online" ? "bg-emerald-400" : status === "stopped" ? "bg-muted-foreground" : "bg-amber-400"
                  }`} />
                  {name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Offline hint */}
      {!isOnline && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <p className="text-xs text-muted-foreground">
            ⏳ Aguardando conexão... Instale o script de <strong>Instalação Completa</strong> na VPS. 
            O heartbeat sincronizará automaticamente em até 2 minutos.
          </p>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Node.js + PM2</p>
              <p className="text-xs text-muted-foreground">Stack recomendada</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">40 Workers</p>
              <p className="text-xs text-muted-foreground">Concorrência máxima</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Heartbeat</p>
              <p className="text-xs text-muted-foreground">Sync automático</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
        <p className="text-xs text-primary/80">
          🚀 <strong>Quick Start:</strong> Copie o script de <strong>Instalação Completa</strong> (credenciais já preenchidas), 
          cole no terminal da VPS e execute. Rode <code className="bg-primary/10 px-1 rounded">npm start</code> e o painel detecta automaticamente.
        </p>
      </div>

      {/* Scripts */}
      <div className="space-y-3">
        {SCRIPTS.map((script) => {
          const isExpanded = expandedId === script.id;
          const Icon = script.icon;
          return (
            <div
              key={script.id}
              className="rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : script.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{script.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{script.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(script.code, script.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    {copiedId === script.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedId === script.id ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-white/5">
                  <pre className="p-4 text-xs text-foreground/80 overflow-x-auto max-h-[400px] overflow-y-auto font-mono leading-relaxed bg-transparent scrollbar-transparent">
                    {getDisplayCode(script.code)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          Como Funciona
        </h2>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>1. <strong className="text-foreground">Instale</strong> — Execute o script de instalação na VPS</p>
          <p>2. <strong className="text-foreground">Inicie</strong> — <code className="bg-white/5 px-1 rounded">npm start</code> ativa todos os workers + heartbeat</p>
          <p>3. <strong className="text-foreground">Sincronize</strong> — O painel detecta a VPS automaticamente via heartbeat</p>
          <p>4. <strong className="text-foreground">Monitore</strong> — Status, workers e métricas em tempo real aqui no painel</p>
          <p>5. <strong className="text-foreground">Atualize</strong> — <code className="bg-white/5 px-1 rounded">npm run update</code> baixa scripts atualizados remotamente</p>
        </div>
      </div>
    </div>
  );
};

export default VpsManagerPage;
