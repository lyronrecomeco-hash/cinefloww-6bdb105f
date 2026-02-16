import { useState, useEffect, useCallback } from "react";
import { X, Play, ExternalLink, RefreshCw, ChevronRight, Shield, ChevronDown, Mic, Subtitles, Video, Zap, Globe } from "lucide-react";
import CustomPlayer from "./CustomPlayer";

interface PlayerModalProps {
  tmdbId: number;
  imdbId?: string | null;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title: string;
  audioTypes?: string[];
  onClose: () => void;
}

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8" | "embed";
}

interface EmbedProvider {
  name: string;
  tag: string;
  buildUrl: (tmdbId: number, imdbId: string | null | undefined, type: "movie" | "tv", season?: number, episode?: number) => string;
  externalOnly?: boolean;
  lang?: string; // Language hint for audio selection
}

const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    name: "VidSrc.cc", tag: "Principal", lang: "multi",
    buildUrl: (_tmdbId, imdbId, type, season, episode) => {
      const id = imdbId || String(_tmdbId);
      return type === "movie"
        ? `https://vidsrc.cc/v2/embed/movie/${id}`
        : `https://vidsrc.cc/v2/embed/tv/${id}/${season ?? 1}/${episode ?? 1}`;
    },
  },
  {
    name: "Videasy", tag: "PT-BR • Multi-Lang", lang: "pt",
    buildUrl: (tmdbId, _imdbId, type, season, episode) =>
      type === "movie"
        ? `https://player.videasy.net/movie/${tmdbId}`
        : `https://player.videasy.net/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`,
  },
  {
    name: "Embed.su", tag: "Multi-server", lang: "en",
    buildUrl: (tmdbId, _imdbId, type, season, episode) =>
      type === "movie" ? `https://embed.su/embed/movie/${tmdbId}` : `https://embed.su/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`,
  },
  {
    name: "VidSrc.net", tag: "Alternativo", lang: "en",
    buildUrl: (tmdbId, _imdbId, type, season, episode) =>
      type === "movie" ? `https://vidsrc.net/embed/movie/${tmdbId}` : `https://vidsrc.net/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`,
  },
  {
    name: "SuperFlix", tag: "PT-BR", externalOnly: true, lang: "pt",
    buildUrl: (tmdbId, imdbId, type, season, episode) => {
      const apiType = type === "movie" ? "filme" : "serie";
      const id = type === "movie" ? (imdbId || String(tmdbId)) : String(tmdbId);
      return type === "movie" ? `https://superflixapi.one/${apiType}/${id}` : `https://superflixapi.one/${apiType}/${id}/${season ?? 1}/${episode ?? 1}`;
    },
  },
];

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas", className: "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera (qualidade inferior)", className: "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25" },
];

const AUDIO_BADGES: Record<string, { icon: typeof Mic; label: string; className: string }> = {
  dublado: { icon: Mic, label: "Dublado PT-BR", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  legendado: { icon: Subtitles, label: "Legendado", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  cam: { icon: Video, label: "CAM", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

type PlayerPhase = "audio-select" | "playing";

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, audioTypes = [], onClose }: PlayerModalProps) => {
  const [phase, setPhase] = useState<PlayerPhase>(audioTypes.length > 1 ? "audio-select" : "playing");
  const [selectedAudio, setSelectedAudio] = useState<string>(audioTypes[0] || "legendado");
  const [sources, setSources] = useState<VideoSource[]>([]);

  // Embed state
  const [currentProviderIdx, setCurrentProviderIdx] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showProviders, setShowProviders] = useState(false);

  const provider = EMBED_PROVIDERS[currentProviderIdx];
  const rawUrl = provider.buildUrl(tmdbId, imdbId, type, season, episode);
  const iframeSrc = provider.externalOnly ? null : rawUrl;

  // Auto-select provider based on audio choice
  useEffect(() => {
    if (phase !== "playing") return;
    if (selectedAudio === "dublado") {
      // Prefer Portuguese providers for dubbed content
      const ptIdx = EMBED_PROVIDERS.findIndex(p => p.lang === "pt" && !p.externalOnly);
      if (ptIdx >= 0 && ptIdx !== currentProviderIdx) {
        setCurrentProviderIdx(ptIdx);
        setIframeKey(k => k + 1);
      }
    }
  }, [phase, selectedAudio]);

  // Escape key + block popups
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    const origOpen = window.open;
    window.open = function() { return null; } as typeof window.open;
    return () => {
      window.removeEventListener("keydown", handler);
      window.open = origOpen;
    };
  }, [onClose]);

  // Iframe load timeout (25s instead of 12s)
  useEffect(() => {
    if (phase !== "playing") return;
    setIframeError(false);
    setIframeLoaded(false);
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeError(true);
    }, 25000);
    return () => clearTimeout(timer);
  }, [iframeKey, currentProviderIdx, phase]);

  const nextProvider = useCallback(() => {
    setIframeError(false);
    setIframeLoaded(false);
    setCurrentProviderIdx((i) => (i + 1) % EMBED_PROVIDERS.length);
    setIframeKey((k) => k + 1);
  }, []);

  const selectProvider = useCallback((idx: number) => {
    setIframeError(false);
    setIframeLoaded(false);
    setCurrentProviderIdx(idx);
    setIframeKey((k) => k + 1);
    setShowProviders(false);
  }, []);

  const retryIframe = useCallback(() => { setIframeError(false); setIframeLoaded(false); setIframeKey((k) => k + 1); }, []);
  const openExternal = useCallback(() => {
    // Temporarily restore window.open for this action
    const orig = window.open;
    window.open = Window.prototype.open;
    window.open(rawUrl, "_blank", "noopener,noreferrer");
    window.open = orig;
  }, [rawUrl]);

  const handleAudioSelect = (audioKey: string) => {
    setSelectedAudio(audioKey);
    setPhase("playing");
  };

  // Audio selection screen
  if (phase === "audio-select") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
        <div className="relative w-full max-w-md glass-strong overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl font-bold">{title}</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha o tipo de áudio</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {AUDIO_OPTIONS.filter(opt => audioTypes.includes(opt.key)).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleAudioSelect(opt.key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 ${opt.className}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{opt.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 opacity-50" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                onClick={() => setPhase("playing")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
              >
                <Globe className="w-4 h-4" />
                Pular seleção e assistir
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div className="relative w-full max-w-5xl max-h-[95vh] glass-strong overflow-hidden animate-scale-in flex flex-col" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              {sources.length > 0 ? <Zap className="w-3.5 h-3.5 text-primary" /> : <Play className="w-3.5 h-3.5 text-primary fill-primary" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold truncate">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {type === "tv" && season && episode && <span className="text-[10px] text-muted-foreground">T{season} • E{episode}</span>}
                
                {/* Selected audio badge */}
                {selectedAudio && AUDIO_BADGES[selectedAudio] && (() => {
                  const badge = AUDIO_BADGES[selectedAudio];
                  const Icon = badge.icon;
                  return (
                    <button
                      onClick={() => audioTypes.length > 1 && setPhase("audio-select")}
                      className={`text-[9px] px-1.5 py-0.5 rounded-md border font-semibold flex items-center gap-1 ${badge.className} ${audioTypes.length > 1 ? 'cursor-pointer hover:opacity-80' : ''}`}
                    >
                      <Icon className="w-2.5 h-2.5" />{badge.label}
                    </button>
                  );
                })()}

                {/* Provider badge */}
                <span className="text-[9px] px-1.5 py-0.5 rounded-md border font-semibold bg-white/5 text-muted-foreground border-white/10">
                  {provider.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <div className="relative">
              <button onClick={() => setShowProviders(!showProviders)}
                className="h-8 px-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 hover:bg-white/10 transition-colors text-[11px] font-medium">
                {provider.name}
                <ChevronDown className={`w-3 h-3 transition-transform ${showProviders ? "rotate-180" : ""}`} />
              </button>
              {showProviders && (
                <div className="absolute top-full mt-1 right-0 w-52 glass-strong z-50 p-1.5 rounded-xl">
                  {EMBED_PROVIDERS.map((p, i) => (
                    <button key={p.name} onClick={() => selectProvider(i)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                        i === currentProviderIdx ? "bg-primary/15 text-primary" : "hover:bg-white/5 text-foreground"
                      }`}>
                      <span className="font-medium">{p.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${
                        p.externalOnly ? "bg-amber-500/10 text-amber-400" : p.lang === "pt" ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-muted-foreground"
                      }`}>{p.externalOnly ? "Nova aba" : p.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={nextProvider} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors" title="Próximo">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={retryIframe} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors" title="Recarregar">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={openExternal} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors" title="Nova aba">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player area */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          
          {/* Ad protection overlays - block common ad click zones */}
          <div className="absolute top-0 left-0 right-0 h-[4px] z-20 pointer-events-auto bg-background" />
          <div className="absolute bottom-0 left-0 right-0 h-[4px] z-20 pointer-events-auto bg-background" />
          <div className="absolute top-0 left-0 w-[4px] h-full z-20 pointer-events-auto bg-background" />
          <div className="absolute top-0 right-0 w-[4px] h-full z-20 pointer-events-auto bg-background" />

          {iframeSrc ? (
            <iframe
              key={iframeKey}
              src={iframeSrc}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              style={{ border: 0 }}
              scrolling="no"
              title={title}
              onLoad={() => setIframeLoaded(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center p-6 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <ExternalLink className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-bold mb-2">{provider.name}</h3>
                <p className="text-sm text-muted-foreground mb-5">Este provedor abre em nova aba para melhor experiência.</p>
                <button onClick={openExternal}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all mx-auto">
                  <ExternalLink className="w-4 h-4" />Abrir {provider.name}
                </button>
              </div>
            </div>
          )}

          {iframeError && iframeSrc && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-30">
              <div className="text-center p-6 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-bold mb-2">{provider.name} com acesso restrito</h3>
                <p className="text-sm text-muted-foreground mb-5">Tente outro provedor ou abra em nova aba.</p>
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                  <button onClick={nextProvider} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90">
                    <ChevronRight className="w-4 h-4" />Próximo
                  </button>
                  <button onClick={openExternal} className="flex items-center gap-2 px-5 py-2.5 rounded-xl glass glass-hover font-semibold text-sm">
                    <ExternalLink className="w-4 h-4" />Nova Aba
                  </button>
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-4">
                  {EMBED_PROVIDERS.map((p, i) => (
                    <button key={p.name} onClick={() => selectProvider(i)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                        i === currentProviderIdx ? "bg-primary/20 text-primary border-primary/30" : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                      }`}>{p.name}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar with audio info */}
        {audioTypes.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/10 flex items-center gap-3 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] text-muted-foreground flex-shrink-0">Disponível em:</span>
            {audioTypes.map((at) => {
              const badge = AUDIO_BADGES[at];
              if (!badge) return null;
              const Icon = badge.icon;
              const isSelected = at === selectedAudio;
              return (
                <button
                  key={at}
                  onClick={() => { setSelectedAudio(at); }}
                  className={`text-[10px] px-2 py-1 rounded-lg border font-medium flex items-center gap-1.5 flex-shrink-0 transition-all ${badge.className} ${isSelected ? 'ring-1 ring-offset-1 ring-offset-background ring-current scale-105' : 'opacity-60 hover:opacity-100'}`}
                >
                  <Icon className="w-3 h-3" />{badge.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerModal;
