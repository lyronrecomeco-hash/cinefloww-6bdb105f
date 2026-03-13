import { useEffect, useState } from "react";
import { X, Mic, Subtitles, Globe, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AudioSelectModalProps {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  subtitle?: string;
  season?: number;
  episode?: number;
  onSelect: (audio: string) => void;
  onClose: () => void;
}

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
];

const AudioSelectModal = ({ tmdbId, type, title, subtitle, season, episode, onSelect, onClose }: AudioSelectModalProps) => {
  const [availableAudios, setAvailableAudios] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Check real audio availability from backend
  useEffect(() => {
    let cancelled = false;

    const checkAvailability = async () => {
      setLoading(true);

      try {
        // 1. Check content table for audio_type array
        const contentType = type === "movie" ? "movie" : "series";
        const { data: contentData } = await supabase
          .from("content")
          .select("audio_type")
          .eq("tmdb_id", tmdbId)
          .eq("content_type", contentType)
          .maybeSingle();

        if (cancelled) return;

        if (contentData?.audio_type && Array.isArray(contentData.audio_type) && contentData.audio_type.length > 0) {
          setAvailableAudios(new Set(contentData.audio_type));
          setLoading(false);
          return;
        }

        // 2. Check video_cache_safe for cached audio types (episode-aware when provided)
        let cacheQuery = supabase
          .from("video_cache_safe" as any)
          .select("audio_type, season, episode")
          .eq("tmdb_id", tmdbId)
          .eq("content_type", contentType);

        if (type === "tv" && season != null && episode != null) {
          cacheQuery = cacheQuery.eq("season", season).eq("episode", episode);
        }

        const { data: cacheData } = await cacheQuery;

        if (cancelled) return;

        if (cacheData && cacheData.length > 0) {
          const types = new Set<string>();
          cacheData.forEach((row: any) => {
            if (row.audio_type) types.add(row.audio_type);
          });
          if (types.size > 0) {
            setAvailableAudios(types);
            setLoading(false);
            return;
          }
        }

        // 3. Fallback: show both as available (real check at playback)
        setAvailableAudios(new Set(["dublado", "legendado"]));
      } catch {
        // On error, show both
        setAvailableAudios(new Set(["dublado", "legendado"]));
      }

      if (!cancelled) setLoading(false);
    };

    checkAvailability();
    return () => { cancelled = true; };
  }, [tmdbId, type]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div className="relative w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-card/50 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
                {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
                <p className="text-sm text-muted-foreground mt-2">Escolha o tipo de áudio</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Verificando disponibilidade...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {AUDIO_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isAvailable = availableAudios.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (!isAvailable) return;
                        localStorage.setItem("cineflow_audio_pref", opt.key);
                        onSelect(opt.key);
                      }}
                      disabled={!isAvailable}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 group ${
                        isAvailable
                          ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.08] hover:border-primary/30 cursor-pointer"
                          : "bg-white/[0.01] border-white/5 opacity-30 cursor-not-allowed"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isAvailable ? "bg-primary/15 group-hover:bg-primary/25" : "bg-white/5"
                      }`}>
                        <Icon className={`w-6 h-6 ${isAvailable ? "text-primary" : "text-muted-foreground/50"}`} />
                      </div>
                      <div className="text-left flex-1">
                        <p className={`font-semibold text-sm ${isAvailable ? "text-foreground" : "text-muted-foreground/50"}`}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isAvailable ? opt.description : "Indisponível — sem fonte indexada"}
                        </p>
                      </div>
                      {isAvailable ? (
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && availableAudios.size === 0 && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-xs text-amber-400">Nenhuma fonte disponível no momento. Tente novamente mais tarde.</p>
              </div>
            )}

            {!loading && availableAudios.size > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                <p className="text-xs text-muted-foreground">
                  ⏳ Alguns filmes/séries podem demorar um pouco mais pra reproduzir, agradecemos a paciência.
                </p>
              </div>
            )}

            {!loading && availableAudios.size > 1 && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <button
                  onClick={() => {
                    const first = AUDIO_OPTIONS.find(o => availableAudios.has(o.key));
                    if (first) {
                      localStorage.setItem("cineflow_audio_pref", first.key);
                      onSelect(first.key);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  <Globe className="w-4 h-4" /> Assistir qualquer disponível
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioSelectModal;
