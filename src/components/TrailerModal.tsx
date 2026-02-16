import { X } from "lucide-react";
import { useEffect } from "react";

interface TrailerModalProps {
  videoKey: string;
  title: string;
  onClose: () => void;
}

const TrailerModal = ({ videoKey, title, onClose }: TrailerModalProps) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div
        className="relative w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[90vh] glass-strong overflow-hidden animate-scale-in flex flex-col sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10">
          <h2 className="font-display text-sm sm:text-lg font-bold truncate flex-1 min-w-0">{title} — Trailer</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative flex-1 sm:w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            style={{ border: 0 }}
            title={`${title} Trailer`}
          />
        </div>
      </div>
    </div>
  );
};

export default TrailerModal;
