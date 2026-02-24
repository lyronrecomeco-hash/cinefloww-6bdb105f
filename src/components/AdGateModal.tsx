import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, ExternalLink, Sparkles, Lock } from "lucide-react";

interface AdConfig {
  movie_ads: number;
  series_ads: number;
  enabled: boolean;
}

interface AdGateModalProps {
  onContinue: () => void;
  onClose: () => void;
  contentTitle?: string;
  tmdbId?: number;
  contentType?: "movie" | "tv" | "series";
}

const AdGateModal = ({ onContinue, onClose, contentTitle, tmdbId, contentType = "movie" }: AdGateModalProps) => {
  const [smartlink, setSmartlink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clickCount, setClickCount] = useState(0);
  const [requiredAds, setRequiredAds] = useState(1);
  const [adConfig, setAdConfig] = useState<AdConfig | null>(null);
  const antiBypassRef = useRef<string>("");

  // Generate anti-bypass token
  useEffect(() => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    antiBypassRef.current = token;
    // Store in sessionStorage to prevent page refresh bypass
    const gateKey = `ad_gate_${contentType}_${tmdbId}`;
    sessionStorage.setItem(gateKey, token);
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("site_settings").select("value").eq("key", "adsterra_smartlink").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "ad_config").maybeSingle(),
    ]).then(([{ data: linkData }, { data: configData }]) => {
      if (linkData?.value) {
        const val = linkData.value as any;
        const url = typeof val === "string" ? val.replace(/^"|"$/g, '') : val.url || "";
        setSmartlink(url || null);
      }
      if (configData?.value) {
        const cfg = configData.value as any;
        setAdConfig(cfg);
        const isSeries = contentType === "tv" || contentType === "series";
        setRequiredAds(isSeries ? (cfg.series_ads || 2) : (cfg.movie_ads || 1));
        // Check if ads are disabled
        if (cfg.enabled === false) {
          onContinue();
          return;
        }
      }
      setLoading(false);
    });
  }, []);

  const handleAdClick = () => {
    if (!smartlink) return;

    // Validate anti-bypass
    const gateKey = `ad_gate_${contentType}_${tmdbId}`;
    const storedToken = sessionStorage.getItem(gateKey);
    if (storedToken !== antiBypassRef.current) return;

    // Open ad in new tab
    window.open(smartlink, "_blank", "noopener,noreferrer");
    
    const newCount = clickCount + 1;
    setClickCount(newCount);

    // Log click (non-blocking)
    const visitorId = localStorage.getItem("_cf_vid") || "unknown";
    supabase.from("ad_clicks").insert({
      visitor_id: visitorId,
      content_title: contentTitle || null,
      tmdb_id: tmdbId || null,
    }).then(() => {});

    // Check if all required ads completed
    if (newCount >= requiredAds) {
      // Mark as completed in session to prevent re-showing
      const completedKey = `ad_completed_${contentType}_${tmdbId}`;
      sessionStorage.setItem(completedKey, String(Date.now()));
      sessionStorage.removeItem(gateKey);
      
      setTimeout(() => {
        onContinue();
      }, 600);
    }
  };

  // If no smartlink configured or ads disabled, skip
  useEffect(() => {
    if (!loading && !smartlink) {
      onContinue();
    }
  }, [loading, smartlink]);

  if (loading || !smartlink) return null;

  const completed = clickCount >= requiredAds;
  const isSeries = contentType === "tv" || contentType === "series";
  const progressPct = Math.min(100, (clickCount / requiredAds) * 100);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div
        className="relative w-full max-w-sm bg-card/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 animate-scale-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          {completed ? (
            <Play className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
          ) : (
            <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
          )}
        </div>

        <h2 className="font-display text-lg sm:text-xl font-bold mb-2">
          {completed ? "Liberado! 🎉" : "Quase lá! 🎬"}
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-4">
          {completed ? (
            "Acesso liberado! Preparando player..."
          ) : (
            <>
              Para manter a <span className="text-primary font-semibold">LyneFlix</span> gratuita,{" "}
              {requiredAds > 1
                ? `clique ${requiredAds} vezes no botão abaixo.`
                : "clique no botão abaixo para continuar."
              }
              {" "}É rapidinho! 💜
            </>
          )}
        </p>

        {/* Progress indicator for multiple ads */}
        {requiredAds > 1 && !completed && (
          <div className="mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              {Array.from({ length: requiredAds }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-all ${
                    i < clickCount
                      ? "bg-primary border-primary scale-110"
                      : "bg-transparent border-white/20"
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {clickCount}/{requiredAds} concluído{requiredAds > 1 ? "s" : ""}
            </p>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {!completed ? (
          <button
            onClick={handleAdClick}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <ExternalLink className="w-4 h-4" />
            {clickCount > 0 ? `Continuar (${clickCount}/${requiredAds})` : "Continuar"}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            <Play className="w-4 h-4 fill-current" />
            Liberando player...
          </div>
        )}

        {/* Anti-bypass notice */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <Lock className="w-3 h-3 text-muted-foreground/40" />
          <p className="text-[10px] text-muted-foreground/50">
            {isSeries ? "Libera todos os episódios da sessão" : "Você apoia o site ao visualizar nossos parceiros"} ✨
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdGateModal;
