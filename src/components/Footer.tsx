import { forwardRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import LyneflixLogo from "@/components/LyneflixLogo";
import DnsHelpModal from "@/components/DnsHelpModal";
import PartnersModal from "@/components/PartnersModal";
import { WifiOff, Handshake, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CURRENT_VERSION = "V-518";
const LOCAL_KEY = "lyneflix_cache_version";

const Footer = forwardRef<HTMLElement>((_, ref) => {
  const [showDnsHelp, setShowDnsHelp] = useState(false);
  const [showPartners, setShowPartners] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkVersion = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "cache_version")
        .maybeSingle();

      if (!data?.value) {
        setChecking(false);
        return;
      }

      const remoteVersion = String(
        typeof data.value === "object" && data.value !== null && "v" in (data.value as Record<string, unknown>)
          ? (data.value as Record<string, string>).v
          : data.value
      );

      const localNum = CURRENT_VERSION.replace("V-", "");
      if (remoteVersion === localNum) {
        // Already up to date — brief flash green
        const el = document.getElementById("lyneflix-version");
        if (el) { el.style.color = "#22c55e"; setTimeout(() => { el.style.color = ""; }, 1500); }
      } else {
        // Outdated — force full cache clear + reload
        console.log(`[VersionCheck] ${localNum} → ${remoteVersion} — atualizando…`);
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        localStorage.setItem(LOCAL_KEY, remoteVersion);
        window.location.reload();
        return;
      }
    } catch {
      // silently fail
    }
    setChecking(false);
  }, [checking]);

  return (
    <footer ref={ref} className="border-t border-white/5 py-8 sm:py-10 px-4 sm:px-6 lg:px-12 pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-5 text-center">
        <LyneflixLogo size="sm" animate={false} />
        
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl leading-relaxed">
          AVISO LEGAL: Nós não armazenamos nenhum dos arquivos em nenhum servidor. Todos os conteúdos são fornecidos por terceiros sem qualquer tipo de filiação.
        </p>

        <div className="flex items-center gap-4 sm:gap-6 flex-wrap justify-center">
          <Link to="/dmca" className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors">
            Política DMCA
          </Link>
          <span className="text-white/10">|</span>
          <Link to="/termos" className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors">
            Termos e Condições
          </Link>
          <span className="text-white/10">|</span>
          <button
            onClick={() => setShowPartners(true)}
            className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors flex items-center gap-1"
          >
            <Handshake className="w-3 h-3" />
            Parceiros
          </button>
          <span className="text-white/10">|</span>
          <button
            onClick={() => setShowDnsHelp(true)}
            className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors flex items-center gap-1"
          >
            <WifiOff className="w-3 h-3" />
            Não consigo acessar
          </button>
        </div>

        <p className="text-muted-foreground/60 text-[10px] sm:text-xs">
          © 2026 LyneFlix. Todos os direitos reservados.
        </p>

        <button
          id="lyneflix-version"
          onClick={checkVersion}
          disabled={checking}
          className="text-muted-foreground/50 hover:text-primary/70 text-[11px] sm:text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 py-1 px-3 rounded-full border border-white/5 hover:border-white/10"
          title="Clique para verificar atualizações"
        >
          {CURRENT_VERSION}
          {checking && <RefreshCw className="w-3 h-3 animate-spin" />}
        </button>
      </div>

      {showDnsHelp && (
        <DnsHelpModal forceOpen onClose={() => setShowDnsHelp(false)} />
      )}
      {showPartners && (
        <PartnersModal onClose={() => setShowPartners(false)} />
      )}
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
