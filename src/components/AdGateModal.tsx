import { useState, useEffect, useRef, useCallback, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, ExternalLink, Sparkles, Lock, ShieldCheck } from "lucide-react";

interface AdConfig {
  movie_ads: number;
  series_ads: number;
  lynetv_ads: number;
  enabled: boolean;
}

interface AdGateModalProps {
  onContinue: () => void;
  onClose: () => void;
  contentTitle?: string;
  tmdbId?: number;
  contentType?: "movie" | "tv" | "series";
}

const AdGateModal = forwardRef<HTMLDivElement, AdGateModalProps>(({ onContinue, onClose, contentTitle, tmdbId, contentType = "movie" }, ref) => {
  const [smartlink, setSmartlink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clickCount, setClickCount] = useState(0);
  const [requiredAds, setRequiredAds] = useState(1);
  const [isReturningFromAd, setIsReturningFromAd] = useState(false);
  const antiBypassRef = useRef<string>("");
  const mountedRef = useRef(true);
  const clickCountRef = useRef(0);
  const requiredAdsRef = useRef(1);
  const adClickPendingRef = useRef(false);
  const adOpenedAtRef = useRef<number | null>(null);

  const pendingKey = `ad_pending_${contentType}_${tmdbId}`;
  const pendingAtKey = `ad_pending_at_${contentType}_${tmdbId}`;

  // Generate anti-bypass token
  useEffect(() => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    antiBypassRef.current = token;
    const gateKey = `ad_gate_${contentType}_${tmdbId}`;
    sessionStorage.setItem(gateKey, token);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("site_settings").select("value").eq("key", "adsterra_smartlink").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "ad_config").maybeSingle(),
    ]).then(([{ data: linkData }, { data: configData }]) => {
      if (!mountedRef.current) return;
      if (linkData?.value) {
        const val = linkData.value as any;
        const url = typeof val === "string" ? val.replace(/^"|"$/g, '') : val.url || "";
        setSmartlink(url || null);
      }
      if (configData?.value) {
        const cfg = (configData.value ?? {}) as unknown as Partial<AdConfig>;
        const isSeries = contentType === "tv" || contentType === "series";
        const isLyneTV = contentTitle === "LyneTV";
        const req = isLyneTV ? (cfg.lynetv_ads || 1) : isSeries ? (cfg.series_ads || 2) : (cfg.movie_ads || 1);
        setRequiredAds(req);
        requiredAdsRef.current = req;
        if (cfg.enabled === false) {
          onContinue();
          return;
        }
      }
      setLoading(false);
    });
  }, []);

  const registerAdReturn = useCallback(() => {
    if (!adClickPendingRef.current) return;

    const openedAt = adOpenedAtRef.current ?? Number(sessionStorage.getItem(pendingAtKey) || 0);
    const elapsed = openedAt ? Date.now() - openedAt : 0;
    if (elapsed < 1000) return;

    adClickPendingRef.current = false;
    adOpenedAtRef.current = null;
    sessionStorage.removeItem(pendingKey);
    sessionStorage.removeItem(pendingAtKey);
    setIsReturningFromAd(false);

    const newCount = clickCountRef.current + 1;
    clickCountRef.current = newCount;
    setClickCount(newCount);

    const visitorId = localStorage.getItem("_cf_vid") || "unknown";
    supabase.from("ad_clicks").insert({
      visitor_id: visitorId,
      content_title: contentTitle || null,
      tmdb_id: tmdbId || null,
    }).then(() => {});

    if (newCount >= requiredAdsRef.current) {
      const completedKey = `ad_completed_${contentType}_${tmdbId}`;
      sessionStorage.setItem(completedKey, String(Date.now()));
      const gateKey = `ad_gate_${contentType}_${tmdbId}`;
      sessionStorage.removeItem(gateKey);

      setTimeout(() => {
        if (mountedRef.current) onContinue();
      }, 450);
    }
  }, [contentTitle, tmdbId, contentType, onContinue, pendingAtKey, pendingKey]);

  const handleAdClick = useCallback(() => {
    if (!smartlink) return;

    const gateKey = `ad_gate_${contentType}_${tmdbId}`;
    const storedToken = sessionStorage.getItem(gateKey);
    if (storedToken !== antiBypassRef.current) return;

    const openedAt = Date.now();
    adClickPendingRef.current = true;
    adOpenedAtRef.current = openedAt;
    sessionStorage.setItem(pendingKey, "1");
    sessionStorage.setItem(pendingAtKey, String(openedAt));
    setIsReturningFromAd(true);

    const adWindow = window.open(smartlink, "_blank", "noopener,noreferrer");

    if (!adWindow) {
      const a = document.createElement("a");
      a.href = smartlink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [smartlink, contentType, tmdbId, pendingKey, pendingAtKey]);

  useEffect(() => {
    const hasPending = sessionStorage.getItem(pendingKey) === "1";
    if (hasPending) {
      adClickPendingRef.current = true;
      adOpenedAtRef.current = Number(sessionStorage.getItem(pendingAtKey) || Date.now());
      setIsReturningFromAd(true);
    }

    const tryComplete = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      window.setTimeout(() => {
        if (mountedRef.current) registerAdReturn();
      }, 450);
    };

    document.addEventListener("visibilitychange", tryComplete);
    window.addEventListener("focus", tryComplete);
    window.addEventListener("pageshow", tryComplete);

    return () => {
      document.removeEventListener("visibilitychange", tryComplete);
      window.removeEventListener("focus", tryComplete);
      window.removeEventListener("pageshow", tryComplete);
    };
  }, [registerAdReturn, pendingKey, pendingAtKey]);


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
        ref={ref}
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
          {completed ? "Liberado! 🎉" : contentTitle === "LyneTV" ? "Quase lá! 📺" : "Quase lá! 🎬"}
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-3">
          {completed ? (
            contentTitle === "LyneTV" ? "Acesso liberado! Conectando ao canal..." : "Acesso liberado! Preparando player..."
          ) : contentTitle === "LyneTV" ? (
            <>
              Para manter a <span className="text-primary font-semibold">TV LYNE</span> gratuita, abra o anúncio e volte para assistir ao vivo.
              {requiredAds > 1 ? ` Repita ${requiredAds} vezes.` : " É só 1 clique."}
            </>
          ) : (
            <>
              Para manter a <span className="text-primary font-semibold">LyneFlix</span> gratuita, abra o anúncio e volte para continuar.
              {requiredAds > 1 ? ` Repita ${requiredAds} vezes.` : " É só 1 clique."}
            </>
          )}
        </p>

        {!completed && (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-left">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[11px] sm:text-xs text-foreground/90 leading-relaxed">
                <span className="font-semibold">É seguro:</span> não é vírus. O botão abre apenas o parceiro.
                <br />
                <span className="font-semibold">Como fazer:</span> toque em <span className="text-primary font-semibold">Abrir anúncio</span> e depois volte para este app.
              </p>
            </div>
          </div>
        )}

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
            <div className="w-full h-1.5 bg-white/5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {!completed ? (
          <div className="space-y-2">
            <button
              onClick={handleAdClick}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir anúncio
            </button>

            {isReturningFromAd && (
              <button
                onClick={registerAdReturn}
                className="w-full py-3 rounded-2xl bg-secondary text-secondary-foreground text-sm font-medium border border-border hover:bg-secondary/90 transition-colors"
              >
                Já cliquei no anúncio e voltei
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium">
            <Play className="w-4 h-4 fill-current" />
            Liberando player...
          </div>
        )}

        {/* Anti-bypass notice */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <Lock className="w-3 h-3 text-muted-foreground/40" />
          <p className="text-[10px] text-muted-foreground/60">
            {contentTitle === "LyneTV"
              ? "Ao concluir, todos os canais ficam liberados nesta sessão"
              : isSeries
                ? "Ao concluir, todos episódios da série ficam liberados nesta sessão"
                : "Você apoia o site ao visualizar nossos parceiros"} ✨
          </p>
        </div>
      </div>
    </div>
  );
});

AdGateModal.displayName = "AdGateModal";

export default AdGateModal;
