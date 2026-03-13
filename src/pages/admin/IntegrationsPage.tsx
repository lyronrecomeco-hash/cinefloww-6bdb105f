import { useState, useEffect } from "react";
import {
  Smartphone, Settings, Bell, Shield, Download, BarChart3,
  Users, Clock, Activity, AlertTriangle, Send, Upload,
  Power, Eye, RefreshCw, Wifi, WifiOff, ChevronRight,
  ToggleLeft, ToggleRight, FileText, Megaphone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TabKey = "dashboard" | "manutencao" | "atualizacao" | "notificacoes" | "download_page";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "manutencao", label: "Manutenção", icon: <Shield className="w-4 h-4" /> },
  { key: "atualizacao", label: "Atualização", icon: <Download className="w-4 h-4" /> },
  { key: "notificacoes", label: "Notificações", icon: <Bell className="w-4 h-4" /> },
  { key: "download_page", label: "Página Download", icon: <Smartphone className="w-4 h-4" /> },
];

const IntegrationsPage = () => {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display">Aplicativo</h1>
          <p className="text-xs text-muted-foreground">Painel de gerenciamento do app Android</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <TabDashboard />}
      {tab === "manutencao" && <TabManutencao />}
      {tab === "atualizacao" && <TabAtualizacao />}
      {tab === "notificacoes" && <TabNotificacoes />}
    </div>
  );
};

/* ─── Dashboard ─── */
const TabDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    totalContent: 0,
    appVersion: "1.0.0",
  });
  const [recentAccess, setRecentAccess] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [profilesRes, contentRes, visitorsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("content").select("id", { count: "exact", head: true }),
        supabase.from("site_visitors")
          .select("visitor_id, visited_at, user_agent, pathname")
          .order("visited_at", { ascending: false })
          .limit(20),
      ]);

      const today = new Date().toISOString().split("T")[0];
      const todayVisitors = visitorsRes.data?.filter(
        (v) => v.visited_at?.startsWith(today)
      ) || [];

      // Get app version from settings
      const versionRes = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "app_version")
        .maybeSingle();

      setStats({
        totalUsers: profilesRes.count || 0,
        activeToday: new Set(todayVisitors.map((v) => v.visitor_id)).size,
        totalContent: contentRes.count || 0,
        appVersion: (versionRes.data?.value as any)?.version || "1.0.0",
      });

      setRecentAccess(visitorsRes.data?.slice(0, 10) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Users className="w-5 h-5" />}
          label="Usuários"
          value={stats.totalUsers}
          color="text-blue-400"
          bg="bg-blue-400/10"
        />
        <MetricCard
          icon={<Activity className="w-5 h-5" />}
          label="Ativos Hoje"
          value={stats.activeToday}
          color="text-green-400"
          bg="bg-green-400/10"
        />
        <MetricCard
          icon={<Eye className="w-5 h-5" />}
          label="Conteúdos"
          value={stats.totalContent}
          color="text-purple-400"
          bg="bg-purple-400/10"
        />
        <MetricCard
          icon={<Smartphone className="w-5 h-5" />}
          label="Versão App"
          value={stats.appVersion}
          color="text-primary"
          bg="bg-primary/10"
        />
      </div>

      {/* Status do App */}
      <SectionCard title="Status do Aplicativo" icon={<Wifi className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatusItem label="Servidor API" status="online" />
          <StatusItem label="Catálogo" status="online" />
          <StatusItem label="Autenticação" status="online" />
        </div>
      </SectionCard>

      {/* Últimos Acessos */}
      <SectionCard title="Últimos Acessos" icon={<Clock className="w-4 h-4" />}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : recentAccess.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem acessos recentes</p>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {recentAccess.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-foreground font-mono truncate max-w-[200px]">
                    {item.visitor_id?.slice(0, 12)}...
                  </span>
                </div>
                <span className="text-muted-foreground truncate max-w-[120px]">
                  {item.pathname || "/"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(item.visited_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

/* ─── Manutenção ─── */
const TabManutencao = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Estamos realizando uma manutenção programada. Voltamos em breve!");
  const [estimatedTime, setEstimatedTime] = useState("30");
  const [blockAccess, setBlockAccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMaintenanceConfig();
  }, []);

  const loadMaintenanceConfig = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "app_maintenance")
      .maybeSingle();

    if (data?.value) {
      const config = data.value as any;
      setEnabled(config.enabled || false);
      setMessage(config.message || "");
      setEstimatedTime(config.estimated_minutes?.toString() || "30");
      setBlockAccess(config.block_access || false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled,
        message,
        estimated_minutes: parseInt(estimatedTime) || 30,
        block_access: blockAccess,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .eq("key", "app_maintenance")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("site_settings")
          .update({ value: payload as any })
          .eq("key", "app_maintenance");
      } else {
        await supabase
          .from("site_settings")
          .insert({ key: "app_maintenance", value: payload as any });
      }

      toast.success(enabled ? "Manutenção ativada!" : "Manutenção desativada!");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Modo Manutenção"
        icon={<AlertTriangle className="w-4 h-4" />}
      >
        <div className="space-y-4">
          {/* Toggle principal */}
          <div
            className="flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all"
            style={{
              borderColor: enabled ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)",
              backgroundColor: enabled ? "rgba(239,68,68,0.05)" : "transparent",
            }}
            onClick={() => setEnabled(!enabled)}
          >
            <div className="flex items-center gap-3">
              <Power className={`w-5 h-5 ${enabled ? "text-red-400" : "text-muted-foreground"}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {enabled ? "Manutenção ATIVA" : "Manutenção Desativada"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {enabled
                    ? "O app está exibindo a tela de manutenção"
                    : "O app está funcionando normalmente"}
                </p>
              </div>
            </div>
            {enabled ? (
              <ToggleRight className="w-8 h-8 text-red-400" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          {/* Mensagem */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
              Mensagem de manutenção
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/40"
              placeholder="Mensagem exibida no app durante manutenção..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tempo estimado */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                Tempo estimado (minutos)
              </label>
              <input
                type="number"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40"
                min="1"
              />
            </div>

            {/* Bloquear acesso */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                Bloquear acesso
              </label>
              <div
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer"
                onClick={() => setBlockAccess(!blockAccess)}
              >
                {blockAccess ? (
                  <ToggleRight className="w-6 h-6 text-red-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                )}
                <span className="text-sm text-foreground">
                  {blockAccess ? "Acesso bloqueado" : "Apenas aviso"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-semibold text-sm transition-all border border-primary/20 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Configuração"}
          </button>
        </div>
      </SectionCard>

      {/* Preview */}
      {enabled && (
        <SectionCard title="Preview no App" icon={<Eye className="w-4 h-4" />}>
          <div className="bg-[#0A0D16] rounded-2xl p-8 border border-white/10 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">Manutenção em andamento</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">{message}</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/20">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-yellow-400 font-medium">
                Previsão: {estimatedTime} min
              </span>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

/* ─── Atualização ─── */
const TabAtualizacao = () => {
  const [currentVersion, setCurrentVersion] = useState("1.0.0");
  const [newVersion, setNewVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUpdateConfig();
  }, []);

  const loadUpdateConfig = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "app_update")
      .maybeSingle();

    if (data?.value) {
      const config = data.value as any;
      setCurrentVersion(config.current_version || "1.0.0");
      setNewVersion(config.new_version || "");
      setReleaseNotes(config.release_notes || "");
      setForceUpdate(config.force_update || false);
      setApkUrl(config.apk_url || "");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".apk")) {
      toast.error("Selecione um arquivo .apk");
      return;
    }
    setApkFile(file);
  };

  const uploadApk = async (): Promise<string | null> => {
    if (!apkFile) return apkUrl || null;

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileName = `lyneflix-v${newVersion || "latest"}.apk`;
      const filePath = `apk/${fileName}`;

      // Simular progresso visual
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const { error } = await supabase.storage
        .from("catalog")
        .upload(filePath, apkFile, { upsert: true });

      clearInterval(progressInterval);

      if (error) throw error;

      setUploadProgress(100);

      const { data: urlData } = supabase.storage
        .from("catalog")
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err: any) {
      toast.error("Erro ao enviar APK: " + (err.message || ""));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const publishUpdate = async () => {
    if (!newVersion.trim()) {
      toast.error("Informe a nova versão");
      return;
    }
    if (!apkFile && !apkUrl) {
      toast.error("Selecione o arquivo APK");
      return;
    }

    setSaving(true);
    try {
      const uploadedUrl = await uploadApk();
      if (!uploadedUrl) {
        setSaving(false);
        return;
      }

      const payload = {
        current_version: newVersion,
        new_version: newVersion,
        min_version: forceUpdate ? newVersion : currentVersion,
        release_notes: releaseNotes,
        force_update: forceUpdate,
        apk_url: uploadedUrl,
        published_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .eq("key", "app_update")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("site_settings")
          .update({ value: payload as any })
          .eq("key", "app_update");
      } else {
        await supabase
          .from("site_settings")
          .insert({ key: "app_update", value: payload as any });
      }

      setCurrentVersion(newVersion);
      setApkUrl(uploadedUrl);
      setApkFile(null);
      toast.success("Atualização publicada com sucesso!");
    } catch {
      toast.error("Erro ao publicar atualização");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info atual */}
      <SectionCard title="Versão Atual" icon={<Smartphone className="w-4 h-4" />}>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
            <span className="text-2xl font-black text-primary">v</span>
          </div>
          <div>
            <p className="text-2xl font-black text-foreground">{currentVersion}</p>
            <p className="text-xs text-muted-foreground">Versão instalada nos dispositivos</p>
          </div>
        </div>
      </SectionCard>

      {/* Nova versão */}
      <SectionCard title="Publicar Atualização" icon={<Upload className="w-4 h-4" />}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                Nova versão
              </label>
              <input
                type="text"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder="ex: 1.1.0"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
                Arquivo APK
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".apk"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="apk-upload"
                />
                <label
                  htmlFor="apk-upload"
                  className="flex items-center gap-3 w-full bg-white/5 border border-white/10 border-dashed rounded-xl px-3 py-3 text-sm cursor-pointer hover:bg-white/10 hover:border-primary/30 transition-all"
                >
                  <Upload className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground truncate">
                    {apkFile ? apkFile.name : apkUrl ? `✓ ${apkUrl.split('/').pop()}` : "Selecionar arquivo .apk"}
                  </span>
                </label>
                {uploading && (
                  <div className="mt-2 w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
              Notas da versão
            </label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={3}
              placeholder="O que há de novo nesta versão..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/40"
            />
          </div>

          {/* Forçar */}
          <div
            className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer"
            onClick={() => setForceUpdate(!forceUpdate)}
          >
            <div>
              <p className="text-sm font-medium text-foreground">Forçar atualização</p>
              <p className="text-[11px] text-muted-foreground">
                Impede o uso do app até que o usuário atualize
              </p>
            </div>
            {forceUpdate ? (
              <ToggleRight className="w-7 h-7 text-red-400" />
            ) : (
              <ToggleLeft className="w-7 h-7 text-muted-foreground" />
            )}
          </div>

          <button
            onClick={publishUpdate}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold text-sm transition-all border border-green-500/20 disabled:opacity-50"
          >
            {saving ? "Publicando..." : "Publicar Atualização"}
          </button>
        </div>
      </SectionCard>

      {/* Preview do modal */}
      {newVersion && (
        <SectionCard title="Preview do Modal" icon={<Eye className="w-4 h-4" />}>
          <div className="bg-[#0A0D16] rounded-2xl p-6 border border-white/10 text-center space-y-4 max-w-sm mx-auto">
            <Download className="w-10 h-10 text-primary mx-auto" />
            <h3 className="text-base font-bold text-white">Nova versão disponível!</h3>
            <p className="text-xs text-gray-400">
              Versão {newVersion} já está disponível para download.
            </p>
            {releaseNotes && (
              <div className="text-left bg-white/5 rounded-xl p-3 border border-white/5">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Novidades</p>
                <p className="text-xs text-gray-300 whitespace-pre-wrap">{releaseNotes}</p>
              </div>
            )}
            <div className="space-y-2">
              <div className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">
                Atualizar Agora
              </div>
              {!forceUpdate && (
                <div className="w-full py-2 text-xs text-muted-foreground">
                  Depois
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

/* ─── Notificações ─── */
const TabNotificacoes = () => {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all" | "topic">("all");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "app_notification_history")
      .maybeSingle();

    if (data?.value && Array.isArray(data.value)) {
      setHistory(data.value as any[]);
    }
  };

  const sendNotification = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }

    setSending(true);
    try {
      const entry = {
        title,
        body,
        target: targetType,
        sent_at: new Date().toISOString(),
      };

      const newHistory = [entry, ...history].slice(0, 50);

      const { data: existing } = await supabase
        .from("site_settings")
        .select("id")
        .eq("key", "app_notification_history")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("site_settings")
          .update({ value: newHistory as any })
          .eq("key", "app_notification_history");
      } else {
        await supabase
          .from("site_settings")
          .insert({ key: "app_notification_history", value: newHistory as any });
      }

      setHistory(newHistory);
      setTitle("");
      setBody("");
      toast.success("Notificação registrada! Integre com FCM para disparo real.");
    } catch {
      toast.error("Erro ao salvar notificação");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Enviar Notificação" icon={<Send className="w-4 h-4" />}>
        <div className="space-y-4">
          {/* Destino */}
          <div className="flex gap-2">
            {(["all", "topic"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTargetType(t)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all border ${
                  targetType === t
                    ? "bg-primary/15 text-primary border-primary/20"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"
                }`}
              >
                {t === "all" ? "Todos os Usuários" : "Por Tópico"}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Novo conteúdo disponível!"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/40"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">
              Mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Corpo da notificação push..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/40"
            />
          </div>

          <button
            onClick={sendNotification}
            disabled={sending}
            className="w-full py-3 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-semibold text-sm transition-all border border-primary/20 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar Notificação"}
          </button>

          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400">
              ℹ️ As notificações ficam registradas aqui. Integre com Firebase Cloud Messaging no app para disparo real aos dispositivos.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Preview */}
      {(title || body) && (
        <SectionCard title="Preview" icon={<Megaphone className="w-4 h-4" />}>
          <div className="bg-[#0A0D16] rounded-2xl p-4 border border-white/10 max-w-sm mx-auto">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">LyneFlix</p>
                <p className="text-sm font-semibold text-white truncate">{title || "Título"}</p>
                <p className="text-xs text-gray-400 line-clamp-2">{body || "Mensagem..."}</p>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">agora</span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Histórico */}
      <SectionCard title="Histórico" icon={<FileText className="w-4 h-4" />}>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma notificação enviada ainda
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {history.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/5"
              >
                <Bell className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.body}</p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {new Date(item.sent_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

/* ─── Componentes auxiliares ─── */

const SectionCard = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-5">
    <div className="flex items-center gap-2 mb-4">
      <span className="text-primary">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

const MetricCard = ({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) => (
  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-black text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  </div>
);

const StatusItem = ({
  label,
  status,
}: {
  label: string;
  status: "online" | "offline" | "warning";
}) => {
  const colors = {
    online: { dot: "bg-green-400", text: "text-green-400", label: "Online" },
    offline: { dot: "bg-red-400", text: "text-red-400", label: "Offline" },
    warning: { dot: "bg-yellow-400", text: "text-yellow-400", label: "Alerta" },
  };
  const c = colors[status];
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${c.dot} animate-pulse`} />
        <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
      </div>
    </div>
  );
};

export default IntegrationsPage;
