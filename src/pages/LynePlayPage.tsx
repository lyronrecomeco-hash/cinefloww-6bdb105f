import { useState, useRef } from "react";
import {
  Play, Copy, Check, Zap, Shield, Globe, Layers, Code2, Terminal,
  Braces, ArrowRight, Cpu, Radio, Key, Lock, Monitor, Smartphone,
  FileCode, Package, Server, Eye, ChevronDown, ChevronUp
} from "lucide-react";

const BASE = "https://lyneflix.online";

/* ── Code snippets ── */
const IFRAME_SIMPLE = `<iframe
  src="${BASE}/embed/v2?src=https://cdn.site.com/video.m3u8&type=m3u8&title=Meu%20Video&poster=https://cdn.site.com/poster.jpg"
  width="100%" height="100%"
  frameborder="0" allowfullscreen
  allow="autoplay; fullscreen; picture-in-picture"
  style="aspect-ratio:16/9; border-radius:12px;"
></iframe>`;

const IFRAME_PAYLOAD = `// 1. Encode your config as base64
const config = {
  src: "https://cdn.site.com/video.m3u8",
  type: "m3u8",
  title: "Meu Vídeo",
  poster: "https://cdn.site.com/poster.jpg",
  controls: true,
  autoplay: true,
  tracks: [
    { src: "https://cdn.site.com/pt.vtt", srclang: "pt-BR", label: "Português", default: true }
  ]
};

const payload = btoa(JSON.stringify(config));

// 2. Use the encoded payload in the iframe
// <iframe src="${BASE}/embed/v2?p=\${payload}" ...></iframe>`;

const SDK_CODE = `<div id="lyneplay-player"></div>
<script src="${BASE}/sdk/player.js"></script>
<script>
  LynePlay.create({
    element: "#lyneplay-player",
    src: "https://cdn.site.com/video.m3u8",
    type: "m3u8",
    poster: "https://cdn.site.com/poster.jpg",
    title: "Meu Vídeo",
    controls: true,
    autoplay: true,
    tracks: [
      {
        src: "https://cdn.site.com/legenda.vtt",
        srclang: "pt-BR",
        label: "Português",
        default: true
      }
    ],
    qualities: [
      { label: "1080p", src: "https://cdn.site.com/1080.mp4" },
      { label: "720p", src: "https://cdn.site.com/720.mp4" }
    ]
  });
</script>`;

const API_SESSION = `const res = await fetch("${BASE}/api/player/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "create",
    src: "https://cdn.site.com/video.m3u8",
    type: "m3u8",
    title: "Meu Vídeo",
    poster: "https://cdn.site.com/poster.jpg",
    controls: true,
    autoplay: true,
    tracks: [
      { src: "https://cdn.site.com/pt.vtt", srclang: "pt-BR", label: "Português", default: true }
    ],
    ttl: 3600,
    allowedDomain: "meusite.com"
  })
});

const data = await res.json();
// data.embedUrl   → URL pronta para iframe
// data.token      → Token assinado para verificação
// data.sessionId  → ID da sessão`;

const API_RESPONSE = `{
  "success": true,
  "sessionId": "a1b2c3d4e5f6...",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "embedUrl": "${BASE}/embed/v2?p=BASE64_CONFIG",
  "playerConfig": {
    "src": "https://cdn.site.com/video.m3u8",
    "type": "m3u8",
    "title": "Meu Vídeo",
    "poster": "https://cdn.site.com/poster.jpg",
    "controls": true,
    "autoplay": true,
    "tracks": [],
    "qualities": [],
    "audioTracks": []
  },
  "expiresAt": "2026-12-31T23:59:59.000Z"
}`;

const FULL_CONFIG = `{
  // ── Obrigatórios ──
  "src": "https://cdn.site.com/video.m3u8",
  "type": "m3u8",            // m3u8 | mp4 | dash | webm

  // ── Metadados ──
  "title": "Meu Vídeo",
  "subtitle": "Episódio 1",
  "poster": "https://cdn.site.com/poster.jpg",

  // ── Reprodução ──
  "autoplay": true,
  "muted": false,
  "controls": true,
  "preload": "auto",
  "startAt": 120,             // iniciar em 2min

  // ── Legendas ──
  "tracks": [
    {
      "kind": "subtitles",
      "src": "https://cdn.site.com/pt.vtt",
      "srclang": "pt-BR",
      "label": "Português",
      "default": true
    },
    {
      "src": "https://cdn.site.com/en.vtt",
      "srclang": "en",
      "label": "English"
    }
  ],

  // ── Áudio (futuro) ──
  "audioTracks": [
    { "src": "https://cdn.site.com/audio-pt.m3u8", "lang": "pt-BR", "label": "Dublado" },
    { "src": "https://cdn.site.com/audio-en.m3u8", "lang": "en", "label": "Original" }
  ],

  // ── Qualidade manual (MP4) ──
  "qualities": [
    { "label": "1080p", "src": "https://cdn.site.com/1080.mp4" },
    { "label": "720p", "src": "https://cdn.site.com/720.mp4" },
    { "label": "480p", "src": "https://cdn.site.com/480.mp4" }
  ],

  // ── Customização ──
  "primaryColor": "#3B82F6",
  "logo": "https://meusite.com/logo.png",
  "watermark": "MeuSite",

  // ── Navegação ──
  "next": {
    "url": "https://cdn.site.com/ep2.m3u8",
    "title": "Episódio 2"
  },

  // ── Segurança ──
  "ttl": 3600,
  "allowedDomain": "meusite.com",
  "licenseKey": "lp_key_abc123"
}`;

/* ── Reusable CodeBlock component ── */
const CodeBlock = ({ title, badge, badgeColor, code, language }: {
  title: string;
  badge?: string;
  badgeColor?: string;
  code: string;
  language?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          {badge && (
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold border ${badgeColor || "bg-primary/10 text-primary border-primary/15"}`}>
              {badge}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono">{title}</span>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-4 text-xs text-foreground/60 font-mono overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/* ── Expandable section ── */
const Expandable = ({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-all">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-bold">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
};

/* ── Tab names ── */
type TabKey = "iframe" | "sdk" | "api";

const LynePlayPage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("iframe");
  const integrationRef = useRef<HTMLDivElement>(null);

  const DEMO_URL = `/embed/v2?src=${encodeURIComponent("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8")}&type=m3u8&title=LynePlay%20Demo&autoplay=0&controls=1`;

  const scrollToIntegration = () => integrationRef.current?.scrollIntoView({ behavior: "smooth" });

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
          <button onClick={scrollToIntegration} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-all">
            <Code2 className="w-4 h-4" /> Docs
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
              <Radio className="w-3 h-3 animate-pulse" /> Universal Embed API
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] mb-5">
              Player universal
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                para qualquer projeto.
              </span>
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mb-8">
              Embed white-label com HLS adaptativo, qualidade automática e auto-recovery.
              Iframe, payload codificado ou SDK JavaScript — sem dependências de catálogo.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={scrollToIntegration} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all shadow-xl shadow-primary/25">
                Integrar agora <ArrowRight className="w-4 h-4" />
              </button>
              <a href="#preview" className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-foreground font-semibold text-sm hover:border-primary/30 transition-all">
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
            { icon: Zap, label: "Início instantâneo", desc: "Buffer inteligente com carregamento < 2s" },
            { icon: Layers, label: "ABR Adaptativo", desc: "Qualidade ajustada à rede em tempo real" },
            { icon: Shield, label: "Auto-Recovery", desc: "Retry automático com rotação de fontes" },
            { icon: Globe, label: "Agnóstico", desc: "Aceita qualquer fonte: HLS, MP4, DASH" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="group p-4 sm:p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] hover:border-primary/20 transition-all duration-300">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm font-bold mb-0.5">{label}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Preview ── */}
      <section id="preview" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/40" />
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Player ao vivo</h3>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black shadow-2xl shadow-black/60">
          <iframe
            src={DEMO_URL}
            className="w-full aspect-video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-2.5 text-center font-mono">
          Demo · Embed universal com fonte HLS pública (Mux test stream)
        </p>
      </section>

      {/* ── Integration Docs ── */}
      <section ref={integrationRef} className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
              <Terminal className="w-3.5 h-3.5" /> Integração
            </div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">3 formas de integrar</h3>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Iframe direto, SDK JavaScript ou API REST com sessão tokenizada. Zero dependência de catálogo.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-8">
            <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
              {([
                { key: "iframe" as TabKey, icon: Code2, label: "Iframe" },
                { key: "sdk" as TabKey, icon: Package, label: "SDK JS" },
                { key: "api" as TabKey, icon: Server, label: "API REST" },
              ]).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === key
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab: Iframe ── */}
          {activeTab === "iframe" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <CodeBlock title="embed.html" code={IFRAME_SIMPLE} />

              <div className="grid grid-cols-3 gap-3">
                {[
                  { n: "1", t: "Cole o iframe", d: "Adicione o snippet no HTML do seu site" },
                  { n: "2", t: "Passe os params", d: "src, type, poster, title, tracks..." },
                  { n: "3", t: "Pronto", d: "Player renderiza automaticamente" },
                ].map(({ n, t, d }) => (
                  <div key={n} className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center text-primary font-bold text-xs mb-2.5">{n}</div>
                    <p className="text-xs font-bold mb-0.5">{t}</p>
                    <p className="text-[10px] text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>

              <Expandable title="Payload codificado (base64)" icon={Lock}>
                <p className="text-xs text-muted-foreground mb-3">
                  Para evitar URLs gigantes e exposição de dados, encode a config como base64 e passe via <code className="text-primary">?p=PAYLOAD</code>.
                </p>
                <CodeBlock title="payload.js" badge="JS" code={IFRAME_PAYLOAD} />
              </Expandable>
            </div>
          )}

          {/* ── Tab: SDK ── */}
          {activeTab === "sdk" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <CodeBlock title="index.html" badge="SDK" badgeColor="bg-green-500/10 text-green-400 border-green-500/15" code={SDK_CODE} />

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/15 flex items-center justify-center mb-3">
                    <Package className="w-4 h-4 text-green-400" />
                  </div>
                  <p className="text-xs font-bold mb-1">Sem iframe</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    O SDK cria o player diretamente no DOM. Controle total via JavaScript.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
                    <FileCode className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-bold mb-1">API Programática</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <code>LynePlay.create()</code>, <code>.updateSource()</code>, <code>.destroy()</code>
                  </p>
                </div>
              </div>

              <Expandable title="Métodos disponíveis" icon={Braces}>
                <div className="space-y-2">
                  {[
                    { method: "LynePlay.create(config)", desc: "Inicializa o player no elemento especificado" },
                    { method: "instance.updateSource(newConfig)", desc: "Atualiza a fonte sem recriar o player" },
                    { method: "instance.destroy()", desc: "Remove o player do DOM" },
                    { method: "LynePlay.getEmbedCode(config)", desc: "Retorna o HTML do iframe como string" },
                    { method: "LynePlay.createSession(config, cb)", desc: "Cria sessão via API REST" },
                    { method: "LynePlay.buildEmbedUrl(config)", desc: "Gera a URL do embed" },
                  ].map(({ method, desc }) => (
                    <div key={method} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <code className="text-[10px] text-primary font-mono whitespace-nowrap">{method}</code>
                      <span className="text-[10px] text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </Expandable>
            </div>
          )}

          {/* ── Tab: API REST ── */}
          {activeTab === "api" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <CodeBlock title="/api/player/session" badge="POST" badgeColor="bg-green-500/10 text-green-400 border-green-500/15" code={API_SESSION} />
              <CodeBlock title="JSON Response" badge="200" code={API_RESPONSE} />

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
                    <Key className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-bold mb-1">Token assinado</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">HMAC-SHA256 com expiração configurável</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/15 flex items-center justify-center mb-3">
                    <Shield className="w-4 h-4 text-green-400" />
                  </div>
                  <p className="text-xs font-bold mb-1">Domain lock</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">Restrinja uso a domínios autorizados</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center mb-3">
                    <Lock className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-xs font-bold mb-1">Rate limit</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">60 req/min com proteção anti-abuse</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Full Config Reference ── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
              <Braces className="w-3.5 h-3.5" /> Referência
            </div>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Configuração completa</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Todos os parâmetros aceitos pelo player. Apenas <code className="text-primary">src</code> é obrigatório.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-5">
            <CodeBlock title="PlayerConfig" badge="JSON" code={FULL_CONFIG} />

            {/* Params table */}
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-xl">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                <span className="text-xs font-bold">Parâmetros suportados</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {[
                  { param: "src", type: "string", req: true, desc: "URL da fonte de vídeo (HLS, MP4, DASH)" },
                  { param: "type", type: "string", req: false, desc: "Formato: m3u8 | mp4 | dash | webm" },
                  { param: "poster", type: "string", req: false, desc: "URL da thumbnail/capa" },
                  { param: "title", type: "string", req: false, desc: "Título exibido no player" },
                  { param: "subtitle", type: "string", req: false, desc: "Subtítulo/metadado adicional" },
                  { param: "autoplay", type: "boolean", req: false, desc: "Iniciar automaticamente (default: true)" },
                  { param: "muted", type: "boolean", req: false, desc: "Iniciar mutado" },
                  { param: "controls", type: "boolean", req: false, desc: "Mostrar controles (default: true)" },
                  { param: "startAt", type: "number", req: false, desc: "Iniciar em tempo específico (segundos)" },
                  { param: "tracks", type: "array", req: false, desc: "Lista de legendas (VTT)" },
                  { param: "qualities", type: "array", req: false, desc: "Lista manual de qualidades (MP4)" },
                  { param: "audioTracks", type: "array", req: false, desc: "Faixas de áudio alternativas" },
                  { param: "primaryColor", type: "string", req: false, desc: "Cor de destaque do player (hex)" },
                  { param: "logo", type: "string", req: false, desc: "Logo do integrador" },
                  { param: "watermark", type: "string", req: false, desc: "Texto de marca d'água" },
                  { param: "next", type: "object", req: false, desc: "Próximo vídeo (url, title)" },
                  { param: "ttl", type: "number", req: false, desc: "Tempo de vida da sessão (60-86400s)" },
                  { param: "allowedDomain", type: "string", req: false, desc: "Domínio autorizado para embed" },
                ].map(({ param, type, req, desc }) => (
                  <div key={param} className="flex items-center gap-4 px-4 py-2.5">
                    <code className="text-[11px] text-primary font-mono w-28 shrink-0">{param}</code>
                    <span className="text-[10px] text-muted-foreground/50 font-mono w-16 shrink-0">{type}</span>
                    {req && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15 font-bold shrink-0">REQ</span>}
                    <span className="text-[10px] text-muted-foreground flex-1">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported Formats ── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-8">
            <h3 className="text-xl font-black tracking-tight mb-2">Formatos suportados</h3>
          </div>
          <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { format: "HLS", ext: ".m3u8", status: "✅", label: "Ativo" },
              { format: "MP4", ext: ".mp4", status: "✅", label: "Ativo" },
              { format: "DASH", ext: ".mpd", status: "🔜", label: "Em breve" },
              { format: "WebM", ext: ".webm", status: "🔜", label: "Em breve" },
            ].map(({ format, ext, status, label }) => (
              <div key={format} className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] text-center">
                <p className="text-lg font-black mb-0.5">{format}</p>
                <p className="text-[10px] text-muted-foreground font-mono mb-2">{ext}</p>
                <span className="text-[10px]">{status} {label}</span>
              </div>
            ))}
          </div>

          {/* Platforms */}
          <div className="max-w-3xl mx-auto mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: Monitor, label: "Web", desc: "Chrome, Firefox, Safari, Edge" },
              { icon: Smartphone, label: "Mobile", desc: "iOS Safari, Android Chrome" },
              { icon: Cpu, label: "Smart TV", desc: "WebOS, Tizen, Android TV" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] text-center">
                <Icon className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-xs font-bold">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture ── */}
      <section className="border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-8">
            <h3 className="text-xl font-black tracking-tight mb-2">Arquitetura</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">Camadas independentes para máxima flexibilidade</p>
          </div>
          <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-3">
            {[
              { icon: Eye, label: "Rota de Embed", path: "/embed/v2", desc: "Renderiza o player com config via query params ou payload base64" },
              { icon: Server, label: "API de Sessão", path: "/api/player/session", desc: "Valida payload, gera token HMAC, retorna config + embedUrl" },
              { icon: Shield, label: "Proxy de Mídia", path: "/stream/:token", desc: "Mascara URL, aplica headers, controla expiração e hotlink" },
            ].map(({ icon: Icon, label, path, desc }) => (
              <div key={label} className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs font-bold mb-0.5">{label}</p>
                <code className="text-[10px] text-primary/60 font-mono">{path}</code>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-2">{desc}</p>
              </div>
            ))}
          </div>
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
          <span className="text-[9px] text-muted-foreground/20 font-mono">v4.0</span>
        </div>
      </footer>
    </div>
  );
};

export default LynePlayPage;
