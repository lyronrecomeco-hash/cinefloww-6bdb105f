import { useState, useEffect, useCallback, useRef } from "react";
import { X, Play, ExternalLink, RefreshCw, Mic, Subtitles, Video, Globe, Loader2, Zap, ChevronRight } from "lucide-react";
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

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
];

type Phase = "audio-select" | "extracting" | "custom" | "embed";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, audioTypes = [], onClose }: PlayerModalProps) => {
  const needsAudioSelect = audioTypes.length > 1;
  const [phase, setPhase] = useState<Phase>(needsAudioSelect ? "audio-select" : "extracting");
  const [selectedAudio, setSelectedAudio] = useState(audioTypes[0] || "legendado");
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [statusText, setStatusText] = useState("Extraindo vídeo...");
  const extractTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build vidsrc.cc URL
  const vidsrcUrl = (() => {
    const id = imdbId || String(tmdbId);
    return type === "movie"
      ? `https://vidsrc.cc/v2/embed/movie/${id}`
      : `https://vidsrc.cc/v2/embed/tv/${id}/${season ?? 1}/${episode ?? 1}`;
  })();

  // Build proxy URL
  const proxyUrl = `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(vidsrcUrl)}`;

  // Listen for intercepted video sources from proxy iframe
  useEffect(() => {
    if (phase !== "extracting") return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "__VIDEO_SOURCE__" && event.data.url) {
        const url = event.data.url as string;
        console.log(`[PlayerModal] Intercepted video: ${event.data.source} -> ${url}`);
        
        const isM3u8 = url.includes(".m3u8") || url.includes("/playlist") || url.includes("/master");
        const isMp4 = url.includes(".mp4");
        
        if (isM3u8 || isMp4) {
          setSources(prev => {
            // Avoid duplicates
            if (prev.find(s => s.url === url)) return prev;
            const newSource: VideoSource = {
              url,
              quality: "auto",
              provider: "VidSrc.cc",
              type: isM3u8 ? "m3u8" : "mp4",
            };
            const updated = [...prev, newSource];
            
            // Switch to custom player on first source found
            if (prev.length === 0) {
              clearTimeout(extractTimeoutRef.current);
              // Small delay to collect more sources
              setTimeout(() => setPhase("custom"), 500);
            }
            return updated;
          });
        }
      }
    };

    window.addEventListener("message", handler);

    // Timeout: if no source found in 20s, fallback to embed
    extractTimeoutRef.current = setTimeout(() => {
      setSources(prev => {
        if (prev.length === 0) {
          console.log("[PlayerModal] Extraction timeout, falling back to embed");
          setPhase("embed");
        }
        return prev;
      });
    }, 20000);

    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(extractTimeoutRef.current);
    };
  }, [phase]);

  // Auto-start extraction if no audio select needed
  useEffect(() => {
    if (!needsAudioSelect && phase === "audio-select") setPhase("extracting");
  }, []);

  // Escape + popup blocker
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.removeEventListener("keydown", h); window.open = orig; };
  }, [onClose]);

  const handleAudioSelect = (key: string) => {
    setSelectedAudio(key);
    setSources([]);
    setPhase("extracting");
  };

  const retryExtraction = () => {
    setSources([]);
    setStatusText("Extraindo vídeo...");
    setPhase("extracting");
  };

  const openExternal = () => {
    const orig = window.open;
    window.open = Window.prototype.open;
    window.open(vidsrcUrl, "_blank", "noopener,noreferrer");
    window.open = orig;
  };

  // ===== AUDIO SELECT =====
  if (phase === "audio-select") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
        <div className="relative w-full max-w-md glass-strong overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
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
              {AUDIO_OPTIONS.filter(o => audioTypes.includes(o.key)).map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleAudioSelect(opt.key)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl glass glass-hover transition-all duration-200"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                onClick={() => { setSources([]); setPhase("extracting"); }}
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

  // ===== EXTRACTING (hidden proxy iframe + loading UI) =====
  if (phase === "extracting") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
        <div className="relative w-full max-w-sm glass-strong overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
          <div className="p-8 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <h2 className="font-display text-lg font-bold mb-1">{title}</h2>
            <p className="text-sm text-muted-foreground">{statusText}</p>
            <p className="text-xs text-muted-foreground/60 mt-2">Interceptando fonte de vídeo...</p>
          </div>
        </div>

        {/* Hidden proxy iframe that loads vidsrc.cc through our proxy with interceptor */}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="fixed top-0 left-0 w-[1px] h-[1px] opacity-0 pointer-events-none"
          sandbox="allow-scripts allow-same-origin allow-forms"
          title="extractor"
        />
      </div>
    );
  }

  // ===== CUSTOM PLAYER (extracted sources — our own player, no ads) =====
  if (phase === "custom" && sources.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
        <CustomPlayer
          sources={sources}
          title={title}
          subtitle={type === "tv" && season && episode ? `T${season} • E${episode}` : undefined}
          onClose={onClose}
          onError={() => {
            console.log("[PlayerModal] Custom player error, falling back to embed");
            setPhase("embed");
          }}
        />
      </div>
    );
  }

  // ===== EMBED FALLBACK (vidsrc.cc iframe with ad protection) =====
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div className="relative w-full max-w-5xl max-h-[95vh] glass-strong overflow-hidden animate-scale-in flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Play className="w-3.5 h-3.5 text-primary fill-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold truncate">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {type === "tv" && season && episode && (
                  <span className="text-[10px] text-muted-foreground">T{season} • E{episode}</span>
                )}
                <span className="text-[9px] px-1.5 py-0.5 rounded-md border font-semibold bg-white/5 text-muted-foreground border-white/10">
                  VidSrc.cc
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            <button onClick={retryExtraction} className="h-8 px-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-1.5 hover:bg-primary/20 transition-colors text-[11px] font-medium text-primary" title="Tentar extrair vídeo direto">
              <Zap className="w-3 h-3" /> Extrair
            </button>
            <button onClick={openExternal} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors" title="Abrir em nova aba">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Iframe with ad protection */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <div className="absolute top-0 left-0 right-0 h-[3px] z-20 bg-card" />
          <div className="absolute bottom-0 left-0 right-0 h-[3px] z-20 bg-card" />
          <div className="absolute top-0 left-0 w-[3px] h-full z-20 bg-card" />
          <div className="absolute top-0 right-0 w-[3px] h-full z-20 bg-card" />

          <iframe
            src={vidsrcUrl}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            style={{ border: 0 }}
            title={title}
          />
        </div>

        {/* Bottom bar */}
        {audioTypes.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/10 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold whitespace-nowrap">Áudio:</span>
            {audioTypes.map(at => (
              <span key={at} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-muted-foreground font-medium capitalize whitespace-nowrap">
                {at}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerModal;
