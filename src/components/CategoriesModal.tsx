import { useState } from "react";
import { X, FolderOpen } from "lucide-react";

// TMDB genre IDs mapped to Portuguese names
const TMDB_MOVIE_GENRES = [
  { id: 28, name: "Ação" },
  { id: 12, name: "Aventura" },
  { id: 16, name: "Animação" },
  { id: 35, name: "Comédia" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentário" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Família" },
  { id: 14, name: "Fantasia" },
  { id: 36, name: "História" },
  { id: 27, name: "Terror" },
  { id: 10402, name: "Música" },
  { id: 9648, name: "Mistério" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Ficção Científica" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "Guerra" },
  { id: 37, name: "Faroeste" },
];

const TMDB_TV_GENRES = [
  { id: 10759, name: "Ação & Aventura" },
  { id: 16, name: "Animação" },
  { id: 35, name: "Comédia" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentário" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Família" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mistério" },
  { id: 10763, name: "Notícias" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasia" },
  { id: 10766, name: "Novela" },
  { id: 10767, name: "Talk Show" },
  { id: 10768, name: "Guerra & Política" },
  { id: 37, name: "Faroeste" },
];

interface CategoriesModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: { id: string; name: string } | null) => void;
  selectedId?: string | null;
  contentType?: "movie" | "tv";
}

const CategoriesModal = ({ open, onClose, onSelect, selectedId, contentType = "movie" }: CategoriesModalProps) => {
  const genres = contentType === "tv" ? TMDB_TV_GENRES : TMDB_MOVIE_GENRES;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-display text-lg font-bold">Categorias</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[70vh] scrollbar-hide">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { onSelect(null); onClose(); }}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-center ${
                !selectedId
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
              }`}
            >
              Todos
            </button>
            {genres.map((g) => (
              <button
                key={g.id}
                onClick={() => { onSelect({ id: String(g.id), name: g.name }); onClose(); }}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-center ${
                  selectedId === String(g.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoriesModal;
