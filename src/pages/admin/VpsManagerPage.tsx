import { useState } from "react";
import { Server, Copy, Check, Terminal, RefreshCw, Play, FileCode, Download, Zap } from "lucide-react";
import { toast } from "sonner";

const SCRIPTS = [
  {
    id: "install",
    label: "Instalação Completa",
    description: "Instala Node.js 20, PM2, dependências e configura o ambiente da VPS do zero.",
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
    "node-fetch": "^3.3.2"
  }
}
PKGJSON

npm install

# Criar .env
cat > .env << 'ENVFILE'
SUPABASE_URL=SUA_URL_AQUI
SUPABASE_SERVICE_ROLE_KEY=SUA_KEY_AQUI
BATCH_SIZE=1000
CONCURRENCY=40
ENVFILE

echo "✅ Instalação concluída! Edite ~/lyneflix-vps/.env com suas credenciais."
echo "📌 Depois execute: cd ~/lyneflix-vps && npm start"`,
  },
  {
    id: "ecosystem",
    label: "PM2 Ecosystem",
    description: "Arquivo de configuração do PM2 com workers de batch-resolve, turbo-resolve e refresh-links.",
    icon: FileCode,
    code: `// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "batch-resolve",
      script: "scripts/batch-resolve.mjs",
      cron_restart: "0 */3 * * *",    // A cada 3 horas
      autorestart: false,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "turbo-resolve",
      script: "scripts/turbo-resolve.mjs",
      cron_restart: "30 */2 * * *",   // A cada 2h30
      autorestart: false,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "refresh-links",
      script: "scripts/refresh-links.mjs",
      cron_restart: "0 4 * * *",      // 4h da manhã
      autorestart: false,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "cleanup",
      script: "scripts/cleanup.mjs",
      cron_restart: "0 5 * * *",      // 5h da manhã
      autorestart: false,
      env: { NODE_ENV: "production" },
    },
  ],
};`,
  },
  {
    id: "batch-resolve",
    label: "Batch Resolve Worker",
    description: "Resolve links de vídeo em massa com alta concorrência (40 workers). Processa lotes de 1000 itens.",
    icon: Zap,
    code: `// scripts/batch-resolve.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
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
    const res = await fetch(\`\${process.env.SUPABASE_URL}/functions/v1/extract-video\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${process.env.SUPABASE_SERVICE_ROLE_KEY}\`,
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
        console.log(\`[batch] \${success + fail}/\${total} (✅\${success} ❌\${fail})\`);
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
  console.log(\`[batch-resolve] \${items.length} itens para processar\`);
  const stats = await processInParallel(items);
  console.log(\`[batch-resolve] Concluído: \${JSON.stringify(stats)}\`);
}

main().catch(console.error);`,
  },
  {
    id: "cleanup",
    label: "Limpeza Automática",
    description: "Remove logs antigos, cache expirado e otimiza tabelas automaticamente.",
    icon: RefreshCw,
    code: `// scripts/cleanup.mjs
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
  console.log("[cleanup] Iniciando limpeza...");

  // Limpar resolve_logs > 7 dias
  const { count: c1 } = await supabase
    .from("resolve_logs").delete().lt("created_at", new Date(Date.now() - 7*86400000).toISOString())
    .select("*", { count: "exact", head: true });
  console.log(\`[cleanup] resolve_logs removidos: \${c1 || 0}\`);

  // Limpar resolve_failures > 3 dias
  const { count: c2 } = await supabase
    .from("resolve_failures").delete().lt("attempted_at", new Date(Date.now() - 3*86400000).toISOString())
    .select("*", { count: "exact", head: true });
  console.log(\`[cleanup] resolve_failures removidos: \${c2 || 0}\`);

  // Limpar site_visitors > 14 dias
  const { count: c3 } = await supabase
    .from("site_visitors").delete().lt("visited_at", new Date(Date.now() - 14*86400000).toISOString())
    .select("*", { count: "exact", head: true });
  console.log(\`[cleanup] site_visitors removidos: \${c3 || 0}\`);

  // Limpar video_cache expirado
  const { count: c4 } = await supabase
    .from("video_cache").delete().lt("expires_at", new Date().toISOString())
    .select("*", { count: "exact", head: true });
  console.log(\`[cleanup] video_cache expirados removidos: \${c4 || 0}\`);

  // Limpar ad_clicks > 30 dias
  const { count: c5 } = await supabase
    .from("ad_clicks").delete().lt("clicked_at", new Date(Date.now() - 30*86400000).toISOString())
    .select("*", { count: "exact", head: true });
  console.log(\`[cleanup] ad_clicks removidos: \${c5 || 0}\`);

  console.log("[cleanup] ✅ Limpeza concluída!");
}

cleanup().catch(console.error);`,
  },
  {
    id: "update",
    label: "Auto-Update",
    description: "Script para atualizar os scripts da VPS automaticamente sem troca manual de arquivos.",
    icon: RefreshCw,
    code: `// scripts/update.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { config } from "dotenv";
config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function update() {
  console.log("[update] Buscando scripts atualizados...");

  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "vps_scripts")
    .maybeSingle();

  if (!data?.value) {
    console.log("[update] Nenhum script remoto encontrado. Use o painel admin para publicar.");
    return;
  }

  const scripts = data.value;
  mkdirSync("scripts", { recursive: true });

  for (const [filename, content] of Object.entries(scripts)) {
    writeFileSync(\`scripts/\${filename}\`, content);
    console.log(\`[update] ✅ Atualizado: scripts/\${filename}\`);
  }

  console.log("[update] Reiniciando PM2...");
  const { execSync } = await import("child_process");
  execSync("pm2 restart all", { stdio: "inherit" });
  console.log("[update] ✅ Concluído!");
}

update().catch(console.error);`,
  },
];

const VpsManagerPage = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>("install");

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copiado para área de transferência!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">
          <Server className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          VPS Manager
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Scripts e configuração para a VPS de processamento pesado
        </p>
      </div>

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
              <RefreshCw className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Auto-Update</p>
              <p className="text-xs text-muted-foreground">npm run update</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Start */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
        <p className="text-xs text-primary/80">
          🚀 <strong>Quick Start:</strong> Copie o script de <strong>Instalação Completa</strong>, 
          cole no terminal da VPS e execute. Depois edite o <code className="bg-primary/10 px-1 rounded">.env</code> com 
          suas credenciais e rode <code className="bg-primary/10 px-1 rounded">npm start</code>.
          Para atualizar scripts remotamente, use <code className="bg-primary/10 px-1 rounded">npm run update</code>.
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
                  <pre className="p-4 text-xs text-foreground/80 overflow-x-auto max-h-[400px] overflow-y-auto font-mono leading-relaxed bg-black/20">
                    {script.code}
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
          <p>2. <strong className="text-foreground">Configure</strong> — Edite o <code className="bg-white/5 px-1 rounded">.env</code> com SUPABASE_URL e SERVICE_ROLE_KEY</p>
          <p>3. <strong className="text-foreground">Inicie</strong> — <code className="bg-white/5 px-1 rounded">npm start</code> ativa todos os workers via PM2</p>
          <p>4. <strong className="text-foreground">Monitore</strong> — <code className="bg-white/5 px-1 rounded">pm2 status</code> e <code className="bg-white/5 px-1 rounded">pm2 logs</code></p>
          <p>5. <strong className="text-foreground">Atualize</strong> — <code className="bg-white/5 px-1 rounded">npm run update</code> baixa scripts atualizados do painel</p>
        </div>
      </div>
    </div>
  );
};

export default VpsManagerPage;
