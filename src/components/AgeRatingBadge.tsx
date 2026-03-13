import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, Info } from "lucide-react";

interface AgeRatingBadgeProps {
  rating: string;
}

const RATING_CONFIG: Record<string, { bg: string; label: string; description: string; recommendation: string }> = {
  L: {
    bg: "bg-green-500", label: "L",
    description: "Livre para todos os públicos",
    recommendation: "Conteúdo adequado para todas as idades. Não contém violência, linguagem imprópria ou cenas de sexo.",
  },
  "10": {
    bg: "bg-blue-500", label: "10",
    description: "Não recomendado para menores de 10 anos",
    recommendation: "Pode conter violência fantasiosa leve e linguagem levemente imprópria.",
  },
  "12": {
    bg: "bg-yellow-500", label: "12",
    description: "Não recomendado para menores de 12 anos",
    recommendation: "Pode conter cenas de violência moderada, linguagem imprópria leve e insinuação sexual.",
  },
  "14": {
    bg: "bg-orange-500", label: "14",
    description: "Não recomendado para menores de 14 anos",
    recommendation: "Pode conter violência, linguagem imprópria, consumo de drogas lícitas e conteúdo sexual moderado.",
  },
  "16": {
    bg: "bg-orange-600", label: "16",
    description: "Não recomendado para menores de 16 anos",
    recommendation: "Pode conter violência intensa, linguagem vulgar, uso de drogas e cenas de sexo.",
  },
  "18": {
    bg: "bg-red-600", label: "18",
    description: "Não recomendado para menores de 18 anos",
    recommendation: "Pode conter violência extrema, conteúdo sexual explícito, uso de drogas ilícitas e linguagem fortemente vulgar.",
  },
};

const US_MAP: Record<string, string> = {
  G: "L", "TV-G": "L", "TV-Y": "L",
  PG: "10", "TV-PG": "10", "TV-Y7": "10",
  "PG-13": "12", "TV-14": "14",
  R: "16", "NC-17": "18", "TV-MA": "18",
};

function normalizeRating(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (RATING_CONFIG[upper]) return upper;
  if (US_MAP[upper]) return US_MAP[upper];
  return upper;
}

const AgeRatingBadge = ({ rating }: AgeRatingBadgeProps) => {
  const [showModal, setShowModal] = useState(false);
  const normalized = normalizeRating(rating);
  const config = RATING_CONFIG[normalized];

  if (!config) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-white/10 border border-white/20 text-[10px] font-black text-muted-foreground leading-none">
        {rating}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowModal(true); }}
        className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded ${config.bg} text-white text-[10px] sm:text-[11px] font-black leading-none transition-transform hover:scale-110 cursor-pointer`}
        title={config.description}
      >
        {config.label}
      </button>

      {showModal && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 sm:p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center text-white text-base font-black`}>
                      {config.label}
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-bold text-foreground">Classificação Indicativa</h3>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowModal(false)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Info className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">O que significa</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{config.recommendation}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Recomendação</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {normalized === "L"
                        ? "Este conteúdo é seguro para toda a família assistir junta."
                        : normalized === "10" || normalized === "12"
                          ? "Recomendamos que crianças assistam acompanhadas de um adulto."
                          : normalized === "14"
                            ? "Recomendamos supervisão para menores de 14 anos."
                            : "Este conteúdo é destinado exclusivamente para o público adulto."}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full mt-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default AgeRatingBadge;
