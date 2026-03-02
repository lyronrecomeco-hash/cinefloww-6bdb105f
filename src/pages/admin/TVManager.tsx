import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tv2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search, ExternalLink, Eye, RefreshCw, Clock, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TVChannel {
  id: string;
  name: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
  active: boolean;
  sort_order: number;
}

interface TVCategory {
  id: number;
  name: string;
  sort_order: number;
}

const SYNC_INTERVAL = 2 * 60 * 1000;
const VIEWER_INTERVAL = 10000;

const TVManager = () => {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [editChannel, setEditChannel] = useState<TVChannel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", image_url: "", stream_url: "", category: "Variedades", sort_order: 0 });
  const [watchingMap, setWatchingMap] = useState<Record<string, number>>({});
  const [totalWatching, setTotalWatching] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
  const [syncCountdown, setSyncCountdown] = useState(SYNC_INTERVAL / 1000);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Fetch viewers
  const fetchViewers = useCallback(async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("site_visitors")
      .select("pathname, visitor_id")
      .gte("visited_at", fiveMinAgo)
      .like("pathname", "/tv/%");
    if (!data) return;
    const map: Record<string, Set<string>> = {};
    const allVisitors = new Set<string>();
    for (const row of data) {
      const channelId = row.pathname?.replace("/tv/", "").split("?")[0];
      if (!channelId) continue;
      if (!map[channelId]) map[channelId] = new Set();
      map[channelId].add(row.visitor_id);
      allVisitors.add(row.visitor_id);
    }
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) counts[k] = v.size;
    setWatchingMap(counts);
    setTotalWatching(allVisitors.size);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [chRes, catRes] = await Promise.all([
      supabase.from("tv_channels").select("*").order("sort_order"),
      supabase.from("tv_categories").select("*").order("sort_order"),
    ]);
    setChannels((chRes.data as TVChannel[]) || []);
    setCategories((catRes.data as TVCategory[]) || []);
    setLoading(false);
  };

  const fetchSyncInfo = useCallback(async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "tv_last_sync")
      .maybeSingle();
    if (data?.value) {
      const v = data.value as any;
      if (v.ts) {
        const d = new Date(v.ts);
        setLastSync(d.toLocaleDateString("pt-BR") + ", " + d.toLocaleTimeString("pt-BR"));
        setLastSyncCount(v.channels || v.total_api || null);
      }
    }
  }, []);

  const runSync = useCallback(async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-tv-api");
      if (error) throw error;
      if (!silent) {
        toast({ title: `Sync concluído: ${data?.channels_upserted || 0} canais` });
      }
      await Promise.all([fetchData(), fetchSyncInfo()]);
      setSyncCountdown(SYNC_INTERVAL / 1000);
    } catch (err: any) {
      if (!silent) toast({ title: "Erro no sync", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [syncing, toast, fetchSyncInfo]);

  useEffect(() => { fetchData(); fetchSyncInfo(); }, [fetchSyncInfo]);

  useEffect(() => {
    fetchViewers();
    intervalRef.current = setInterval(fetchViewers, VIEWER_INTERVAL);
    const channel = supabase
      .channel("tv-viewers")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "site_visitors" }, (payload: any) => {
        if (payload.new?.pathname?.startsWith("/tv/")) fetchViewers();
      })
      .subscribe();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchViewers]);

  useEffect(() => {
    syncIntervalRef.current = setInterval(() => runSync(true), SYNC_INTERVAL);
    setSyncCountdown(SYNC_INTERVAL / 1000);
    countdownRef.current = setInterval(() => {
      setSyncCountdown(prev => (prev <= 1 ? SYNC_INTERVAL / 1000 : prev - 1));
    }, 1000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [runSync]);

  useEffect(() => {
    const channel = supabase
      .channel("tv-channels-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_channels" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filter by search + category
  const filtered = channels.filter(ch => {
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase()) || ch.id.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === "Todos" || ch.category === selectedCategory;
    return matchSearch && matchCat;
  });

  // Unique category names from channels
  const channelCategories = Array.from(new Set(channels.map(c => c.category).filter(Boolean))).sort();

  const toggleActive = async (ch: TVChannel) => {
    await supabase.from("tv_channels").update({ active: !ch.active }).eq("id", ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, active: !c.active } : c));
    toast({ title: ch.active ? "Canal desativado" : "Canal ativado" });
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Excluir este canal?")) return;
    await supabase.from("tv_channels").delete().eq("id", id);
    setChannels(prev => prev.filter(c => c.id !== id));
    toast({ title: "Canal excluído" });
  };

  const openEdit = (ch: TVChannel) => {
    setForm({ id: ch.id, name: ch.name, image_url: ch.image_url || "", stream_url: ch.stream_url, category: ch.category, sort_order: ch.sort_order });
    setEditChannel(ch);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ id: "", name: "", image_url: "", stream_url: "", category: "Variedades", sort_order: 0 });
    setEditChannel(null);
    setShowForm(true);
  };

  const saveChannel = async () => {
    if (!form.id || !form.name || !form.stream_url) {
      toast({ title: "Preencha ID, Nome e URL", variant: "destructive" });
      return;
    }
    if (editChannel) {
      await supabase.from("tv_channels").update({
        name: form.name, image_url: form.image_url || null, stream_url: form.stream_url, category: form.category, sort_order: form.sort_order,
      }).eq("id", editChannel.id);
      toast({ title: "Canal atualizado" });
    } else {
      await supabase.from("tv_channels").insert({
        id: form.id, name: form.name, image_url: form.image_url || null, stream_url: form.stream_url, category: form.category, sort_order: form.sort_order,
      });
      toast({ title: "Canal criado" });
    }
    setShowForm(false);
    fetchData();
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Tv2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display flex items-center gap-2">
              TV <span className="text-primary">LYNE</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            </h1>
            <p className="text-xs text-muted-foreground">
              {lastSyncCount || channels.length} canais da API • Última sync: {lastSync || "—"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => runSync(false)} disabled={syncing}
            className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium flex items-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sync
          </button>
          <button onClick={openNew} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-xl border border-white/10 p-4 text-center">
          <p className="text-3xl font-bold text-primary">{lastSyncCount || channels.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total API</p>
        </div>
        <div className="glass rounded-xl border border-white/10 p-4 text-center">
          <p className="text-3xl font-bold text-primary">{channelCategories.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Categorias</p>
        </div>
        <div className="glass rounded-xl border border-white/10 p-4 text-center">
          <p className="text-3xl font-bold text-green-500">{totalWatching}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Assistindo</p>
        </div>
        <div className="glass rounded-xl border border-white/10 p-4 text-center">
          <p className="text-lg font-bold">{syncing ? "Sync..." : formatCountdown(syncCountdown)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Próximo Sync</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar canal..."
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50" />
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
        <button
          onClick={() => setSelectedCategory("Todos")}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            selectedCategory === "Todos"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
          }`}
        >
          ✅ Todos
        </button>
        {channelCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{editChannel ? "Editar Canal" : "Novo Canal"}</h3>
            <div className="space-y-3">
              <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} disabled={!!editChannel}
                placeholder="ID (ex: sbt)" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm disabled:opacity-50" />
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome do canal" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <input value={form.stream_url} onChange={e => setForm(f => ({ ...f, stream_url: e.target.value }))}
                placeholder="URL do stream" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="URL da imagem (opcional)" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm">
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                placeholder="Ordem" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-white/5 text-sm hover:bg-white/10 transition-colors">Cancelar</button>
              <button onClick={saveChannel} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Channel Cards Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(ch => (
            <div key={ch.id} className="glass rounded-2xl border border-white/10 overflow-hidden group hover:border-white/20 transition-colors">
              {/* Image Area */}
              <div className="relative aspect-video bg-black/40 flex items-center justify-center">
                {ch.image_url ? (
                  <img src={ch.image_url} alt={ch.name} className="max-w-[50%] max-h-[50%] object-contain" />
                ) : (
                  <Tv2 className="w-10 h-10 text-muted-foreground/30" />
                )}
                {/* LIVE badge */}
                {(watchingMap[ch.id] || 0) > 0 && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                    🔴 LIVE
                  </span>
                )}
                {!ch.active && (
                  <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-yellow-600/80 text-white text-[10px] font-bold">
                    INATIVO
                  </span>
                )}
                {/* Hover Actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => window.open(`/tv/${ch.id}`, "_blank")} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors" title="Assistir">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(ch)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(ch)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors" title="Ativar/Desativar">
                    {ch.active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4 text-yellow-400" />}
                  </button>
                  <button onClick={() => deleteChannel(ch.id)} className="p-2 rounded-full bg-white/10 hover:bg-destructive/60 transition-colors" title="Excluir">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
              {/* Info */}
              <div className="p-3">
                <p className="font-medium text-sm truncate">{ch.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{ch.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <p className="text-center text-muted-foreground py-10 text-sm">Nenhum canal encontrado.</p>
      )}
    </div>
  );
};

export default TVManager;
