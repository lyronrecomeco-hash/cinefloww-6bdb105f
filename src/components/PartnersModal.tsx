import { createPortal } from "react-dom";
import { X, Handshake, Mail, ExternalLink } from "lucide-react";

interface PartnersModalProps {
  onClose: () => void;
}

const PartnersModal = ({ onClose }: PartnersModalProps) => {
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
          O LyneFlix conta com parceiros que fornecem infraestrutura e fontes de
          conteúdo para garantir a melhor experiência de streaming. Nossos
          parceiros são essenciais para manter o catálogo sempre atualizado e
          com qualidade.
        </p>

        <div className="glass p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quer ser parceiro?
          </h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Se você possui uma plataforma ou serviço e gostaria de se tornar um
            parceiro do LyneFlix, entre em contato conosco. Estamos sempre
            abertos a novas colaborações.
          </p>
          <a
            href="mailto:contato@lyneflix.com"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
          >
            <Mail className="w-3.5 h-3.5" />
            contato@lyneflix.com
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PartnersModal;
