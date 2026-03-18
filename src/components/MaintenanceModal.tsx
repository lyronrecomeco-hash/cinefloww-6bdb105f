import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Server, Database, RefreshCw, Shield, Clock } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const DEADLINE_DAYS = 7;

function useCountdown(startedAt: string | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!startedAt) return { days: DEADLINE_DAYS, hours: 0, minutes: 0, seconds: 0, progress: 0 };

    const start = new Date(startedAt).getTime();
    const end = start + DEADLINE_DAYS * 24 * 60 * 60 * 1000;
    const total = end - start;
    const remaining = Math.max(0, end - now);
    const elapsed = total - remaining;
    const progress = Math.min(100, (elapsed / total) * 100);

    const d = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const h = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((remaining % (1000 * 60)) / 1000);

    return { days: d, hours: h, minutes: m, seconds: s, progress };
  }, [startedAt, now]);
}

const MaintenanceModal = () => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("Estamos migrando para um novo servidor. Em breve tudo estará funcionando!");
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const countdown = useCountdown(startedAt);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      if (data?.value) {
        const val = data.value as any;
        setActive(!!val.enabled);
        if (val.message) setMessage(val.message);
        if (val.started_at) setStartedAt(val.started_at);
        else if (val.enabled && !startedAt) setStartedAt(new Date().toISOString());
      }
    };
    check();

    const channel = supabase
      .channel("maintenance-mode")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings", filter: "key=eq.maintenance_mode" }, () => {
        check();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Never block admin pages
  if (!active || window.location.pathname.startsWith("/admin")) return null;

  // Block all interactions — prevent scrolling
  if (typeof document !== "undefined") {
    document.body.style.overflow = "hidden";
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      onKeyDown={(e) => e.preventDefault()}
    >
      {/* Fundo desfocado opaco — bloqueia tudo */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />

      <div className="relative w-full max-w-lg glass-strong p-6 sm:p-8 animate-page-enter space-y-5 select-none">
        {/* Header */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Server className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold font-display text-foreground">
              Migração de Servidor
            </h2>
          </div>
        </div>

        {/* Logo */}
        <div className="flex justify-center">
          <LyneflixLogo size="lg" animate className="py-1" />
        </div>

        {/* Message */}
        <p className="text-muted-foreground text-sm leading-relaxed text-center whitespace-pre-wrap">
          {message}
        </p>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Progresso da migração
            </span>
            <span className="text-primary font-semibold">{countdown.progress.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000 ease-linear"
              style={{ width: `${countdown.progress}%` }}
            />
          </div>
        </div>

        {/* Countdown */}
        <div className="glass p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Prazo máximo estimado</span>
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {[
              { value: countdown.days, label: "Dias" },
              { value: countdown.hours, label: "Horas" },
              { value: countdown.minutes, label: "Min" },
              { value: countdown.seconds, label: "Seg" },
            ].map((unit) => (
              <div key={unit.label} className="flex flex-col items-center">
                <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl font-bold font-display text-foreground tabular-nums">
                    {pad(unit.value)}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">{unit.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status items */}
        <div className="glass p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">O que estamos fazendo?</h3>
          <ul className="text-muted-foreground text-xs leading-relaxed space-y-2.5">
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Server className="w-3 h-3" />
              </span>
              <span>Migrando toda a infraestrutura para um novo servidor de alta performance.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Database className="w-3 h-3" />
              </span>
              <span>Reconstruindo o catálogo completo com novas fontes de vídeo.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="w-3 h-3" />
              </span>
              <span>Otimizando segurança e velocidade para uma experiência superior.</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <p className="text-muted-foreground/60 text-[10px] sm:text-xs text-center">
          ⏳ A plataforma voltará automaticamente quando a migração estiver concluída.
        </p>
      </div>
    </div>,
    document.body
  );
};

export default MaintenanceModal;
