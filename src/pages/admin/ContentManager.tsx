import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trash2, Star, Loader2, Film, Eye, EyeOff, Download, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ContentEditModal from "./ContentEditModal";
import ImportModal from "@/components/admin/ImportModal";

interface ContentManagerProps {
  contentType: "movie" | "series" | "dorama" | "anime";
  title: string;
}

const AUDIO_LABELS: Record<string, { label: string; color: string }> = {
  dublado: { label: "DUB", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  legendado: { label: "LEG", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  cam: { label: "CAM", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
};

const ITEMS_PER_PAGE = 50;

const ContentManager = ({ contentType, title }: ContentManagerProps) => {
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [totalToImport, setTotalToImport] = useState(0);
  const [cineveoTotalPages, setCineveoTotalPages] = useState(0);
  const [syncStats, setSyncStats] = useState<any>(null);
  const [loadingSyncStats, setLoadingSyncStats] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");
  const cancelRef = useRef(false);
  const { toast } = useToast();

  const fetchContent = useCallback(async () => {
    setLoading(true);
    const from = page * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase
      .from("content")
      .select("*", { count: "exact" })
      .eq("content_type", contentType)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filterText.trim()) {
      query = query.ilike("title", `%${filterText.trim()}%`);
    }

    const { data, error, count } = await query;
    if (!error) {
      setItems(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [contentType, page, filterText]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const fetchSyncStats = useCallback(async () => {
    setLoadingSyncStats(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-catalog", {
        body: { action: "sync-check", content_type: contentType },
      });
      if (!error && data?.success) {
        setSyncStats(data);
        setCineveoTotalPages(data.total_pages);
      }
    } catch { /* skip */ }
    setLoadingSyncStats(false);
  }, [contentType]);

  const openImportModal = async () => {
    setShowImportModal(true);
    setImportProgress("");
    setImportedCount(0);
    setTotalToImport(0);
    cancelRef.current = false;
    fetchSyncStats();
  };

  const handleImport = async (startPage: number, maxPages: number, enrich: boolean) => {
    setImporting(true);
    cancelRef.current = false;
    const targetEndPage = startPage + maxPages - 1;
    let totalImported = 0;
    let totalFound = 0;
    const CONCURRENCY = 5;
    const PAGES_PER_BATCH = 20;

    setTotalToImport(maxPages * 30);

    try {
      let nextPages: number[] = [];
      // Build initial queue of start pages
      for (let p = startPage; p <= targetEndPage; p += PAGES_PER_BATCH) {
        nextPages.push(p);
      }

      while (nextPages.length > 0 && !cancelRef.current) {
        const batch = nextPages.splice(0, CONCURRENCY);
        setImportProgress(`⚡ Importando ${batch.length} lotes em paralelo (pág ${batch[0]}-${batch[batch.length - 1] + PAGES_PER_BATCH - 1})...`);

        const results = await Promise.allSettled(
          batch.map(sp =>
            supabase.functions.invoke("import-catalog", {
              body: { action: "import", content_type: contentType, start_page: sp, enrich },
            })
          )
        );

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data?.success) {
            totalImported += result.value.data.imported || 0;
            totalFound += result.value.data.total || 0;
          }
        }
        setImportedCount(totalImported);
      }

      if (cancelRef.current) {
        setImportProgress(`⚠️ Cancelado. ${totalImported} importados.`);
      } else {
        setImportProgress(`✅ ${totalImported} importados (${totalFound} encontrados)`);
      }
      toast({ title: "Importação concluída!", description: `${totalImported} itens adicionados.` });
      fetchContent();
      fetchSyncStats();
    } catch (err: any) {
      setImportProgress(`❌ Erro: ${err.message}. ${totalImported} importados antes do erro.`);
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
      if (totalImported > 0) fetchContent();
    }
    setImporting(false);
  };

  const handleAutoImport = async (enrich: boolean) => {
    if (!cineveoTotalPages) {
      toast({ title: "Aguarde", description: "Carregando total de páginas..." });
      return;
    }
    handleImport(1, cineveoTotalPages, enrich);
  };

  const handleCancelImport = () => { cancelRef.current = true; };

  const handleDelete = async (id: string, itemTitle: string) => {
    if (!confirm(`Remover "${itemTitle}" do catálogo?`)) return;
    const { error } = await supabase.from("content").delete().eq("id", id);
    if (!error) { toast({ title: "Removido" }); fetchContent(); }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    await supabase.from("content").update({ status: newStatus }).eq("id", id);
    fetchContent();
  };

  const toggleFeatured = async (id: string, current: boolean) => {
    await supabase.from("content").update({ featured: !current }).eq("id", id);
    fetchContent();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalCount} itens no catálogo</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={openImportModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Download className="w-4 h-4" />
            Importar CineFlow
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" value={filterText}
          onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
          placeholder="Filtrar por título..."
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="glass p-12 text-center">
          <Film className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum conteúdo encontrado</p>
          <button onClick={openImportModal} className="mt-4 px-4 py-2 rounded-xl bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition-colors">
            Importar do CineFlow
          </button>
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Título</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Ano</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden md:table-cell">Áudio</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">⭐</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.poster_path ? (
                            <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-8 h-12 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Film className="w-3 h-3" /></div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[200px] lg:max-w-none">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground">★ {Number(item.vote_average).toFixed(1)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{item.release_date?.split("-")[0] || "N/A"}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1 flex-wrap">
                          {(item.audio_type || []).map((t: string) => (
                            <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${AUDIO_LABELS[t]?.color || "bg-white/5 text-muted-foreground border-white/10"}`}>
                              {AUDIO_LABELS[t]?.label || t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleStatus(item.id, item.status)}>
                          {item.status === "published" ? (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-1"><Eye className="w-3 h-3" />On</span>
                          ) : (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 inline-flex items-center gap-1"><EyeOff className="w-3 h-3" />Off</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleFeatured(item.id, item.featured)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${item.featured ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}>
                          <Star className={`w-3.5 h-3.5 ${item.featured ? "fill-primary" : ""}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setEditItem(item)} className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(item.id, item.title)} className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} de {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground font-medium">
                  Pág {page + 1}/{Math.ceil(totalCount / ITEMS_PER_PAGE)}
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * ITEMS_PER_PAGE >= totalCount}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {editItem && (
        <ContentEditModal item={editItem} onClose={() => setEditItem(null)} onSave={() => { setEditItem(null); fetchContent(); }} />
      )}

      {showImportModal && (
        <ImportModal
          contentType={contentType}
          title={title}
          totalPages={cineveoTotalPages}
          syncStats={syncStats}
          loadingSyncStats={loadingSyncStats}
          onRefreshSync={fetchSyncStats}
          onClose={() => { setShowImportModal(false); setImportProgress(""); handleCancelImport(); }}
          onImport={handleImport}
          onAutoImport={handleAutoImport}
          importing={importing}
          progress={importProgress}
          importedCount={importedCount}
          totalToImport={totalToImport}
          onCancel={handleCancelImport}
        />
      )}
    </div>
  );
};

export default ContentManager;
