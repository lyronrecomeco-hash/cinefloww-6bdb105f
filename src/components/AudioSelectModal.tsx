import { useState, useEffect } from "react";
import { X, Mic, Subtitles, Video, Globe, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AudioSelectModalProps {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  subtitle?: string;
  onSelect: (audio: string) => void;
  onClose: () => void;
}

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
];

const AudioSelectModal = ({ tmdbId, type, title, subtitle, onSelect, onClose }: AudioSelectModalProps) => {
  const [availableAudios, setAvailableAudios] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cType = type === "movie" ? "movie" : "series";
    // Check REAL availability from video_cache
    supabase
      .from("video_cache")
      .select("audio_type")
      .eq("tmdb_id", tmdbId)
      .eq("content_type", cType)
      .gt("expires_at", new Date().toISOString())
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAvailableAudios(new Set(data.map(d => d.audio_type)));
        }
        setLoading(false);
      });
  }, [tmdbId, type]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
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
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {AUDIO_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const isAvailable = availableAudios.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { if (!isAvailable) return; localStorage.setItem("cineflow_audio_pref", opt.key); onSelect(opt.key); }}
                      disabled={!isAvailable}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 group ${
                        isAvailable
                          ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.08] hover:border-primary/30 cursor-pointer"
                          : "bg-white/[0.01] border-white/5 opacity-40 cursor-not-allowed"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isAvailable ? "bg-primary/15 group-hover:bg-primary/25" : "bg-white/5"
                      }`}>
                        <Icon className={`w-6 h-6 ${isAvailable ? "text-primary" : "text-muted-foreground/50"}`} />
                      </div>
                      <div className="text-left flex-1">
                        <p className={`font-semibold text-sm ${isAvailable ? "text-foreground" : "text-muted-foreground/50"}`}>{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isAvailable ? opt.description : "Indisponível no momento"}
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

            <div className="mt-5 pt-5 border-t border-white/10">
              <button
                onClick={() => { localStorage.setItem("cineflow_audio_pref", "legendado"); onSelect("legendado"); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
              >
                <Globe className="w-4 h-4" /> Pular e assistir legendado
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioSelectModal;
