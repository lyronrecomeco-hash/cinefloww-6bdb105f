import { X } from "lucide-react";
import { posterUrl } from "@/services/tmdb";
import { useEffect } from "react";

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface CastModalProps {
  cast: CastMember[];
  onClose: () => void;
}

const CastModal = ({ cast, onClose }: CastModalProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
      <div
        className="relative w-full max-w-4xl max-h-[85vh] glass-strong overflow-hidden animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-white/10">
          <h2 className="font-display text-xl sm:text-2xl font-bold">Elenco Completo</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-5 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {cast.map((person) => (
              <div key={person.id} className="text-center group">
                <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden mb-2 bg-muted border border-white/5">
                  {person.profile_path ? (
                    <img
                      src={posterUrl(person.profile_path, "w185")}
                      alt={person.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl font-display">
                      {person.name.charAt(0)}
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold line-clamp-1">{person.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{person.character}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CastModal;
