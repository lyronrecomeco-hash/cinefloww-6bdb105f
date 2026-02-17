import { useState } from "react";
import { X, Download, Loader2, Film, Tv } from "lucide-react";

interface ImportModalProps {
  contentType: "movie" | "series" | "dorama" | "anime";
  title: string;
  totalPages: number;
  onClose: () => void;
  onImport: (startPage: number, maxPages: number, enrich: boolean) => void;
  importing: boolean;
  progress: string;
  onCancel?: () => void;
}

const ImportModal = ({
  contentType,
  title,
  totalPages,
  onClose,
  onImport,
  importing,
  progress,
  onCancel,
}: ImportModalProps) => {
  const [startPage, setStartPage] = useState(1);
  const [pagesToImport, setPagesToImport] = useState(totalPages);
  const [enrich, setEnrich] = useState(true);

  const estimatedItems = pagesToImport * 30;
  const isMovie = contentType === "movie";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {isMovie ? <Film className="w-5 h-5 text-primary" /> : <Tv className="w-5 h-5 text-primary" />}
            <h2 className="text-lg font-bold">Importar {title}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Stats */}
          <div className="flex items-center gap-3">
            <div className="flex-1 p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
              <p className="text-2xl font-bold text-primary">{totalPages}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Páginas disponíveis</p>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-2xl font-bold">~{(totalPages * 30).toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Itens estimados</p>
            </div>
          </div>

          {/* Page range */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Páginas para importar</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">De</label>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={startPage}
                  onChange={(e) => setStartPage(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                  disabled={importing}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  max={totalPages - startPage + 1}
                  value={pagesToImport}
                  onChange={(e) => setPagesToImport(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={importing}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Importando páginas {startPage} a {Math.min(startPage + pagesToImport - 1, totalPages)} → ~{(Math.min(pagesToImport, totalPages - startPage + 1) * 30).toLocaleString()} itens
            </p>
          </div>

          {/* Quick buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setStartPage(1); setPagesToImport(10); }}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              10 páginas
            </button>
            <button
              onClick={() => { setStartPage(1); setPagesToImport(50); }}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              50 páginas
            </button>
            <button
              onClick={() => { setStartPage(1); setPagesToImport(100); }}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              100 páginas
            </button>
            <button
              onClick={() => { setStartPage(1); setPagesToImport(totalPages); }}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              Todas ({totalPages})
            </button>
          </div>

          {/* Enrich toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
            <div>
              <p className="text-sm font-medium">Enriquecer com TMDB</p>
              <p className="text-[11px] text-muted-foreground">Sinopse, backdrop, nota, IMDB ID</p>
            </div>
            <button
              onClick={() => setEnrich(!enrich)}
              disabled={importing}
              className={`w-11 h-6 rounded-full transition-colors relative ${enrich ? "bg-primary" : "bg-white/20"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enrich ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Progress */}
          {progress && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm">
              {progress}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3">
          <button
            onClick={importing ? onCancel : onClose}
            className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            {importing ? "Cancelar" : "Fechar"}
          </button>
          <button
            onClick={() => onImport(startPage, pagesToImport, enrich)}
            disabled={importing}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Importar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
