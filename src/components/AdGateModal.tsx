import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, ExternalLink, Sparkles } from "lucide-react";

interface AdGateModalProps {
  onContinue: () => void;
  onClose: () => void;
  contentTitle?: string;
  tmdbId?: number;
}

const AdGateModal = ({ onContinue, onClose, contentTitle, tmdbId }: AdGateModalProps) => {
  const [smartlink, setSmartlink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "adsterra_smartlink")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const val = data.value as any;
          const url = typeof val === "string" ? val.replace(/^"|"$/g, '') : val.url || "";
          setSmartlink(url || null);
        }
        setLoading(false);
      });
  }, []);

  const handleAdClick = () => {
    if (!smartlink) return;
    // Open ad in new tab
    window.open(smartlink, "_blank", "noopener,noreferrer");
    setClicked(true);

    // Log click (non-blocking)
    const visitorId = localStorage.getItem("_cf_vid") || "unknown";
    supabase.from("ad_clicks").insert({
      visitor_id: visitorId,
      content_title: contentTitle || null,
      tmdb_id: tmdbId || null,
    }).then(() => {});

    // Very quick - let user continue almost instantly
    setTimeout(() => {
      onContinue();
    }, 800);
  };

  // If no smartlink configured, skip ad
  useEffect(() => {
    if (!loading && !smartlink) {
      onContinue();
    }
  }, [loading, smartlink]);

  if (loading || !smartlink) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div
        className="relative w-full max-w-sm bg-card/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 animate-scale-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cute icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
        </div>

        <h2 className="font-display text-lg sm:text-xl font-bold mb-2">
          Quase lá! 🎬
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-6">
          Para manter a <span className="text-primary font-semibold">LyneFlix</span> gratuita, 
          clique no botão abaixo para continuar. É rapidinho! 💜
        </p>

        {!clicked ? (
          <button
            onClick={handleAdClick}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ExternalLink className="w-4 h-4" />
            Continuar
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            <Play className="w-4 h-4 fill-current" />
            Liberando player...
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 mt-4">
          Você apoia o site ao visualizar nossos parceiros ✨
        </p>
      </div>
    </div>
  );
};

export default AdGateModal;
