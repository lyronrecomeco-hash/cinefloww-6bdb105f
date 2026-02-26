import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Wrench } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const MaintenanceModal = () => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("Estamos realizando melhorias na plataforma. Voltamos em breve!");
  const [dismissed, setDismissed] = useState(false);

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

  if (!active || dismissed) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

      <div className="relative w-full max-w-md bg-card/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 space-y-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
            <Wrench className="w-8 h-8 text-primary" />
          </div>

          <LyneflixLogo size="lg" animate className="py-2" />

          <h2 className="text-xl font-display font-bold text-foreground">
            🔧 Em Manutenção
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {message}
          </p>

          <button
            onClick={() => setDismissed(true)}
            className="w-full px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            OK, entendi
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MaintenanceModal;
