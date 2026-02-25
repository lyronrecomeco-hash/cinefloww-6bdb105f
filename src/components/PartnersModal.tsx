import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X, Handshake, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Partner {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
}

interface PartnersModalProps {
  onClose: () => void;
}

const PartnersModal = ({ onClose }: PartnersModalProps) => {
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    supabase.from("partners").select("id, name, description, website_url, logo_url")
      .eq("active", true).order("sort_order")
      .then(({ data }) => { if (data) setPartners(data); });
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg glass-strong p-6 sm:p-8 animate-page-enter space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-primary" />
            <h2 className="text-lg sm:text-xl font-bold font-display text-foreground">
              Parceiros
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Quer ser parceiro oficial do LyneFlix? Entre em contato com nossa equipe e saiba como integrar seu serviço ao nosso ecossistema.
        </p>

        <div className="glass p-4 space-y-3">
          <h3 className="text-sm font-semibold">Como ser parceiro?</h3>
          <ul className="text-muted-foreground text-xs leading-relaxed space-y-2">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">1</span>
              <span>Tenha um serviço ou plataforma relacionada a streaming, entretenimento ou tecnologia.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">2</span>
              <span>Entre em contato através do nosso e-mail ou redes sociais informando seu interesse.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">3</span>
              <span>Nossa equipe avaliará e retornará com os detalhes da parceria.</span>
            </li>
          </ul>
        </div>

        {partners.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parceiros atuais</h3>
            {partners.map(p => (
              <div key={p.id} className="glass p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {p.logo_url && (
                    <img src={p.logo_url} alt={p.name} className="h-8 object-contain" />
                  )}
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                </div>
                {p.description && (
                  <p className="text-muted-foreground text-xs leading-relaxed">{p.description}</p>
                )}
                {p.website_url && (
                  <a
                    href={p.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visitar site
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PartnersModal;
