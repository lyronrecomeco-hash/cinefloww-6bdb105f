import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Search, RefreshCw, Film, Tv, Trash2, Check, Clock, Package, ChevronLeft, ChevronRight, Settings, Wifi, WifiOff, Play, ExternalLink, Globe, Plus, Power, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Ingestion {
  id: string;
  title: string;
  synopsis: string | null;
  content_type: string;
  season: number | null;
  episode: number | null;
  episode_title: string | null;
  telegram_file_id: string;
  telegram_unique_id: string;
  file_size: number | null;
  duration: number | null;
  resolution: string | null;
  file_name: string | null;
  mime_type: string | null;
  status: string;
  telegram_user_id: number;
  created_at: string;
  tmdb_id: number | null;
  tmdb_poster: string | null;
  tmdb_backdrop: string | null;
  tmdb_year: string | null;
  tmdb_rating: number | null;
}

interface ScrapingProvider {
  id: string;
  name: string;
  base_url: string;
  movie_url_template: string;
  tv_url_template: string;
  priority: number;
  active: boolean;
  health_status: string;
  success_count: number;
  fail_count: number;
  last_checked_at: string | null;
}

const ITEMS_PER_PAGE = 20;
const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "text-yellow-400", icon: Clock },
  confirmed: { label: "Confirmado", color: "text-blue-400", icon: Check },
  processed: { label: "Processado", color: "text-green-400", icon: Package },
};

const IMG_BASE = "https://image.tmdb.org/t/p";

const TelegramPage = () => {
  const [activeTab, setActiveTab] = useState<"ingestions" | "providers">("ingestions");
  const [items, setItems] = useState<Ingestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [webhookActive, setWebhookActive] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [authorizedId, setAuthorizedId] = useState("");
  const [authorizedIds, setAuthorizedIds] = useState<number[]>([]);
  const [stats, setStats] = useState({ pending: 0, confirmed: 0, processed: 0 });
  const [selectedItem, setSelectedItem] = useState<Ingestion | null>(null);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Providers state
  const [providers, setProviders] = useState<ScrapingProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", base_url: "", movie_url_template: "/embed/movie/{tmdb_id}", tv_url_template: "/embed/tv/{tmdb_id}/{season}/{episode}" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    let countQ = supabase.from("telegram_ingestions").select("id", { count: "exact", head: true });
    if (statusFilter !== "all") countQ = countQ.eq("status", statusFilter);
    if (filter) countQ = countQ.ilike("title", `%${filter}%`);
    const { count } = await countQ;
    setTotalCount(count || 0);

    const from = (page - 1) * ITEMS_PER_PAGE;
    let q = supabase.from("telegram_ingestions").select("*").order("created_at", { ascending: false }).range(from, from + ITEMS_PER_PAGE - 1);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (filter) q = q.ilike("title", `%${filter}%`);
    const { data } = await q;
    setItems((data as Ingestion[]) || []);

    const [{ count: p }, { count: c }, { count: pr }] = await Promise.all([
      supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "processed"),
    ]);
    setStats({ pending: p || 0, confirmed: c || 0, processed: pr || 0 });
    setLoading(false);
  }, [page, statusFilter, filter]);

  const fetchProviders = useCallback(async () => {
    setLoadingProviders(true);
    const { data } = await supabase
      .from("scraping_providers")
      .select("*")
      .order("priority", { ascending: true });
    setProviders((data as ScrapingProvider[]) || []);
    setLoadingProviders(false);
  }, []);

  const fetchAuthorizedIds = useCallback(async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "telegram_authorized_ids")
      .maybeSingle();
    if (data?.value) {
      setAuthorizedIds((data.value as any)?.ids || []);
    }
  }, []);

  useEffect(() => { fetchData(); fetchAuthorizedIds(); fetchProviders(); }, [fetchData, fetchAuthorizedIds, fetchProviders]);

  useEffect(() => {
    const ch1 = supabase
      .channel("telegram_ingestions_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_ingestions" }, () => fetchData())
      .subscribe();
    const ch2 = supabase
      .channel("scraping_providers_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "scraping_providers" }, () => fetchProviders())
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchData, fetchProviders]);

  const setupWebhook = async () => {
    setSettingUp(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/telegram-bot?setup=true`);
      const data = await res.json();
      if (data.webhook?.ok) {
        setWebhookActive(true);
        toast({ title: "Webhook ativado!", description: "Bot Telegram conectado." });
      } else {
        toast({ title: "Erro", description: JSON.stringify(data), variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro", description: String(e), variant: "destructive" });
    }
    setSettingUp(false);
  };

  const addAuthorizedId = async () => {
    const id = parseInt(authorizedId);
    if (!id) return;
    const newIds = [...authorizedIds, id];
    await supabase.from("site_settings").upsert(
      { key: "telegram_authorized_ids", value: { ids: newIds } as any },
      { onConflict: "key" }
    );
    setAuthorizedIds(newIds);
    setAuthorizedId("");
    toast({ title: "ID autorizado adicionado!" });
  };

  const removeAuthorizedId = async (id: number) => {
    const newIds = authorizedIds.filter(i => i !== id);
    await supabase.from("site_settings").upsert(
      { key: "telegram_authorized_ids", value: { ids: newIds } as any },
      { onConflict: "key" }
    );
    setAuthorizedIds(newIds);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("telegram_ingestions").update({ status }).eq("id", id);
    toast({ title: `Status atualizado para ${STATUS_MAP[status]?.label || status}` });
  };

  const deleteItem = async (id: string) => {
    await supabase.from("telegram_ingestions").delete().eq("id", id);
    toast({ title: "Item removido." });
  };

  const testPlayer = async (item: Ingestion) => {
    if (!item.tmdb_id) {
      toast({ title: "Sem TMDB ID", description: "Não é possível testar sem dados do TMDB.", variant: "destructive" });
      return;
    }
    setSelectedItem(item);
    setExtracting(true);
    setPlayerUrl(null);
    try {
      const { data: cached } = await supabase
        .from("video_cache")
        .select("video_url, video_type")
        .eq("tmdb_id", item.tmdb_id)
        .eq("content_type", item.content_type === "series" ? "tv" : "movie")
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cached?.video_url) {
        setPlayerUrl(`/player/${item.content_type === "series" ? "tv" : "movie"}/${item.tmdb_id}?title=${encodeURIComponent(item.title)}&url=${encodeURIComponent(cached.video_url)}&type=${cached.video_type || "m3u8"}${item.season ? `&s=${item.season}&e=${item.episode}` : ""}`);
      } else {
        const { data: extracted } = await supabase.functions.invoke("extract-video", {
          body: {
            tmdb_id: item.tmdb_id,
            content_type: item.content_type === "series" ? "tv" : "movie",
            season: item.season,
            episode: item.episode,
          },
        });
        if (extracted?.url) {
          setPlayerUrl(`/player/${item.content_type === "series" ? "tv" : "movie"}/${item.tmdb_id}?title=${encodeURIComponent(item.title)}&url=${encodeURIComponent(extracted.url)}&type=${extracted.type || "m3u8"}${item.season ? `&s=${item.season}&e=${item.episode}` : ""}`);
        }
      }
    } catch (e) {
      toast({ title: "Erro ao extrair vídeo", variant: "destructive" });
    }
    setExtracting(false);
  };

  // Provider actions
  const toggleProvider = async (provider: ScrapingProvider) => {
    await supabase.from("scraping_providers").update({ active: !provider.active }).eq("id", provider.id);
    toast({ title: `${provider.name} ${provider.active ? "desativado" : "ativado"}` });
  };

  const deleteProvider = async (id: string) => {
    await supabase.from("scraping_providers").delete().eq("id", id);
    toast({ title: "Provedor removido." });
  };

  const addProvider = async () => {
    if (!newProvider.name || !newProvider.base_url) return;
    const maxPriority = providers.length > 0 ? Math.max(...providers.map(p => p.priority)) : 0;
    await supabase.from("scraping_providers").insert({
      ...newProvider,
      priority: maxPriority + 1,
      active: true,
      health_status: "unknown",
    });
    setNewProvider({ name: "", base_url: "", movie_url_template: "/embed/movie/{tmdb_id}", tv_url_template: "/embed/tv/{tmdb_id}/{season}/{episode}" });
    setShowAddProvider(false);
    toast({ title: "Provedor adicionado!" });
  };

  const resetProviderStats = async () => {
    await supabase.from("scraping_providers").update({ success_count: 0, fail_count: 0, health_status: "unknown" }).neq("id", "x");
    toast({ title: "Contadores resetados!" });
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    return `${(bytes / 1e6).toFixed(0)} MB`;
  };

  const formatDuration = (secs: number | null) => {
    if (!secs) return "N/A";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, "0")}min`;
    return `${m}min`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Bot Telegram</h1>
            <p className="text-xs text-muted-foreground">Ingestão + Raspagem Inteligente</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={setupWebhook} disabled={settingUp}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm hover:bg-primary/30">
            {settingUp ? <RefreshCw className="w-4 h-4 animate-spin" /> : webhookActive ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {webhookActive ? "Webhook Ativo" : "Ativar Webhook"}
          </button>
          <button onClick={() => { fetchData(); fetchProviders(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border text-sm hover:bg-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setActiveTab("ingestions")}
          className={`px-4 py-2 rounded-t-xl text-sm font-medium transition-colors ${activeTab === "ingestions" ? "bg-primary/20 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
          📥 Ingestão
        </button>
        <button onClick={() => setActiveTab("providers")}
          className={`px-4 py-2 rounded-t-xl text-sm font-medium transition-colors ${activeTab === "providers" ? "bg-primary/20 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
          🌐 Provedores ({providers.length})
        </button>
      </div>

      {activeTab === "ingestions" ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-yellow-400" },
              { label: "Confirmados", value: stats.confirmed, icon: Check, color: "text-blue-400" },
              { label: "Processados", value: stats.processed, icon: Package, color: "text-green-400" },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-muted/30 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Authorized IDs */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">IDs Autorizados (Telegram)</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input value={authorizedId} onChange={e => setAuthorizedId(e.target.value)}
                placeholder="ID do Telegram..."
                className="flex-1 h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50" />
              <button onClick={addAuthorizedId} className="px-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm">Adicionar</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {authorizedIds.map(id => (
                <span key={id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs">
                  {id}
                  <button onClick={() => removeAuthorizedId(id)} className="text-destructive hover:text-destructive/80">×</button>
                </span>
              ))}
              {authorizedIds.length === 0 && <span className="text-xs text-muted-foreground">Nenhum ID autorizado.</span>}
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
                placeholder="Buscar..."
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted/30 border border-border text-sm focus:outline-none focus:border-primary/50" />
            </div>
            {["all", "pending", "confirmed", "processed"].map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  statusFilter === s ? "bg-primary/20 border-primary/30 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                }`}>
                {s === "all" ? "Todos" : STATUS_MAP[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Items */}
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
                const StIcon = st.icon;
                return (
                  <div key={item.id}
                    className="p-3 rounded-xl bg-muted/10 border border-border hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => { setSelectedItem(item); setPlayerUrl(null); }}>
                    <div className="flex items-start gap-3">
                      <div className="w-14 h-20 rounded-lg overflow-hidden bg-muted/30 flex-shrink-0">
                        {item.tmdb_poster ? (
                          <img src={`${IMG_BASE}/w92${item.tmdb_poster}`} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {item.content_type === "movie" ? <Film className="w-5 h-5 text-muted-foreground" /> : <Tv className="w-5 h-5 text-muted-foreground" />}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{item.title}</span>
                          {item.tmdb_year && <span className="text-xs text-muted-foreground">({item.tmdb_year})</span>}
                          <span className={`flex items-center gap-1 text-xs ${st.color}`}>
                            <StIcon className="w-3 h-3" /> {st.label}
                          </span>
                        </div>
                        {item.synopsis && <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">{item.synopsis}</p>}
                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                          {item.season != null && <span className="px-2 py-0.5 rounded bg-muted">T{item.season}E{item.episode}</span>}
                          <span className="px-2 py-0.5 rounded bg-muted">{formatSize(item.file_size)}</span>
                          <span className="px-2 py-0.5 rounded bg-muted">{formatDuration(item.duration)}</span>
                          {item.resolution && <span className="px-2 py-0.5 rounded bg-muted">{item.resolution}</span>}
                          {item.tmdb_rating && <span className="px-2 py-0.5 rounded bg-primary/20 text-primary">⭐ {Number(item.tmdb_rating).toFixed(1)}</span>}
                          <span className="px-2 py-0.5 rounded bg-muted">{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {item.status === "pending" && (
                          <button onClick={() => updateStatus(item.id, "confirmed")} className="p-2 rounded-lg hover:bg-muted text-blue-400" title="Confirmar">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {item.status === "confirmed" && (
                          <button onClick={() => updateStatus(item.id, "processed")} className="p-2 rounded-lg hover:bg-muted text-green-400" title="Processado">
                            <Package className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => deleteItem(item.id)} className="p-2 rounded-lg hover:bg-muted text-destructive" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <p className="text-center text-muted-foreground py-10">Nenhuma ingestão encontrada.</p>}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg bg-muted/30 border border-border disabled:opacity-30 hover:bg-muted/50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg bg-muted/30 border border-border disabled:opacity-30 hover:bg-muted/50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        /* PROVIDERS TAB */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Provedores de Raspagem</h2>
            <div className="flex gap-2">
              <button onClick={resetProviderStats} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-xs hover:bg-muted">
                <RotateCcw className="w-3 h-3" /> Resetar
              </button>
              <button onClick={() => setShowAddProvider(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs hover:bg-primary/30">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
          </div>

          {loadingProviders ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((p, i) => {
                const rate = p.success_count + p.fail_count > 0
                  ? ((p.success_count / (p.success_count + p.fail_count)) * 100).toFixed(0)
                  : "N/A";
                const statusColor = p.health_status === "healthy" ? "text-green-400" : p.health_status === "degraded" ? "text-yellow-400" : p.health_status === "down" ? "text-red-400" : "text-muted-foreground";
                return (
                  <div key={p.id} className="p-4 rounded-xl bg-muted/10 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">P{p.priority}</span>
                        <Globe className={`w-4 h-4 ${statusColor}`} />
                        <span className="font-medium text-sm">{p.name}</span>
                        {!p.active && <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive text-[10px]">OFF</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleProvider(p)} className={`p-1.5 rounded-lg hover:bg-muted ${p.active ? "text-green-400" : "text-muted-foreground"}`} title={p.active ? "Desativar" : "Ativar"}>
                          <Power className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteProvider(p.id)} className="p-1.5 rounded-lg hover:bg-muted text-destructive" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1 font-mono truncate">{p.base_url}</div>
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-green-400">✅ {p.success_count}</span>
                      <span className="text-red-400">❌ {p.fail_count}</span>
                      <span>Taxa: {rate}%</span>
                      {p.last_checked_at && <span>Último: {new Date(p.last_checked_at).toLocaleString("pt-BR")}</span>}
                    </div>
                  </div>
                );
              })}
              {providers.length === 0 && <p className="text-center text-muted-foreground py-10">Nenhum provedor cadastrado.</p>}
            </div>
          )}

          {/* Add Provider Modal */}
          <Dialog open={showAddProvider} onOpenChange={setShowAddProvider}>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle>Adicionar Provedor</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
                  <input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: MeuProvedor"
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">URL Base</label>
                  <input value={newProvider.base_url} onChange={e => setNewProvider(p => ({ ...p, base_url: e.target.value }))}
                    placeholder="https://exemplo.com"
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Template Filme</label>
                  <input value={newProvider.movie_url_template} onChange={e => setNewProvider(p => ({ ...p, movie_url_template: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Template Série</label>
                  <input value={newProvider.tv_url_template} onChange={e => setNewProvider(p => ({ ...p, tv_url_template: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:border-primary/50" />
                </div>
                <p className="text-[10px] text-muted-foreground">Variáveis: <code>{"{tmdb_id}"}</code> <code>{"{imdb_id}"}</code> <code>{"{season}"}</code> <code>{"{episode}"}</code> <code>{"{slug}"}</code></p>
                <button onClick={addProvider} disabled={!newProvider.name || !newProvider.base_url}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  Adicionar Provedor
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedItem.content_type === "movie" ? <Film className="w-5 h-5 text-primary" /> : <Tv className="w-5 h-5 text-primary" />}
                  {selectedItem.title}
                  {selectedItem.tmdb_year && <span className="text-sm text-muted-foreground font-normal">({selectedItem.tmdb_year})</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-4">
                  {selectedItem.tmdb_poster && (
                    <img src={`${IMG_BASE}/w200${selectedItem.tmdb_poster}`} alt={selectedItem.title} className="w-28 h-auto rounded-lg" />
                  )}
                  <div className="flex-1 space-y-2 text-sm">
                    {selectedItem.synopsis && <p className="text-muted-foreground text-xs">{selectedItem.synopsis}</p>}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Tipo:</span> {selectedItem.content_type === "movie" ? "Filme" : "Série"}</div>
                      {selectedItem.season != null && <div><span className="text-muted-foreground">Temporada:</span> {selectedItem.season}</div>}
                      {selectedItem.episode != null && <div><span className="text-muted-foreground">Episódio:</span> {selectedItem.episode}</div>}
                      <div><span className="text-muted-foreground">Tamanho:</span> {formatSize(selectedItem.file_size)}</div>
                      <div><span className="text-muted-foreground">Duração:</span> {formatDuration(selectedItem.duration)}</div>
                      {selectedItem.resolution && <div><span className="text-muted-foreground">Resolução:</span> {selectedItem.resolution}</div>}
                      {selectedItem.tmdb_rating && <div><span className="text-muted-foreground">Nota:</span> ⭐ {Number(selectedItem.tmdb_rating).toFixed(1)}</div>}
                      {selectedItem.tmdb_id && <div><span className="text-muted-foreground">TMDB:</span> {selectedItem.tmdb_id}</div>}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{selectedItem.id}</div>
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  {playerUrl ? (
                    <a href={playerUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 w-full justify-center">
                      <Play className="w-4 h-4" /> Abrir no Player Nativo
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  ) : (
                    <button onClick={() => testPlayer(selectedItem)} disabled={extracting || !selectedItem.tmdb_id}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 w-full justify-center disabled:opacity-50">
                      {extracting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {extracting ? "Extraindo vídeo..." : "Testar Player"}
                    </button>
                  )}
                  {!selectedItem.tmdb_id && <p className="text-xs text-muted-foreground text-center mt-1">Sem dados TMDB — player indisponível</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TelegramPage;
