import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Shield, Wifi, WifiOff, Smartphone, ExternalLink } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const STORAGE_KEY = "lyneflix_dns_help_dismissed";
const CHECK_INTERVAL_HOURS = 72;

interface DnsHelpModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

const DnsHelpModal = ({ forceOpen = false, onClose }: DnsHelpModalProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setVisible(true);
      return;
    }

    const last = localStorage.getItem(STORAGE_KEY);
    if (last) {
      const elapsed = Date.now() - parseInt(last, 10);
      if (elapsed < CHECK_INTERVAL_HOURS * 3600000) return;
    }

    // Only show automatically if the user seems to be having connectivity issues
    // We don't auto-show this modal; it's triggered from settings/footer
  }, [forceOpen]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
    onClose?.();
  };

  if (!visible) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const storeUrl = isIOS
    ? "https://apps.apple.com/app/1-1-1-1-faster-internet/id1423538627"
    : "https://play.google.com/store/apps/details?id=com.cloudflare.onedotonedotonedotone";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <WifiOff className="w-5 h-5 text-orange-400" />
            </div>
            <h2 className="text-lg font-display font-bold text-foreground pr-8">
              Não consegue acessar?
            </h2>
          </div>

          <LyneflixLogo size="md" animate className="py-2" />

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <Shield className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Por que isso acontece?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Algumas operadoras de internet (Vivo, Claro, TIM, Oi) podem bloquear o acesso a determinados sites. Isso <strong>não</strong> é um problema do site — é um bloqueio na rede da sua operadora.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <Wifi className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Solução rápida e gratuita</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Basta instalar o app <strong>1.1.1.1</strong> da Cloudflare no seu celular. Ele troca o DNS da sua internet automaticamente e desbloqueia o acesso.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <Smartphone className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Como usar</p>
                <ol className="text-xs text-muted-foreground mt-1 space-y-1 list-decimal list-inside">
                  <li>Baixe o app <strong>1.1.1.1</strong> (link abaixo)</li>
                  <li>Abra o app e toque no botão grande para <strong>conectar</strong></li>
                  <li>Pronto! Volte aqui e acesse normalmente 🎉</li>
                </ol>
              </div>
            </div>
          </div>

          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold bg-[#f48120] hover:bg-[#e0741a] text-white transition-colors"
          >
            <img
              src="https://1.1.1.1/media/warp-desktop-hero.png"
              alt="1.1.1.1"
              className="w-6 h-6 rounded object-contain bg-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            Baixar 1.1.1.1 {isIOS ? "(App Store)" : "(Play Store)"}
            <ExternalLink className="w-4 h-4" />
          </a>

          <p className="text-[11px] text-center text-muted-foreground">
            O 1.1.1.1 é um app gratuito e seguro da Cloudflare. Não é VPN — apenas melhora e desbloqueia sua conexão.
          </p>

          <button
            onClick={dismiss}
            className="w-full flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DnsHelpModal;
