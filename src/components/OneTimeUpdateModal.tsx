import { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lyneflix_onetime_update_v1";

const OneTimeUpdateModal = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadySeen = localStorage.getItem(STORAGE_KEY);
    if (alreadySeen) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        setVisible(true);
      }
    });
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  };

  const handleUpdate = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4 text-center">
          <LyneflixLogo size="lg" animate className="py-2" />

          <h2 className="text-lg font-display font-bold text-foreground">
            🔄 Atualização Disponível!
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed">
            A LyneFlix foi atualizada com melhorias importantes!{"\n\n"}
            Clique no botão abaixo para carregar a versão mais recente e aproveitar todas as novidades.
          </p>

          <button
            onClick={handleUpdate}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar agora
          </button>
        </div>
      </div>
    </div>
  );
};

export default OneTimeUpdateModal;
