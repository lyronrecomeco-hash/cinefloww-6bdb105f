import { useState, useEffect, useCallback } from "react";
import { X, Play, ChevronRight, Loader2 } from "lucide-react";
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

// Embed providers (MegaEmbed first - loads directly, no proxy needed)
function buildEmbedUrls(tmdbId: number, imdbId: string | null, type: string, season?: number, episode?: number): string[] {
  const isMovie = type === "movie";
  const s = season ?? 1;
  const e = episode ?? 1;
  const id = imdbId || String(tmdbId);

  return [
    isMovie ? `https://megaembed.com/embed/${tmdbId}` : `https://megaembed.com/embed/${tmdbId}/${s}/${e}`,
    isMovie ? `https://embed.su/embed/movie/${tmdbId}/1/1` : `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`,
    isMovie ? `https://vidlink.pro/movie/${tmdbId}?autoplay=true` : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true`,
    isMovie ? `https://autoembed.co/movie/tmdb/${tmdbId}` : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`,
    `https://vembed.stream/play/${id}`,
  ];
}

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, audioTypes = [], onClose }: PlayerModalProps) => {
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [phase, setPhase] = useState<"loading" | "custom" | "embed">("loading");
  const [currentProviderIdx, setCurrentProviderIdx] = useState(0);

  const embedUrls = buildEmbedUrls(tmdbId, imdbId || null, type, season, episode);
  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  // Try extraction, then fallback to embed
  const tryExtraction = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: tmdbId,
          imdb_id: imdbId,
          content_type: type === "movie" ? "movie" : "series",
          audio_type: audioTypes[0] || "legendado",
          season,
          episode,
        },
      });

      if (!fnError && data?.url) {
        console.log(`[PlayerModal] Direct URL found: ${data.url}`);
        setSources([{
          url: data.url,
          quality: "auto",
          provider: data.provider || "extract",
          type: data.type === "mp4" ? "mp4" : "m3u8",
        }]);
        setPhase("custom");
        return;
      }
    } catch {
      // Silent fail
    }

    // No direct URL - use embed iframe (MegaEmbed first, loaded directly)
    console.log("[PlayerModal] No direct URL, using embed fallback");
    setPhase("embed");
  }, [tmdbId, imdbId, type, season, episode, audioTypes]);

  useEffect(() => {
    tryExtraction();
  }, [tryExtraction]);

  // Escape handler + popup blocker
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.removeEventListener("keydown", h); window.open = orig; };
  }, [onClose]);

  const tryNextProvider = () => {
    if (currentProviderIdx < embedUrls.length - 1) {
      setCurrentProviderIdx(prev => prev + 1);
    }
  };

  // ===== LOADING =====
  if (phase === "loading") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
        <div className="relative w-full max-w-sm glass-strong overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
          <div className="p-8 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <h2 className="font-display text-lg font-bold mb-1">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            <p className="text-sm text-muted-foreground mt-2">Carregando player...</p>
          </div>
        </div>
      </div>
    );
  }

  // ===== CUSTOM PLAYER (direct stream in our player) =====
  if (phase === "custom" && sources.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
        <CustomPlayer
          sources={sources}
          title={title}
          subtitle={subtitle}
          onClose={onClose}
          onError={() => {
            console.log("[PlayerModal] Player error, switching to embed");
            setPhase("embed");
          }}
        />
      </div>
    );
  }

  // ===== EMBED FALLBACK (MegaEmbed loaded DIRECTLY - no proxy, avoids Cloudflare) =====
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
              {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            {currentProviderIdx < embedUrls.length - 1 && (
              <button
                onClick={tryNextProvider}
                className="h-8 px-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 hover:bg-white/10 transition-colors text-[11px] font-medium text-muted-foreground"
              >
                <ChevronRight className="w-3 h-3" /> Trocar servidor
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Iframe - loaded DIRECTLY (not proxied) to avoid Cloudflare blocks */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={embedUrls[currentProviderIdx]}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            style={{ border: 0 }}
            title={title}
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerModal;
