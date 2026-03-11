import { useState } from "react";
import { Play, Code2, Copy, Check, ExternalLink, Zap, Shield, Globe, Layers } from "lucide-react";

const LynePlayPage = () => {
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);
  const [activeTab, setActiveTab] = useState<"iframe" | "api">("iframe");

  const BASE = "https://lyneflix.online";

  const iframeCode = `<iframe
  src="${BASE}/embed?tmdb=1265609&type=movie"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
  style="aspect-ratio: 16/9; border-radius: 12px;"
></iframe>`;

  const apiCode = `// Resolver vídeo via API
const res = await fetch("${BASE}/embed/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tmdb_id: 1265609,
    content_type: "movie"
  })
});

const { url, type } = await res.json();
// url: "https://...stream.m3u8"
// type: "m3u8" | "mp4"`;

  const seriesCode = `<!-- Série: Temporada 1, Episódio 3 -->
<iframe
  src="${BASE}/embed?tmdb=127532&type=tv&s=1&e=3"
  width="100%" height="100%"
  frameborder="0" allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
  style="aspect-ratio: 16/9;"
></iframe>`;

  const copyToClipboard = (text: string, type: "embed" | "api") => {
    navigator.clipboard.writeText(text);
    if (type === "embed") { setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); }
    else { setCopiedApi(true); setTimeout(() => setCopiedApi(false), 2000); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Play className="w-4 h-4 text-primary-foreground fill-current" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">LynePlay</h1>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">Player as a Service</p>
            </div>
          </div>
          <a href="/" className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
            lyneflix.online <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6">
              <Zap className="w-3 h-3" /> Player de Alta Performance
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1] mb-4">
              Integre streaming
              <br />
              <span className="text-primary">no seu site.</span>
            </h2>
            <p className="text-base text-white/50 leading-relaxed max-w-lg">
              Player otimizado com HLS adaptativo, carregamento instantâneo e qualidade automática.
              Incorpore via iframe ou consuma a API diretamente.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Zap, label: "Start < 2s", desc: "Carregamento instantâneo" },
            { icon: Layers, label: "ABR Adaptativo", desc: "Qualidade automática" },
            { icon: Shield, label: "Resiliente", desc: "Auto-recovery em falhas" },
            { icon: Globe, label: "Multi-plataforma", desc: "Desktop, mobile, smart TV" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
              <Icon className="w-5 h-5 text-primary/70 mb-2" />
              <p className="text-sm font-semibold text-white/90">{label}</p>
              <p className="text-[11px] text-white/30 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Preview ao vivo</h3>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/5 bg-black shadow-2xl shadow-black/50">
          <iframe
            src="/embed?tmdb=1265609&type=movie"
            className="w-full aspect-video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-[11px] text-white/20 mt-2 text-center">Máquina de Guerra (2026) — Demonstração</p>
      </section>

      {/* Integration Section */}
      <section className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-center gap-2 mb-2">
            <Code2 className="w-5 h-5 text-primary/70" />
            <h3 className="text-xl font-bold">Integração</h3>
          </div>
          <p className="text-sm text-white/40 mb-8 max-w-lg">
            Duas formas de integrar o player no seu site. Escolha a que melhor se adapta ao seu projeto.
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
            <button
              onClick={() => setActiveTab("iframe")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "iframe" ? "bg-primary text-primary-foreground" : "text-white/40 hover:text-white/70"
              }`}
            >
              Embed (iframe)
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "api" ? "bg-primary text-primary-foreground" : "text-white/40 hover:text-white/70"
              }`}
            >
              API (JSON)
            </button>
          </div>

          {activeTab === "iframe" && (
            <div className="space-y-6">
              {/* Movie embed */}
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <span className="text-xs text-white/40 font-mono">Filme — Embed básico</span>
                  <button onClick={() => copyToClipboard(iframeCode, "embed")}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                    {copiedEmbed ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedEmbed ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <pre className="p-4 text-xs text-white/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{iframeCode}</code>
                </pre>
              </div>

              {/* Series embed */}
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <span className="text-xs text-white/40 font-mono">Série — Com temporada e episódio</span>
                  <button onClick={() => copyToClipboard(seriesCode, "embed")}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                </div>
                <pre className="p-4 text-xs text-white/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{seriesCode}</code>
                </pre>
              </div>

              {/* Params table */}
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <span className="text-xs text-white/40 font-mono">Parâmetros aceitos</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { param: "tmdb", type: "number", req: true, desc: "ID do TMDB do conteúdo" },
                    { param: "type", type: "string", req: true, desc: '"movie" ou "tv"' },
                    { param: "s", type: "number", req: false, desc: "Temporada (séries)" },
                    { param: "e", type: "number", req: false, desc: "Episódio (séries)" },
                  ].map(({ param, type, req, desc }) => (
                    <div key={param} className="flex items-center gap-4 px-4 py-3">
                      <code className="text-xs text-primary font-mono min-w-[60px]">{param}</code>
                      <span className="text-[10px] text-white/20 font-mono min-w-[50px]">{type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${req ? "bg-red-500/10 text-red-400" : "bg-white/5 text-white/30"}`}>
                        {req ? "obrigatório" : "opcional"}
                      </span>
                      <span className="text-xs text-white/40 flex-1">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-mono font-bold">POST</span>
                    <span className="text-xs text-white/40 font-mono">{BASE}/embed/api</span>
                  </div>
                  <button onClick={() => copyToClipboard(apiCode, "api")}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                    {copiedApi ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedApi ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <pre className="p-4 text-xs text-white/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{apiCode}</code>
                </pre>
              </div>

              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <span className="text-xs text-white/40 font-mono">Resposta (JSON)</span>
                </div>
                <pre className="p-4 text-xs text-white/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{`{
  "success": true,
  "url": "https://cdn.../stream.m3u8",
  "type": "m3u8",
  "provider": "auto"
}`}</code>
                </pre>
              </div>

              {/* Request body params */}
              <div className="rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5">
                  <span className="text-xs text-white/40 font-mono">Body (JSON)</span>
                </div>
                <div className="divide-y divide-white/5">
                  {[
                    { param: "tmdb_id", type: "number", req: true, desc: "ID do TMDB" },
                    { param: "content_type", type: "string", req: true, desc: '"movie" ou "tv"' },
                    { param: "season", type: "number", req: false, desc: "Temporada" },
                    { param: "episode", type: "number", req: false, desc: "Episódio" },
                  ].map(({ param, type, req, desc }) => (
                    <div key={param} className="flex items-center gap-4 px-4 py-3">
                      <code className="text-xs text-primary font-mono min-w-[100px]">{param}</code>
                      <span className="text-[10px] text-white/20 font-mono min-w-[50px]">{type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${req ? "bg-red-500/10 text-red-400" : "bg-white/5 text-white/30"}`}>
                        {req ? "obrigatório" : "opcional"}
                      </span>
                      <span className="text-xs text-white/40 flex-1">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
              <Play className="w-2.5 h-2.5 text-primary fill-current" />
            </div>
            <span className="text-xs text-white/20">LynePlay · Powered by LyneFlix</span>
          </div>
          <span className="text-[10px] text-white/10">v2.0</span>
        </div>
      </footer>
    </div>
  );
};

export default LynePlayPage;