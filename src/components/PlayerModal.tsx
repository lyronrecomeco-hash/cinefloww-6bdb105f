import { useState, useEffect, useCallback, useRef } from "react";
import { X, Play, ExternalLink, RefreshCw, ChevronRight, Shield } from "lucide-react";

interface PlayerModalProps {
  tmdbId: number;
  imdbId?: string | null;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title: string;
  onClose: () => void;
}

// --- Provider definitions ---

interface Provider {
  name: string;
  buildUrl: (tmdbId: number, imdbId: string | null | undefined, type: "movie" | "tv", season?: number, episode?: number) => string;
  useProxy?: boolean;
}

const PROVIDERS: Provider[] = [
  {
    name: "SuperFlix",
    useProxy: true,
    buildUrl: (tmdbId, imdbId, type, season, episode) => {
      const apiType = type === "movie" ? "filme" : "serie";
      const id = type === "movie" ? (imdbId || String(tmdbId)) : String(tmdbId);
      const s = type === "movie" ? "" : String(season ?? "");
      const e = type === "movie" ? "" : String(episode ?? "");
      let url = `https://superflixapi.one/${apiType}/${id}/${s}/${e}`;
      url = url.replace(/([^:])(\/\/{1,})/g, "$1/");
      url = url.replace(/\/$/, "");
      return url;
    },
  },
  {
    name: "Embed.su",
    buildUrl: (tmdbId, _imdbId, type, season, episode) => {
      if (type === "movie") {
        return `https://embed.su/embed/movie/${tmdbId}`;
      }
      return `https://embed.su/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
    },
  },
  {
    name: "VidSrc",
    buildUrl: (tmdbId, _imdbId, type, season, episode) => {
      if (type === "movie") {
        return `https://vidsrc.net/embed/movie/${tmdbId}`;
      }
      return `https://vidsrc.net/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
    },
  },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, onClose }: PlayerModalProps) => {
  const [currentProviderIdx, setCurrentProviderIdx] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [proxyHtml, setProxyHtml] = useState<string | null>(null);
  const [proxyLoading, setProxyLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const provider = PROVIDERS[currentProviderIdx];
  const rawUrl = provider.buildUrl(tmdbId, imdbId, type, season, episode);

  // Fetch proxied HTML for SuperFlix
  useEffect(() => {
    if (!provider.useProxy) {
      setProxyHtml(null);
      return;
    }

    setProxyLoading(true);
    setProxyHtml(null);

    fetch(`${SUPABASE_URL}/functions/v1/proxy-player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: rawUrl }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Proxy ${res.status}`);
        const html = await res.text();
        setProxyHtml(html);
        setProxyLoading(false);
        setIframeError(false);
      })
      .catch(() => {
        setProxyLoading(false);
        setIframeError(true);
      });
  }, [rawUrl, provider.useProxy, iframeKey]);

  // Timeout fallback for non-proxy providers
  useEffect(() => {
    if (provider.useProxy) return;
    setIframeError(false);
    const timer = setTimeout(() => setIframeError(true), 8000);
    return () => clearTimeout(timer);
  }, [iframeKey, currentProviderIdx, provider.useProxy]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const nextProvider = useCallback(() => {
    setIframeError(false);
    setCurrentProviderIdx((i) => (i + 1) % PROVIDERS.length);
    setIframeKey((k) => k + 1);
  }, []);

  const retryIframe = useCallback(() => {
    setIframeError(false);
    setIframeKey((k) => k + 1);
  }, []);

  const openExternal = useCallback(() => {
    window.open(rawUrl, "_blank", "noopener,noreferrer");
  }, [rawUrl]);

  // Build srcdoc for proxy or direct src
  const iframeSrc = provider.useProxy ? undefined : rawUrl;
  const iframeSrcDoc = provider.useProxy && proxyHtml ? proxyHtml : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div
        className="relative w-full max-w-5xl max-h-[90vh] glass-strong overflow-hidden animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <Play className="w-4 h-4 text-primary fill-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold truncate">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {type === "tv" && season && episode && (
                  <p className="text-xs text-muted-foreground">T{season} • E{episode}</p>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                  {provider.name}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={nextProvider}
              className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 hover:bg-white/10 transition-colors text-xs font-medium"
              title="Próximo provedor"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Próximo
            </button>
            <button
              onClick={retryIframe}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
              title="Tentar novamente"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={openExternal}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Player */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          {/* Anti-ads overlay — blocks top/bottom/corner ad zones */}
          <div className="absolute top-0 left-0 right-0 h-[3px] z-20 pointer-events-auto bg-background" />
          <div className="absolute bottom-0 left-0 right-0 h-[3px] z-20 pointer-events-auto bg-background" />
          <div className="absolute top-0 right-0 w-10 h-10 z-20 pointer-events-auto bg-transparent" />
          <div className="absolute top-0 left-0 w-10 h-10 z-20 pointer-events-auto bg-transparent" />

          {proxyLoading && provider.useProxy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Carregando via proxy...</p>
              </div>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={iframeSrc}
              srcDoc={iframeSrcDoc}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture"
              style={{ border: 0 }}
              scrolling="no"
              title={title}
            />
          )}

          {/* Error/fallback overlay */}
          {iframeError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-30">
              <div className="text-center p-6 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-display text-lg font-bold mb-2">
                  {provider.name} com acesso restrito
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  O provedor atual bloqueou o acesso. Tente o próximo provedor ou abra em nova aba.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                  <button
                    onClick={nextProvider}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Próximo Provedor
                  </button>
                  <button
                    onClick={openExternal}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl glass glass-hover font-semibold text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir em Nova Aba
                  </button>
                </div>
                {/* Provider list */}
                <div className="flex items-center justify-center gap-2 mt-5">
                  {PROVIDERS.map((p, i) => (
                    <button
                      key={p.name}
                      onClick={() => { setCurrentProviderIdx(i); setIframeError(false); setIframeKey((k) => k + 1); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        i === currentProviderIdx
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;
