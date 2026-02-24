import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import cineveoLogo from "@/assets/cineveo-logo.png";

interface CineVeoModalProps {
  onClose: () => void;
}

const CineVeoModal = ({ onClose }: CineVeoModalProps) => {
  const [partner, setPartner] = useState<{
    name: string;
    description: string | null;
    website_url: string | null;
    logo_url: string | null;
  } | null>(null);

  useEffect(() => {
    supabase.from("partners").select("name, description, website_url, logo_url")
      .eq("active", true).order("sort_order").limit(1)
      .then(({ data }) => {
        if (data?.[0]) setPartner(data[0]);
      });
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md glass-strong p-6 sm:p-8 animate-page-enter space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex justify-center pt-2">
          <img
            src={cineveoLogo}
            alt={partner?.name || "CineVeo"}
            className="h-10 sm:h-12 object-contain"
          />
        </div>

        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            Parceiro Oficial
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {partner?.description || "Fornece infraestrutura e fontes de conteúdo para o LyneFlix, garantindo qualidade e variedade no catálogo."}
          </p>
        </div>

        {partner?.website_url && (
          <a
            href={partner.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-4 h-4" />
            Visitar {partner.name || "CineVeo"}
          </a>
        )}
      </div>
    </div>,
    document.body
  );
};

export default CineVeoModal;
