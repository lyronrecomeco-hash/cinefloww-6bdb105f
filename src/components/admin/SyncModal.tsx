import { useState, useEffect, useRef } from "react";
import { Film, Tv, Loader2, RefreshCw, Database, X, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCatalogCache } from "@/lib/catalogFetcher";

interface SyncCounts {
  movies: { total_pages: number; total_items: number };
  series: { total_pages: number; total_items: number };
  total_items: number;
  total_pages: number;
}

interface SyncProgress {
  phase: string;
  type?: string;
  page?: number;
  batch?: number;
  total_pages?: number;
  movies?: number;
  series?: number;
  done?: boolean;
  movies_with_video?: number;
  series_with_video?: number;
  files?: number;
  files_uploaded?: number;
  updated_at?: string;
}

interface SyncModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function SyncModal({ open, onClose, onComplete }: SyncModalProps) {
  const [counts, setCounts] = useState<SyncCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncStartRef = useRef(0);

  // Load counts when modal opens
  useEffect(() => {
    if (!open) return;
    setCounts(null);
    setError(null);
    setProgress(null);
    setSyncing(false);
    loadCounts();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  const loadCounts = async () => {
    setLoadingCounts(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sync-catalog", {
        body: { action: "count" },
      });
      if (fnError) throw fnError;
      setCounts(data);
    } catch (err: any) {
      setError(err?.message || "Falha ao carregar contagem");
    } finally {
      setLoadingCounts(false);
    }
  };

  const startSync = async () => {
    setSyncing(true);
    setError(null);
    setProgress({ phase: "starting" });
    syncStartRef.current = Date.now();

    try {
      const { error: fnError } = await supabase.functions.invoke("sync-catalog", {
        body: { action: "sync" },
      });
      if (fnError) throw fnError;

      // Poll progress via site_settings
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await supabase
            .from("site_settings")
            .select("value")
            .eq("key", "catalog_sync_progress")
            .single();

          const p = data?.value as unknown as SyncProgress | null;
          if (!p) return;

          // Only show progress from this sync session
          if (p.updated_at && new Date(p.updated_at).getTime() > syncStartRef.current - 5000) {
            setProgress(p);
          }

          if (p.done || p.phase === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setSyncing(false);
            invalidateCatalogCache();
            // Small delay then complete
            setTimeout(() => onComplete(), 1500);
          }

          if (p.phase === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setSyncing(false);
            setError((p as any).error || "Erro durante sincronização");
          }
        } catch {}
      }, 4000);

      // Safety timeout (15 min)
      setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (syncing) {
          setSyncing(false);
          invalidateCatalogCache();
          onComplete();
        }
      }, 900000);
    } catch (err: any) {
      setSyncing(false);
      setError(err?.message || "Falha ao iniciar sincronização");
    }
  };

  const getPhaseLabel = (p: SyncProgress) => {
    switch (p.phase) {
      case "starting": return "Iniciando...";
      case "crawling":
        return `Crawling ${p.type === "series" ? "séries" : "filmes"} — página ${p.page || "?"}${p.total_pages ? ` / ${p.total_pages}` : ""}`;
      case "building": return "Gerando catálogo e shards de vídeo...";
      case "uploading": return `Enviando ${p.files || 0} arquivos...`;
      case "done": return "✅ Concluído!";
      case "error": return "❌ Erro";
      default: return p.phase;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Sincronizar Catálogo
          </h2>
          {!syncing && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading counts */}
        {loadingCounts && (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Consultando API CineVeo...</span>
          </div>
        )}

        {/* Counts loaded */}
        {counts && !syncing && !progress?.done && (
          <>
            <p className="text-sm text-muted-foreground">
              Dados disponíveis na API CineVeo para sincronização:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <Film className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-foreground">{counts.movies.total_items.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Filmes</p>
                <p className="text-[10px] text-muted-foreground">{counts.movies.total_pages} páginas</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <Tv className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-foreground">{counts.series.total_items.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Séries</p>
                <p className="text-[10px] text-muted-foreground">{counts.series.total_pages} páginas</p>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary">{counts.total_items.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total de itens • {counts.total_pages} páginas</p>
            </div>
          </>
        )}

        {/* Syncing progress */}
        {syncing && progress && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm font-medium">{getPhaseLabel(progress)}</span>
            </div>
            {progress.phase === "crawling" && progress.total_pages && progress.page && (
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.round((progress.page / progress.total_pages) * 100))}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {Math.round((progress.page / progress.total_pages) * 100)}%
                </p>
              </div>
            )}
            {progress.movies !== undefined && progress.series !== undefined && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <span className="text-blue-400 font-medium">{progress.movies?.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-1">filmes</span>
                </div>
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <span className="text-purple-400 font-medium">{progress.series?.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-1">séries</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {progress?.done && (
          <div className="space-y-3 text-center py-2">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">Catálogo sincronizado com sucesso!</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <span className="text-emerald-400 font-bold">{progress.movies?.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1">filmes</span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                <span className="text-emerald-400 font-bold">{progress.series?.toLocaleString()}</span>
                <span className="text-muted-foreground ml-1">séries</span>
              </div>
            </div>
            {progress.files_uploaded && (
              <p className="text-[10px] text-muted-foreground">{progress.files_uploaded} arquivos gerados</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          {!syncing && !progress?.done && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button
                onClick={startSync}
                disabled={!counts || loadingCounts}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Sincronizar Tudo
              </button>
            </>
          )}
          {progress?.done && (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
