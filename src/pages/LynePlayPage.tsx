import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Play, Copy, Check, Code2, Zap, Shield, Globe, Tv, MonitorPlay } from "lucide-react";

const DEMO_TMDB = "550";
const DEMO_TYPE = "movie";
const DEMO_TITLE = "Fight Club";
const BASE_DOMAIN = "https://lyneflix.online";

const LynePlayPage = () => {
  const [params] = useSearchParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tmdbInput, setTmdbInput] = useState("550");
  const [typeInput, setTypeInput] = useState<"movie" | "tv">("movie");
  const [titleInput, setTitleInput] = useState("Fight Club");
  const [seasonInput, setSeasonInput] = useState("1");
  const [episodeInput, setEpisodeInput] = useState("1");

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
      title="Copiar"
    >
      {copiedId === id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  // Build embed URL
  const buildEmbedUrl = () => {
    let url = `${BASE_DOMAIN}/embed?tmdb=${tmdbInput}&type=${typeInput}&title=${encodeURIComponent(titleInput)}`;
    if (typeInput === "tv") {
      url += `&s=${seasonInput}&e=${episodeInput}`;
    }
    return url;
  };

  const iframeCode = `<iframe
  src="${buildEmbedUrl()}"
  width="100%"
  height="100%"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  style="aspect-ratio: 16/9; border-radius: 12px;"
></iframe>`;

  const jsCode = `<!-- LynePlay Embed -->
<div id="lyneplay-container" style="aspect-ratio:16/9;max-width:1280px;width:100%;margin:0 auto;"></div>
<script>
(function() {
  var c = document.getElementById('lyneplay-container');
  var iframe = document.createElement('iframe');
  iframe.src = '${buildEmbedUrl()}';
  iframe.width = '100%';
  iframe.height = '100%';
  iframe.frameBorder = '0';
  iframe.allowFullscreen = true;
  iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  iframe.style.borderRadius = '12px';
  c.appendChild(iframe);
})();
</script>`;

  const apiExample = `// LynePlay API — Fetch video URL
const response = await fetch('${BASE_DOMAIN}/embed/api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tmdb_id: ${tmdbInput},
    content_type: '${typeInput}',${typeInput === "tv" ? `\n    season: ${seasonInput},\n    episode: ${episodeInput},` : ""}
  })
});

const data = await response.json();
// data = { url: "https://...", type: "m3u8"|"mp4", provider: "lyneplay" }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 pb-16 px-4 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Play className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">LynePlay</h1>
              <p className="text-sm text-muted-foreground">Player embeddable de alta performance</p>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-10">
            Integre o player da Lyneflix no seu site com <strong className="text-foreground">uma linha de código</strong>. 
            Engine HLS adaptativa, ABR inteligente, buffer dinâmico e início em &lt;2s. 
            Supera JW Player em velocidade e resiliência.
          </p>

          {/* Features grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-14">
            {[
              { icon: Zap, label: "Start <2s", desc: "Primeiro frame instantâneo" },
              { icon: MonitorPlay, label: "HLS + MP4", desc: "Compatibilidade total" },
              { icon: Shield, label: "Auto-recovery", desc: "5 níveis de retry" },
              { icon: Globe, label: "ABR Smart", desc: "Qualidade adaptativa" },
              { icon: Tv, label: "Embed fácil", desc: "iframe ou JS" },
              { icon: Code2, label: "API REST", desc: "JSON endpoint" },
            ].map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 transition-all group">
                <f.icon className="w-5 h-5 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-[11px] text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Demo */}
      <section className="px-4 sm:px-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">🎬 Demo ao vivo</h2>
          <div className="rounded-2xl overflow-hidden border border-border/50 bg-black">
            <iframe
              src={`/player?tmdb=${DEMO_TMDB}&type=${DEMO_TYPE}&title=${encodeURIComponent(DEMO_TITLE)}`}
              className="w-full aspect-video"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Player protótipo em ação — engine com as 7 otimizações de velocidade aplicadas.</p>
        </div>
      </section>

      {/* Embed Generator */}
      <section className="px-4 sm:px-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">⚡ Gerador de Embed</h2>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Config */}
            <div className="space-y-4 p-6 rounded-2xl bg-card/50 border border-border/50">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configuração</h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">TMDB ID</label>
                  <input
                    value={tmdbInput}
                    onChange={e => setTmdbInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
                    placeholder="550"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                  <select
                    value={typeInput}
                    onChange={e => setTypeInput(e.target.value as "movie" | "tv")}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
                  >
                    <option value="movie">Filme</option>
                    <option value="tv">Série / Anime</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Título</label>
                <input
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
                />
              </div>

              {typeInput === "tv" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Temporada</label>
                    <input
                      value={seasonInput}
                      onChange={e => setSeasonInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
                      type="number" min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Episódio</label>
                    <input
                      value={episodeInput}
                      onChange={e => setEpisodeInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
                      type="number" min="1"
                    />
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Preview da URL:</p>
                <code className="text-xs text-primary break-all bg-primary/5 px-3 py-2 rounded-lg block">{buildEmbedUrl()}</code>
              </div>
            </div>

            {/* Preview iframe */}
            <div className="rounded-2xl overflow-hidden border border-border/50 bg-black flex items-center justify-center min-h-[300px]">
              <div className="w-full aspect-video">
                <iframe
                  src={`/player?tmdb=${tmdbInput}&type=${typeInput}&title=${encodeURIComponent(titleInput)}${typeInput === "tv" ? `&s=${seasonInput}&e=${episodeInput}` : ""}`}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code snippets */}
      <section className="px-4 sm:px-8 pb-16">
        <div className="max-w-6xl mx-auto space-y-8">
          <h2 className="text-2xl font-bold">📦 Integração</h2>

          {/* iframe */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" /> Método 1 — iframe (recomendado)
            </h3>
            <div className="relative rounded-xl bg-[#0d1117] border border-border/30 p-4 overflow-x-auto">
              <CopyBtn text={iframeCode} id="iframe" />
              <pre className="text-[13px] text-green-400/90 font-mono whitespace-pre leading-relaxed">{iframeCode}</pre>
            </div>
          </div>

          {/* JS */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" /> Método 2 — JavaScript
            </h3>
            <div className="relative rounded-xl bg-[#0d1117] border border-border/30 p-4 overflow-x-auto">
              <CopyBtn text={jsCode} id="js" />
              <pre className="text-[13px] text-green-400/90 font-mono whitespace-pre leading-relaxed">{jsCode}</pre>
            </div>
          </div>

          {/* API */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" /> Método 3 — API REST
            </h3>
            <div className="relative rounded-xl bg-[#0d1117] border border-border/30 p-4 overflow-x-auto">
              <CopyBtn text={apiExample} id="api" />
              <pre className="text-[13px] text-blue-400/90 font-mono whitespace-pre leading-relaxed">{apiExample}</pre>
            </div>
          </div>

          {/* API Docs */}
          <div className="rounded-2xl bg-card/50 border border-border/50 p-6 space-y-6">
            <h3 className="text-lg font-semibold">📚 Documentação da API</h3>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-primary mb-2">Embed URL</h4>
                <code className="text-sm bg-primary/5 px-3 py-1.5 rounded-lg text-primary block">
                  GET {BASE_DOMAIN}/embed?tmdb=&#123;id&#125;&type=&#123;movie|tv&#125;&title=&#123;title&#125;&s=&#123;season&#125;&e=&#123;episode&#125;
                </code>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Parâmetro</th>
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Obrigatório</th>
                      <th className="text-left py-2 text-muted-foreground font-medium">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground/80">
                    <tr className="border-b border-border/30">
                      <td className="py-2 pr-4 font-mono text-xs text-primary">tmdb</td>
                      <td className="py-2 pr-4">number</td>
                      <td className="py-2 pr-4">✅</td>
                      <td className="py-2">ID do TMDB do conteúdo</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-2 pr-4 font-mono text-xs text-primary">type</td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4">✅</td>
                      <td className="py-2">"movie" ou "tv"</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-2 pr-4 font-mono text-xs text-primary">title</td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4">❌</td>
                      <td className="py-2">Título exibido no player</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-2 pr-4 font-mono text-xs text-primary">s</td>
                      <td className="py-2 pr-4">number</td>
                      <td className="py-2 pr-4">❌*</td>
                      <td className="py-2">Temporada (obrigatório para type=tv)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs text-primary">e</td>
                      <td className="py-2 pr-4">number</td>
                      <td className="py-2 pr-4">❌*</td>
                      <td className="py-2">Episódio (obrigatório para type=tv)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-primary mb-2">API REST Endpoint</h4>
                <code className="text-sm bg-primary/5 px-3 py-1.5 rounded-lg text-primary block">
                  POST {BASE_DOMAIN}/embed/api
                </code>
                <p className="text-xs text-muted-foreground mt-2">
                  Body JSON: <code className="text-primary">{"{"} tmdb_id, content_type, season?, episode? {"}"}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Response: <code className="text-primary">{"{"} url, type, provider {"}"}</code>
                </p>
              </div>
            </div>
          </div>

          {/* Features comparison */}
          <div className="rounded-2xl bg-card/50 border border-border/50 p-6">
            <h3 className="text-lg font-semibold mb-4">🏆 LynePlay vs JW Player</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Feature</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">LynePlay</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">JW Player</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  {[
                    ["Start time", "< 2s (startLevel:0 + prefetch)", "~3-5s"],
                    ["ABR Engine", "EWMA adaptativo + 7 otimizações", "Padrão HLS.js"],
                    ["Auto-recovery", "5 níveis + stall detection 8s", "Básico"],
                    ["Buffer inteligente", "0→30→120→600s dinâmico", "Fixo"],
                    ["Client-side cache", "SessionStorage 30min", "Não"],
                    ["API prefetch", "Paralelo ao mount", "Não"],
                    ["Custo", "Gratuito", "$$$ por impression"],
                  ].map(([feat, lyne, jw], i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 pr-4 font-medium">{feat}</td>
                      <td className="py-2 pr-4 text-green-400">{lyne}</td>
                      <td className="py-2 text-muted-foreground">{jw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default LynePlayPage;
