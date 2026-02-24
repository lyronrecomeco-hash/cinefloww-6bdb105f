import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save, Loader2, Users, RefreshCw, Zap, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const [siteName, setSiteName] = useState("Cineflow");
  const [siteDescription, setSiteDescription] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [watchTogetherEnabled, setWatchTogetherEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMode, setRefreshMode] = useState<string>("expiring");
  const [refreshProgress, setRefreshProgress] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const { toast } = useToast();

  const fetchCacheStats = useCallback(async () => {
    const { data } = await supabase.rpc("get_unresolved_content", { batch_limit: 1 });
    const { count: totalCache } = await supabase.from("video_cache").select("id", { count: "exact", head: true });
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { count: expiring } = await supabase.from("video_cache").select("id", { count: "exact", head: true }).lt("expires_at", soon);
    const { count: iframeProxy } = await supabase.from("video_cache").select("id", { count: "exact", head: true }).eq("video_type", "iframe-proxy");
    setCacheStats({ total: totalCache || 0, expiring: expiring || 0, iframeProxy: iframeProxy || 0 });
  }, []);

  const fetchRefreshProgress = useCallback(async () => {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "refresh_links_progress").maybeSingle();
    if (data?.value) setRefreshProgress(data.value);
  }, []);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("site_settings").select("*");
      if (data) {
        data.forEach((s: any) => {
          if (s.key === "site_name") setSiteName(s.value?.value || "Cineflow");
          if (s.key === "site_description") setSiteDescription(s.value?.value || "");
          if (s.key === "maintenance_mode") setMaintenanceMode(s.value?.value || false);
          if (s.key === "watch_together_enabled") setWatchTogetherEnabled(s.value?.value ?? false);
        });
      }
      setLoading(false);
    };
    fetch();
    fetchCacheStats();
    fetchRefreshProgress();
  }, [fetchCacheStats, fetchRefreshProgress]);

  // Poll refresh progress while refreshing
  useEffect(() => {
    if (!refreshing) return;
    const interval = setInterval(async () => {
      await fetchRefreshProgress();
      const { data } = await supabase.from("site_settings").select("value").eq("key", "refresh_links_progress").maybeSingle();
      if ((data?.value as any)?.done) {
        setRefreshing(false);
        fetchCacheStats();
        toast({ title: "Atualização concluída!" });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshing, fetchRefreshProgress, fetchCacheStats, toast]);

  const startRefresh = async () => {
    setRefreshing(true);
    const sessionId = crypto.randomUUID().slice(0, 8);
    try {
      const { error } = await supabase.functions.invoke("refresh-links", {
        body: { mode: refreshMode, batch_size: 1000, session_id: sessionId },
      });
      if (error) throw error;
      toast({ title: "Atualização iniciada", description: `Modo: ${refreshMode}` });
      fetchRefreshProgress();
    } catch (err: any) {
      setRefreshing(false);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = [
        { key: "site_name", value: { value: siteName } },
        { key: "site_description", value: { value: siteDescription } },
        { key: "maintenance_mode", value: { value: maintenanceMode } },
        { key: "watch_together_enabled", value: { value: watchTogetherEnabled } },
      ];

      for (const s of settings) {
        const { data: existing } = await supabase.from("site_settings").select("id").eq("key", s.key).maybeSingle();
        if (existing) {
          await supabase.from("site_settings").update({ value: s.value }).eq("key", s.key);
        } else {
          await supabase.from("site_settings").insert(s);
        }
      }

      toast({ title: "Configurações salvas!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurações gerais do site</p>
      </div>

      <div className="glass p-6 space-y-5 max-w-2xl">
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Nome do Site</label>
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Descrição</label>
          <textarea
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <div>
            <p className="text-sm font-medium">Modo Manutenção</p>
            <p className="text-xs text-muted-foreground mt-0.5">Desabilita o acesso público ao site</p>
          </div>
          <button
            onClick={() => setMaintenanceMode(!maintenanceMode)}
            className={`w-11 h-6 rounded-full transition-colors relative ${maintenanceMode ? "bg-primary" : "bg-white/10"}`}
          >
            <div className={`w-4.5 h-4.5 rounded-full bg-white absolute top-[3px] transition-all ${maintenanceMode ? "left-[22px]" : "left-[3px]"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Watch Together (Assistir Junto)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Exibe o botão de assistir junto nas páginas de detalhe</p>
            </div>
          </div>
          <button
            onClick={() => setWatchTogetherEnabled(!watchTogetherEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${watchTogetherEnabled ? "bg-primary" : "bg-white/10"}`}
          >
            <div className={`w-4.5 h-4.5 rounded-full bg-white absolute top-[3px] transition-all ${watchTogetherEnabled ? "left-[22px]" : "left-[3px]"}`} />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
      </div>

      {/* Refresh Links Section */}
      <div className="glass p-6 space-y-5 max-w-2xl">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Atualização de Links</h2>
        </div>
        <p className="text-xs text-muted-foreground">Puxa links atualizados das fontes para substituir links expirados ou quebrados.</p>

        {/* Cache stats */}
        {cacheStats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <p className="text-lg font-bold font-display">{cacheStats.total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Links no cache</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/10 text-center">
              <p className="text-lg font-bold font-display text-amber-400">{cacheStats.expiring.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Expirando em 24h</p>
            </div>
            <div className="p-3 rounded-xl bg-orange-400/5 border border-orange-400/10 text-center">
              <p className="text-lg font-bold font-display text-orange-400">{cacheStats.iframeProxy.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Iframe-proxy</p>
            </div>
          </div>
        )}

        {/* Mode selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Modo de atualização</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "expiring", label: "Expirando", icon: Clock, desc: "Links que vencem em 24h" },
              { id: "iframe-proxy", label: "Iframe-Proxy", icon: AlertTriangle, desc: "Substituir por link direto" },
              { id: "old", label: "Antigos", icon: RefreshCw, desc: "Links com +3 dias" },
              { id: "all", label: "Todos", icon: Zap, desc: "Atualizar tudo (mais lento)" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setRefreshMode(m.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  refreshMode === m.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <m.icon className={`w-3.5 h-3.5 ${refreshMode === m.id ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{m.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        {refreshProgress && !refreshProgress.done && (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-mono text-xs">{refreshProgress.processed || 0}/{refreshProgress.total || "?"}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${refreshProgress.total ? (refreshProgress.processed / refreshProgress.total * 100) : 0}%` }}
              />
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              <span>✅ {refreshProgress.updated || 0} atualizados</span>
              <span>❌ {refreshProgress.failed || 0} falhas</span>
            </div>
          </div>
        )}

        {refreshProgress?.done && (
          <div className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10 text-xs text-emerald-400">
            ✅ Última execução: {refreshProgress.updated || 0} atualizados, {refreshProgress.failed || 0} falhas
            {refreshProgress.elapsed_seconds && ` em ${refreshProgress.elapsed_seconds}s`}
          </div>
        )}

        <button
          onClick={startRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshing ? "Atualizando..." : "Iniciar Atualização"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
