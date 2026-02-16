import { useState, useEffect, useCallback, useRef } from "react";
import { X, Play, ExternalLink, RefreshCw, ChevronRight, ChevronDown, Mic, Subtitles, Video, Globe, Loader2, Zap, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  type: "mp4" | "m3u8";
}

interface EmbedProvider {
  name: string;
  tag: string;
  buildUrl: (tmdbId: number, imdbId: string | null | undefined, type: "movie" | "tv", season?: number, episode?: number) => string;
  externalOnly?: boolean;
  lang?: string;
}

const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    name: "Videasy", tag: "PT-BR", lang: "pt",
    buildUrl: (tmdbId, _imdbId, type, season, episode) =>
      type === "movie" ? `https://player.videasy.net/movie/${tmdbId}` : `https://player.videasy.net/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`,
  },
  {
    name: "VidSrc.cc", tag: "Multi", lang: "multi",
    buildUrl: (_tmdbId, imdbId, type, season, episode) => {
      const id = imdbId || String(_tmdbId);
      return type === "movie" ? `https://vidsrc.cc/v2/embed/movie/${id}` : `https://vidsrc.cc/v2/embed/tv/${id}/${season ?? 1}/${episode ?? 1}`;
    },
  },
  {
    name: "Embed.su", tag: "Multi-server", lang: "en",
    buildUrl: (tmdbId, _imdbId, type, season, episode) =>
      type === "movie" ? `https://embed.su/embed/movie/${tmdbId}` : `https://embed.su/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`,
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
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro", gradient: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 hover:border-emerald-400/50" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas em PT-BR", gradient: "from-blue-500/20 to-blue-600/5 border-blue-500/30 hover:border-blue-400/50" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera (qualidade inferior)", gradient: "from-amber-500/20 to-amber-600/5 border-amber-500/30 hover:border-amber-400/50" },
];

type PlayerPhase = "audio-select" | "extracting" | "playing-custom" | "playing-embed";

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, audioTypes = [], onClose }: PlayerModalProps) => {
  const [phase, setPhase] = useState<PlayerPhase>(audioTypes.length > 1 ? "audio-select" : "extracting");
  const [selectedAudio, setSelectedAudio] = useState<string>(audioTypes[0] || "legendado");
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [extractionStatus, setExtractionStatus] = useState("Iniciando extração...");
  const [currentProviderIdx, setCurrentProviderIdx] = useState(0);
  const [iframeKey, setIframeKey] = useState(0);
  const [showProviders, setShowProviders] = useState(false);
  const extractionAttempted = useRef(false);

  // Start extraction when entering extracting phase
  useEffect(() => {
    if (phase !== "extracting" || extractionAttempted.current) return;
    extractionAttempted.current = true;

    const extract = async () => {
      try {
        setExtractionStatus("Buscando fontes de vídeo...");
        
        const { data, error } = await supabase.functions.invoke("extract-video", {
          body: { tmdb_id: tmdbId, imdb_id: imdbId, type, season, episode },
        });

        if (error) throw error;

        if (data?.success && data.sources?.length > 0) {
          console.log(`Extraction found ${data.sources.length} sources`);
          setSources(data.sources);
          setPhase("playing-custom");
          return;
        }

        console.log("No sources found, falling back to embed");
        setExtractionStatus("Extração falhou, carregando player alternativo...");
        
        // Auto-select provider based on audio
        if (selectedAudio === "dublado") {
          const ptIdx = EMBED_PROVIDERS.findIndex(p => p.lang === "pt" && !p.externalOnly);
          if (ptIdx >= 0) setCurrentProviderIdx(ptIdx);
        }
        
        setTimeout(() => setPhase("playing-embed"), 1000);
      } catch (err) {
        console.error("Extraction error:", err);
        setExtractionStatus("Carregando player alternativo...");
        setTimeout(() => setPhase("playing-embed"), 800);
      }
    };

    extract();
  }, [phase, tmdbId, imdbId, type, season, episode, selectedAudio]);

  // Auto-start extraction if no audio selection needed
  useEffect(() => {
    if (audioTypes.length <= 1 && phase === "audio-select") {
      setPhase("extracting");
    }
  }, []);

  // Escape key + block popups
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    const origOpen = window.open;
    window.open = (() => null) as typeof window.open;
    return () => {
      window.removeEventListener("keydown", handler);
      window.open = origOpen;
    };
  }, [onClose]);

  const handleAudioSelect = (audioKey: string) => {
    setSelectedAudio(audioKey);
    extractionAttempted.current = false;
    setPhase("extracting");
  };

  const provider = EMBED_PROVIDERS[currentProviderIdx];
  const rawUrl = provider.buildUrl(tmdbId, imdbId, type, season, episode);

  const selectProvider = useCallback((idx: number) => {
    setCurrentProviderIdx(idx);
    setIframeKey(k => k + 1);
    setShowProviders(false);
  }, []);

  const nextProvider = useCallback(() => {
    setCurrentProviderIdx(i => (i + 1) % EMBED_PROVIDERS.length);
    setIframeKey(k => k + 1);
  }, []);

  const openExternal = useCallback(() => {
    const orig = window.open;
    window.open = Window.prototype.open;
    window.open(rawUrl, "_blank", "noopener,noreferrer");
    window.open = orig;
  }, [rawUrl]);

  const retryExtraction = () => {
    extractionAttempted.current = false;
    setSources([]);
    setPhase("extracting");
  };

  // ============ AUDIO SELECT SCREEN ============
  if (phase === "audio-select") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
        <div className="relative w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
          <div className="glass-strong p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground mt-1">Escolha o tipo de áudio para assistir</p>
              </div>
              <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {AUDIO_OPTIONS.filter(opt => audioTypes.includes(opt.key)).map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleAudioSelect(opt.key)}
                    className={`w-full flex items-center gap-4 p-5 rounded-2xl border bg-gradient-to-r transition-all duration-300 hover:scale-[1.02] ${opt.gradient}`}
                  >
                    <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-7 h-7" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-base">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => { extractionAttempted.current = false; setPhase("extracting"); }}
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

  // ============ EXTRACTING SCREEN ============
  if (phase === "extracting") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
        <div className="relative w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
          <div className="glass-strong p-8 text-center">
            <div className="w-20 h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto mb-6" />
            <h2 className="font-display text-xl font-bold mb-2">{title}</h2>
            <p className="text-sm text-muted-foreground mb-1">{extractionStatus}</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ CUSTOM PLAYER (extracted sources) ============
  if (phase === "playing-custom" && sources.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
        <CustomPlayer
          sources={sources}
          title={title}
          subtitle={`${type === "tv" && season && episode ? `T${season} • E${episode} • ` : ""}${sources[0]?.provider || "Direto"} • ${selectedAudio === "dublado" ? "Dublado" : selectedAudio === "legendado" ? "Legendado" : selectedAudio.toUpperCase()}`}
          onClose={onClose}
          onError={() => {
            // All sources failed, fallback to embed
            console.log("All extracted sources failed, falling back to embed");
            setPhase("playing-embed");
          }}
        />
      </div>
    );
  }

  // ============ EMBED PLAYER (fallback) ============
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
      <div className="relative w-full max-w-6xl max-h-[95vh] glass-strong overflow-hidden animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Play className="w-3.5 h-3.5 text-primary fill-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold truncate">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {type === "tv" && season && episode && <span className="text-[10px] text-muted-foreground">T{season} • E{episode}</span>}
                <span className="text-[9px] px-1.5 py-0.5 rounded-md border font-semibold bg-white/5 text-muted-foreground border-white/10">
                  {provider.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            {/* Retry extraction */}
            <button onClick={retryExtraction} className="h-8 px-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-1.5 hover:bg-primary/20 transition-colors text-[11px] font-medium text-primary" title="Tentar extrair novamente">
              <Zap className="w-3 h-3" /> Extrair
            </button>
            
            {/* Provider selector */}
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
                        i === currentProviderIdx ? "bg-primary/15 text-primary" : "hover:bg-white/5"
                      }`}>
                      <span className="font-medium">{p.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${p.externalOnly ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-muted-foreground"}`}>
                        {p.externalOnly ? "Nova aba" : p.tag}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={nextProvider} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={openExternal} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          {provider.externalOnly ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center p-6 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <ExternalLink className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-bold mb-2">{provider.name}</h3>
                <p className="text-sm text-muted-foreground mb-5">Este provedor abre em nova aba.</p>
                <button onClick={openExternal} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all mx-auto">
                  <ExternalLink className="w-4 h-4" /> Abrir {provider.name}
                </button>
              </div>
            </div>
          ) : (
            <iframe
              key={iframeKey}
              src={rawUrl}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              style={{ border: 0 }}
              title={title}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;
