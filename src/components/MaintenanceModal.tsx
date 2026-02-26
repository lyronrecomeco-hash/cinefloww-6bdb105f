import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, Database, RefreshCw, Shield } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const MaintenanceModal = () => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("Estamos realizando melhorias na plataforma. Voltamos em breve!");

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

  if (!active) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

      <div className="relative w-full max-w-lg glass-strong p-6 sm:p-8 animate-page-enter space-y-6">
        {/* Header */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold font-display text-foreground">
              Manutenção em Andamento
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

        {/* Status cards */}
        <div className="glass p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">O que estamos fazendo?</h3>
          <ul className="text-muted-foreground text-xs leading-relaxed space-y-2.5">
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Database className="w-3 h-3" />
              </span>
              <span>Corrigindo e atualizando todos os dados do catálogo para garantir links funcionais.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <RefreshCw className="w-3 h-3" />
              </span>
              <span>Importando novos conteúdos e reconstruindo o cache de vídeos do zero.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="w-3 h-3" />
              </span>
              <span>Otimizando a infraestrutura para uma experiência mais rápida e estável.</span>
            </li>
          </ul>
        </div>

        {/* Footer note */}
        <p className="text-muted-foreground/60 text-[10px] sm:text-xs text-center">
          ⏳ Previsão: em breve. Agradecemos a paciência!
        </p>
      </div>
    </div>,
    document.body
  );
};

export default MaintenanceModal;
