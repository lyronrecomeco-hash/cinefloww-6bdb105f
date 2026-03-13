import { useState } from "react";
import { X, ShieldCheck, Info } from "lucide-react";

interface AgeRatingBadgeProps {
  rating: string;
}

const RATING_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; description: string; recommendation: string }> = {
  L: {
    color: "text-green-400", bg: "bg-green-500", border: "border-green-500",
    label: "L", description: "Livre para todos os públicos",
    recommendation: "Conteúdo adequado para todas as idades. Não contém violência, linguagem imprópria ou cenas de sexo.",
  },
  "10": {
    color: "text-blue-400", bg: "bg-blue-500", border: "border-blue-500",
    label: "10", description: "Não recomendado para menores de 10 anos",
    recommendation: "Pode conter violência fantasiosa leve e linguagem levemente imprópria.",
  },
  "12": {
    color: "text-yellow-400", bg: "bg-yellow-500", border: "border-yellow-500",
    label: "12", description: "Não recomendado para menores de 12 anos",
    recommendation: "Pode conter cenas de violência moderada, linguagem imprópria leve e insinuação sexual.",
  },
  "14": {
    color: "text-orange-400", bg: "bg-orange-500", border: "border-orange-500",
    label: "14", description: "Não recomendado para menores de 14 anos",
    recommendation: "Pode conter violência, linguagem imprópria, consumo de drogas lícitas e conteúdo sexual moderado.",
  },
  "16": {
    color: "text-orange-500", bg: "bg-orange-600", border: "border-orange-600",
    label: "16", description: "Não recomendado para menores de 16 anos",
    recommendation: "Pode conter violência intensa, linguagem vulgar, uso de drogas e cenas de sexo.",
  },
  "18": {
    color: "text-red-400", bg: "bg-red-600", border: "border-red-600",
    label: "18", description: "Não recomendado para menores de 18 anos",
    recommendation: "Pode conter violência extrema, conteúdo sexual explícito, uso de drogas ilícitas e linguagem fortemente vulgar.",
  },
};

// Map US ratings to BR equivalent
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
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-white/10 border border-white/20 text-[11px] font-black text-muted-foreground">
        {rating}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowModal(true); }}
        className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-md ${config.bg} text-white text-[11px] sm:text-xs font-black transition-transform hover:scale-110 cursor-pointer shadow-lg`}
        title={config.description}
      >
        {config.label}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
          <div className="relative w-full max-w-sm animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="bg-card/80 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg ${config.bg} flex items-center justify-center text-white text-lg font-black shadow-lg`}>
                      {config.label}
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold text-foreground">Classificação Indicativa</h3>
                      <p className={`text-xs font-semibold ${config.color}`}>{config.description}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">O que significa</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{config.recommendation}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Recomendação</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
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
                  className="w-full mt-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AgeRatingBadge;
