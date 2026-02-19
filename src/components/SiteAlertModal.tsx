import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, ExternalLink } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

interface SiteAlert {
  id: string;
  title: string;
  message: string;
  button_text: string;
  button_link: string | null;
  button_style: string;
  interval_minutes: number;
  active: boolean;
}

const DISMISSED_KEY = "cineflow_alert_dismissed_";

const SiteAlertModal = () => {
  const [alerts, setAlerts] = useState<SiteAlert[]>([]);
  const [currentAlert, setCurrentAlert] = useState<SiteAlert | null>(null);
  const [visible, setVisible] = useState(false);

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("site_alerts")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (data) setAlerts(data as unknown as SiteAlert[]);
  }, []);

  useEffect(() => {
    fetchAlerts();
    const channel = supabase
      .channel("site-alerts-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_alerts" }, () => {
        fetchAlerts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  useEffect(() => {
    if (!alerts.length) return;
    const checkAlerts = () => {
      for (const alert of alerts) {
        if (!alert.active) continue;
        const key = DISMISSED_KEY + alert.id;
        const lastDismissed = localStorage.getItem(key);
        if (lastDismissed) {
          const elapsed = Date.now() - parseInt(lastDismissed, 10);
          const intervalMs = alert.interval_minutes * 60 * 1000;
          if (elapsed < intervalMs) continue;
        }
        setCurrentAlert(alert);
        setVisible(true);
        return;
      }
    };
    checkAlerts();
    const interval = setInterval(checkAlerts, 30000);
    return () => clearInterval(interval);
  }, [alerts]);

  const handleDismiss = () => {
    if (currentAlert) {
      localStorage.setItem(DISMISSED_KEY + currentAlert.id, Date.now().toString());
    }
    setVisible(false);
    setCurrentAlert(null);
  };

  const handleButtonClick = () => {
    if (currentAlert?.button_link) {
      window.open(currentAlert.button_link, "_blank", "noopener,noreferrer");
    }
    handleDismiss();
  };

  if (!visible || !currentAlert) return null;

  const isPrimary = currentAlert.button_style === "primary";
  const isDestructive = currentAlert.button_style === "destructive";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground pr-8">
            {currentAlert.title}
          </h2>

          {/* LYNEFLIX Logo */}
          <LyneflixLogo size="lg" animate className="py-3" />

          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {currentAlert.message}
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleButtonClick}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isDestructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : isPrimary
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-white/10 text-foreground hover:bg-white/15 border border-white/10"
              }`}
            >
              {currentAlert.button_link && <ExternalLink className="w-4 h-4" />}
              {currentAlert.button_text}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteAlertModal;
