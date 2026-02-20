import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, CheckCircle, XCircle, Film, Database, Zap } from "lucide-react";

const VisioncinePage = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0 });

  // Load JSON from public/data
  const loadJSON = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/data/visioncine_1.json");
      const data = await res.json();
      const valid = data.filter((item: any) => {
        const links = item["{links}"] || [];
        const hasValidUrl = links.some((l: any) =>
          l.url && (l.url.startsWith("http://") || l.url.startsWith("https://")) &&
          (l.url.includes(".mp4") || l.url.includes(".m3u8"))
        );
        return item["{titulo}"] && hasValidUrl;
      });
      setItems(data);
      setStats({ total: data.length, valid: valid.length, invalid: data.length - valid.length });
    } catch (err) {
      console.error("Failed to load JSON:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-start import when items are loaded
  useEffect(() => {
    if (stats.valid > 0 && !importing && !progress?.done) {
      startImport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.valid]);

  useEffect(() => { loadJSON(); }, [loadJSON]);

  // Poll progress
  useEffect(() => {
    if (!importing) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "visioncine_import_progress")
        .maybeSingle();
      if (data?.value) {
        const p = data.value as any;
        setProgress(p);
        if (p.done) {
          setImporting(false);
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [importing]);

  const startImport = async () => {
    if (items.length === 0) return;
    setImporting(true);
    setProgress(null);

    try {
      const { error } = await supabase.functions.invoke("import-visioncine", {
        body: { items, offset: 0, batch_size: 100, auto: true },
      });
      if (error) {
        console.error("Import error:", error);
        setImporting(false);
      }
    } catch (err) {
      console.error("Import failed:", err);
      setImporting(false);
    }
  };

  const progressPercent = progress ? Math.round((progress.offset / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Database className="w-7 h-7 text-primary" />
            VisionCine Import
          </h2>
          <p className="text-white/50 text-sm mt-1">
            Importação automática com indexação TMDB e cache de vídeo
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Film className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-white/60">Total no JSON</span>
          </div>
          <p className="text-3xl font-bold text-white">{loading ? "..." : stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm text-white/60">Com link válido</span>
          </div>
          <p className="text-3xl font-bold text-green-400">{loading ? "..." : stats.valid.toLocaleString()}</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-white/60">Sem link válido</span>
          </div>
          <p className="text-3xl font-bold text-red-400">{loading ? "..." : stats.invalid.toLocaleString()}</p>
        </div>
      </div>

      {/* Import Action */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Importação Automática
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Processa todos os {stats.valid.toLocaleString()} itens válidos automaticamente:
          busca no TMDB, cadastra no catálogo e indexa os links de vídeo no cache (30 dias de validade).
          Processamento em lotes de 100 com 8 workers simultâneos.
        </p>

        {!importing && !progress?.done && (
          <button
            onClick={startImport}
            disabled={loading || stats.valid === 0}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Iniciar Importação Completa
          </button>
        )}

        {importing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-white font-medium">Importando...</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {progress && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="text-white/60">
                  Progresso: <span className="text-white font-medium">{progress.offset}/{progress.total}</span>
                </div>
                <div className="text-white/60">
                  Indexados: <span className="text-green-400 font-medium">{progress.indexed}</span>
                </div>
                <div className="text-white/60">
                  Conteúdo: <span className="text-blue-400 font-medium">{progress.content_upserted}</span>
                </div>
                <div className="text-white/60">
                  Ignorados: <span className="text-yellow-400 font-medium">{progress.skipped}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {progress?.done && !importing && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-400 font-semibold">
              <CheckCircle className="w-5 h-5" />
              Importação Concluída!
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="text-white/60">
                Processados: <span className="text-white font-medium">{progress.processed}</span>
              </div>
              <div className="text-white/60">
                Indexados: <span className="text-green-400 font-medium">{progress.indexed}</span>
              </div>
              <div className="text-white/60">
                Conteúdo: <span className="text-blue-400 font-medium">{progress.content_upserted}</span>
              </div>
              <div className="text-white/60">
                Ignorados: <span className="text-yellow-400 font-medium">{progress.skipped}</span>
              </div>
            </div>
            <button
              onClick={() => { setProgress(null); }}
              className="mt-2 px-4 py-2 bg-white/10 text-white text-sm rounded-lg hover:bg-white/15 transition-colors"
            >
              Importar Novamente
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Prévia dos Dados ({stats.total} itens)</h3>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {items.slice(0, 50).map((item, idx) => {
            const titulo = item["{titulo}"];
            const ano = item["{ano}"];
            const links = item["{links}"] || [];
            const hasValid = links.some((l: any) =>
              l.url && l.url.startsWith("http") && (l.url.includes(".mp4") || l.url.includes(".m3u8"))
            );
            return (
              <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                {item["{capa}"] ? (
                  <img src={item["{capa}"]} alt="" className="w-8 h-12 object-cover rounded" />
                ) : (
                  <div className="w-8 h-12 bg-white/10 rounded flex items-center justify-center">
                    <Film className="w-4 h-4 text-white/30" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{titulo}</p>
                  <p className="text-xs text-white/40">{ano}</p>
                </div>
                {hasValid ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
              </div>
            );
          })}
          {items.length > 50 && (
            <p className="text-center text-white/30 text-sm py-3">
              ... e mais {items.length - 50} itens
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisioncinePage;
