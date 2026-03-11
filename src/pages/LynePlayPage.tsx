import { useState, useRef } from "react";
import { Play, Copy, Check, Zap, Shield, Globe, Layers, Code2, Terminal, Braces, ArrowRight, Cpu, Radio } from "lucide-react";

const LynePlayPage = () => {
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [activeTab, setActiveTab] = useState<"embed" | "api">("embed");
  const integrationRef = useRef<HTMLDivElement>(null);

  const BASE = "https://lyneflix.online";

  // Demo: Overflow — tmdb 95897
  const DEMO_TMDB = 95897;
  const DEMO_TYPE = "tv";
  const DEMO_SEASON = 1;
  const DEMO_EPISODE = 1;

  const embedCode = `<iframe
  src="${BASE}/embed?tmdb=TMDB_ID&type=TYPE&s=SEASON&e=EPISODE"
  width="100%" height="100%"
  frameborder="0" allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
  style="aspect-ratio:16/9; border-radius:12px;"
></iframe>`;

  const apiCode = `const res = await fetch("${BASE}/embed/api", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tmdb_id: 95897,
    content_type: "tv",
    season: 1,
    episode: 1
  })
});

const { url, type } = await res.json();
// url  → stream direto (m3u8 ou mp4)
// type → formato do stream`;

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
      <header className="sticky top-0 z-50 backdrop-blur-2xl bg-background/60 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-xl shadow-primary/30">
                <Play className="w-5 h-5 text-primary-foreground fill-current" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">LynePlay</h1>
              <p className="text-[9px] text-muted-foreground uppercase tracking-[0.25em] font-semibold">Player as a Service</p>
            </div>
          </div>
          <button
            onClick={scrollToIntegration}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-all"
          >
            <Code2 className="w-4 h-4" />
            Documentação
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.15),transparent)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-16 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
              <Radio className="w-3 h-3 animate-pulse" />
              Streaming API
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] mb-5">
              Player universal
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                para qualquer projeto.
              </span>
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
              HLS adaptativo, início instantâneo, auto-recovery e qualidade automática.
              Embed via iframe ou consuma a API REST — sem restrições.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={scrollToIntegration}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/25"
              >
                Integrar agora <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#preview"
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-foreground font-semibold text-sm hover:border-primary/30 transition-all"
              >
                <Play className="w-4 h-4" /> Ver demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Zap, label: "Início < 2s", desc: "Buffer inteligente com carregamento instantâneo" },
            { icon: Layers, label: "ABR Adaptativo", desc: "Qualidade ajustada à rede em tempo real" },
            { icon: Shield, label: "Auto-Recovery", desc: "Retry automático com rotação de fontes" },
            { icon: Cpu, label: "Universal", desc: "Web, mobile, smart TV — qualquer plataforma" },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="group p-4 sm:p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] hover:border-primary/20 transition-all duration-300"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-bold mb-0.5">{label}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Preview — uses /embed which now matches /player exactly ── */}
      <section id="preview" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/40" />
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Player ao vivo</h3>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black shadow-2xl shadow-black/60">
          <iframe
            src={`/embed?tmdb=${DEMO_TMDB}&type=${DEMO_TYPE}&s=${DEMO_SEASON}&e=${DEMO_EPISODE}`}
            className="w-full aspect-video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-2.5 text-center font-mono">
          Overflow: Transbordando — Preview do player embarcado
        </p>
      </section>

      {/* ── Integration ── */}
      <section ref={integrationRef} className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
              <Terminal className="w-3.5 h-3.5" />
              Integração
            </div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
              Duas formas de integrar
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Iframe para embedding direto ou API REST para controle total do stream.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-8">
            <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
              <button
                onClick={() => setActiveTab("embed")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "embed"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2 className="w-4 h-4" /> Embed
              </button>
              <button
                onClick={() => setActiveTab("api")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "api"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Braces className="w-4 h-4" /> API REST
              </button>
            </div>
          </div>

          {/* Embed Tab */}
          {activeTab === "embed" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">embed.html</span>
                  </div>
                  <button
                    onClick={() => copy(embedCode, setCopiedEmbed)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all"
                  >
                    {copiedEmbed ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copiedEmbed ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="p-4 text-xs text-foreground/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{embedCode}</code>
                </pre>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { n: "1", t: "Cole o iframe", d: "Adicione no HTML do seu site" },
                  { n: "2", t: "Defina o TMDB ID", d: "Ajuste tmdb_id e type" },
                  { n: "3", t: "Pronto", d: "Player carrega automaticamente" },
                ].map(({ n, t, d }) => (
                  <div key={n} className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center text-primary font-bold text-xs mb-2.5">
                      {n}
                    </div>
                    <p className="text-xs font-bold mb-0.5">{t}</p>
                    <p className="text-[10px] text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Tab */}
          {activeTab === "api" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 font-mono font-bold border border-green-500/15">
                      POST
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">/embed/api</span>
                  </div>
                  <button
                    onClick={() => copy(apiCode, setCopiedApi)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all"
                  >
                    {copiedApi ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copiedApi ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="p-4 text-xs text-foreground/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{apiCode}</code>
                </pre>
              </div>

              <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-bold border border-primary/15">
                      200
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">JSON Response</span>
                  </div>
                  <button
                    onClick={() => copy(responseExample, setCopiedResponse)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all"
                  >
                    {copiedResponse ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copiedResponse ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="p-4 text-xs text-foreground/60 font-mono overflow-x-auto leading-relaxed">
                  <code>{responseExample}</code>
                </pre>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
                    <Braces className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-bold mb-1">Player customizado</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Use a URL no seu próprio player HLS/MP4 com controle total da interface.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/15 flex items-center justify-center mb-3">
                    <Globe className="w-4 h-4 text-green-400" />
                  </div>
                  <p className="text-xs font-bold mb-1">Sem restrições</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    API REST universal — web, mobile, desktop, smart TV. Qualquer origem.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Play className="w-3 h-3 text-primary-foreground fill-current" />
            </div>
            <span className="text-[10px] text-muted-foreground">LynePlay · Player as a Service</span>
          </div>
          <span className="text-[9px] text-muted-foreground/20 font-mono">v3.2</span>
        </div>
      </footer>
    </div>
  );
};

export default LynePlayPage;
