import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Calendar } from "lucide-react";

const TMDB_MOVIE_GENRES = [
  { id: 28, name: "Ação" }, { id: 12, name: "Aventura" }, { id: 16, name: "Animação" },
  { id: 35, name: "Comédia" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentário" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Família" }, { id: 14, name: "Fantasia" },
  { id: 36, name: "História" }, { id: 27, name: "Terror" }, { id: 10402, name: "Música" },
  { id: 9648, name: "Mistério" }, { id: 10749, name: "Romance" }, { id: 878, name: "Ficção Científica" },
  { id: 53, name: "Thriller" }, { id: 10752, name: "Guerra" }, { id: 37, name: "Faroeste" },
];

const TMDB_TV_GENRES = [
  { id: 10759, name: "Ação & Aventura" }, { id: 16, name: "Animação" }, { id: 35, name: "Comédia" },
  { id: 80, name: "Crime" }, { id: 99, name: "Documentário" }, { id: 18, name: "Drama" },
  { id: 10751, name: "Família" }, { id: 10762, name: "Kids" }, { id: 9648, name: "Mistério" },
  { id: 10763, name: "Notícias" }, { id: 10764, name: "Reality" }, { id: 10765, name: "Sci-Fi & Fantasia" },
  { id: 10766, name: "Novela" }, { id: 10767, name: "Talk Show" }, { id: 10768, name: "Guerra & Política" },
  { id: 37, name: "Faroeste" },
];

// Year ranges for quick selection
const YEAR_RANGES = [
  { label: "2026", value: "2026" }, { label: "2025", value: "2025" }, { label: "2024", value: "2024" },
  { label: "2023", value: "2023" }, { label: "2022", value: "2022" }, { label: "2020s", value: "2020-2029" },
  { label: "2010s", value: "2010-2019" }, { label: "2000s", value: "2000-2009" },
  { label: "90s", value: "1990-1999" }, { label: "80s", value: "1980-1989" },
  { label: "70s", value: "1970-1979" }, { label: "Clássicos", value: "1888-1969" },
];

interface CategoriesModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: { id: string; name: string } | null) => void;
  onYearFilter?: (year: string | null) => void;
  selectedId?: string | null;
  selectedYear?: string | null;
  contentType?: "movie" | "tv";
}

const CategoriesModal = ({ open, onClose, onSelect, onYearFilter, selectedId, selectedYear, contentType = "movie" }: CategoriesModalProps) => {
  const genres = contentType === "tv" ? TMDB_TV_GENRES : TMDB_MOVIE_GENRES;
  const [tab, setTab] = useState<"genre" | "year">("genre");

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="font-display text-base font-bold">Filtros</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button onClick={() => setTab("genre")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === "genre" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
            Categorias
          </button>
          <button onClick={() => setTab("year")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${tab === "year" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
            <Calendar className="w-3 h-3" /> Ano
          </button>
        </div>

        <div className="p-3 max-h-[60vh] overflow-y-auto">
          {tab === "genre" ? (
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => { onSelect(null); onClose(); }}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                  !selectedId ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                }`}>Todos</button>
              {genres.map((g) => (
                <button key={g.id} onClick={() => { onSelect({ id: String(g.id), name: g.name }); onClose(); }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                    selectedId === String(g.id) ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                  }`}>{g.name}</button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => { onYearFilter?.(null); onClose(); }}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                  !selectedYear ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                }`}>Todos</button>
              {YEAR_RANGES.map((yr) => (
                <button key={yr.value} onClick={() => { onYearFilter?.(yr.value); onClose(); }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all text-center ${
                    selectedYear === yr.value ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                  }`}>{yr.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CategoriesModal;
