import { useState, useRef } from "react";
import { Play, Copy, Check, ExternalLink, Zap, Shield, Globe, Layers, Code2, Terminal, Braces, ArrowRight } from "lucide-react";

const LynePlayPage = () => {
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [activeTab, setActiveTab] = useState<"embed" | "api">("embed");
  const integrationRef = useRef<HTMLDivElement>(null);

  const BASE = "https://lyneflix.online";

  // Demo: Dragon Ball Super (anime) — tmdb 62104
  const DEMO_TMDB = 62104;
  const DEMO_TYPE = "tv";
  const DEMO_SEASON = 1;
  const DEMO_EPISODE = 1;

  const embedCode = `<iframe
  src="${BASE}/embed?tmdb=${DEMO_TMDB}&type=${DEMO_TYPE}&s=${DEMO_SEASON}&e=${DEMO_EPISODE}"
  width="100%" height="100%"
  frameborder="0" allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
  style="aspect-ratio: 16/9; border-radius: 12px;"
></iframe>`;

  const apiCode = `const res = await fetch("${BASE}/embed/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tmdb_id: ${DEMO_TMDB},
    content_type: "${DEMO_TYPE}",
    season: ${DEMO_SEASON},
    episode: ${DEMO_EPISODE}
  })
});

const data = await res.json();
// data.url  → URL do stream direto
// data.type → "m3u8" ou "mp4"`;

  const responseExample = `{
  "url": "https://cdn.../stream.m3u8",
  "type": "m3u8",
  "provider": "lyneplay"
}`;

  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const scrollToIntegration = () => {
    integrationRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                <Play className="w-5 h-5 text-primary-foreground fill-current" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                LynePlay
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">
                Player as a Service
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={scrollToIntegration}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Code2 className="w-4 h-4" />
              Documentação
            </button>
            <a
              href="/"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            >
              LyneFlix <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.06),transparent_60%)]" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-8">
              <Zap className="w-3.5 h-3.5" />
              Player de Alta Performance
              <span className="w-1 h-1 rounded-full bg-primary/50" />
              <span className="text-primary/70">Open API</span>
            </div>
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6">
              Integre streaming
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                no seu projeto.
              </span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10">
              Player otimizado com HLS adaptativo, início instantâneo e qualidade automática.
              Incorpore via iframe ou consuma a API REST.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={scrollToIntegration}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/25"
              >
                Começar integração <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#preview"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:border-primary/30 transition-all"
              >
                <Play className="w-4 h-4" /> Ver demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Zap, label: "Início < 2s", desc: "Carregamento instantâneo com buffer inteligente", color: "text-yellow-400" },
            { icon: Layers, label: "ABR Adaptativo", desc: "Qualidade ajustada automaticamente à rede", color: "text-primary" },
            { icon: Shield, label: "Auto-Recovery", desc: "Retry automático e rotação de fontes em falhas", color: "text-green-400" },
            { icon: Globe, label: "Universal", desc: "Desktop, mobile, smart TV — qualquer plataforma", color: "text-purple-400" },
          ].map(({ icon: Icon, label, desc, color }) => (
            <div
              key={label}
              className="group p-5 rounded-2xl bg-card/50 border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">{label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Preview ── */}
      <section id="preview" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/30" />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Preview ao vivo</h3>
        </div>
        <div className="rounded-2xl overflow-hidden border border-border bg-black shadow-2xl shadow-black/60">
          <iframe
            src={`/embed?tmdb=${DEMO_TMDB}&type=${DEMO_TYPE}&s=${DEMO_SEASON}&e=${DEMO_EPISODE}`}
            className="w-full aspect-video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-xs text-muted-foreground/50 mt-3 text-center">
          Dragon Ball Super — Demonstração do player embarcado
        </p>
      </section>

      {/* ── Integration Section ── */}
      <section ref={integrationRef} className="border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
              <Terminal className="w-3.5 h-3.5" />
              Integração rápida
            </div>
            <h3 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
              Duas formas de integrar
            </h3>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Escolha entre embed direto via iframe ou consuma a API REST para ter controle total.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="flex gap-1 p-1 rounded-xl bg-card border border-border">
              <button
                onClick={() => setActiveTab("embed")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "embed"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="w-4 h-4" /> Embed (iframe)
              </button>
              <button
                onClick={() => setActiveTab("api")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "api"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Braces className="w-4 h-4" /> API REST
              </button>
            </div>
          </div>

          {/* Embed Tab */}
          {activeTab === "embed" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Code Card */}
              <div className="rounded-2xl border border-border overflow-hidden bg-card/50 shadow-xl">
                <div className="flex items-center justify-between px-5 py-3.5 bg-secondary/50 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-destructive/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">embed.html</span>
                  </div>
                  <button
                    onClick={() => copy(embedCode, setCopiedEmbed)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                  >
                    {copiedEmbed ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedEmbed ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <pre className="p-5 text-sm text-foreground/70 font-mono overflow-x-auto leading-relaxed">
                  <code>{embedCode}</code>
                </pre>
              </div>

              {/* How it works */}
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { step: "1", title: "Copie o código", desc: "Cole o iframe no HTML do seu site" },
                  { step: "2", title: "Defina o TMDB ID", desc: "Altere o tmdb e type para seu conteúdo" },
                  { step: "3", title: "Pronto!", desc: "O player carrega e reproduz automaticamente" },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="p-5 rounded-2xl bg-card/50 border border-border">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm mb-3">
                      {step}
                    </div>
                    <p className="text-sm font-bold text-foreground mb-1">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Tab */}
          {activeTab === "api" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Endpoint */}
              <div className="rounded-2xl border border-border overflow-hidden bg-card/50 shadow-xl">
                <div className="flex items-center justify-between px-5 py-3.5 bg-secondary/50 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 font-mono font-bold border border-green-500/20">
                      POST
                    </span>
                    <span className="text-sm text-muted-foreground font-mono">{BASE}/embed/api</span>
                  </div>
                  <button
                    onClick={() => copy(apiCode, setCopiedApi)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                  >
                    {copiedApi ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedApi ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <pre className="p-5 text-sm text-foreground/70 font-mono overflow-x-auto leading-relaxed">
                  <code>{apiCode}</code>
                </pre>
              </div>

              {/* Response */}
              <div className="rounded-2xl border border-border overflow-hidden bg-card/50">
                <div className="flex items-center justify-between px-5 py-3.5 bg-secondary/50 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] px-2.5 py-1 rounded-md bg-primary/10 text-primary font-mono font-bold border border-primary/20">
                      200
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">Resposta JSON</span>
                  </div>
                  <button
                    onClick={() => copy(responseExample, setCopiedResponse)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                  >
                    {copiedResponse ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedResponse ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <pre className="p-5 text-sm text-foreground/70 font-mono overflow-x-auto leading-relaxed">
                  <code>{responseExample}</code>
                </pre>
              </div>

              {/* Use cases */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-card/50 border border-border">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <Braces className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">Player customizado</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Use a URL retornada no seu próprio player HLS/MP4 com controle total da interface.
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-card/50 border border-border">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
                    <Globe className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">Qualquer plataforma</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    API REST compatível com web, mobile, desktop, smart TV — sem restrição de origem.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 text-primary-foreground fill-current" />
            </div>
            <span className="text-xs text-muted-foreground">LynePlay · Powered by LyneFlix</span>
          </div>
          <span className="text-[10px] text-muted-foreground/30 font-mono">v3.0</span>
        </div>
      </footer>
    </div>
  );
};

export default LynePlayPage;
