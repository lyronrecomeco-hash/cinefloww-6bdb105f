import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { shouldAskPush, markPushAsked, requestPushPermission } from "@/lib/pushNotifications";
import LyneflixLogo from "@/components/LyneflixLogo";

const PushPrompt = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Delay prompt by 30 seconds for better UX
    const timer = setTimeout(() => {
      if (shouldAskPush()) setShow(true);
    }, 30000);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = async () => {
    markPushAsked();
    await requestPushPermission();
    setShow(false);
  };

  const handleDismiss = () => {
    markPushAsked();
    setShow(false);
  };

  if (!show) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-[9997] animate-in slide-in-from-bottom fade-in duration-300">
      <div className="glass-strong rounded-2xl border border-white/10 shadow-2xl p-4">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-display font-bold text-foreground">Ativar notificações?</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Receba avisos de novos filmes, séries e atualizações da LyneFlix!
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAccept}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Ativar
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-1.5 rounded-lg bg-white/5 text-muted-foreground text-xs font-medium hover:bg-white/10 transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PushPrompt;
