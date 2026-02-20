import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot, Settings, Hash, Send, RefreshCw, Loader2, CheckCircle, XCircle,
  MessageSquare, BarChart3, Zap, Plus, Volume2, Globe, Bell, Trash2
} from "lucide-react";
import { toast } from "sonner";

interface DiscordConfig {
  id: string;
  guild_id: string | null;
  notification_channel_id: string | null;
  bot_status: string;
  auto_notify_new_content: boolean;
  welcome_message: string | null;
  site_url: string | null;
}

interface BotLog {
  id: string;
  event: string;
  details: string | null;
  guild_id: string | null;
  channel_id: string | null;
  user_tag: string | null;
  created_at: string;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  member_count?: number;
}

interface Channel {
  id: string;
  name: string;
  topic: string | null;
}

const EVENT_ICONS: Record<string, { icon: any; color: string }> = {
  command_lyne: { icon: MessageSquare, color: "text-blue-400" },
  command_lancamentos: { icon: BarChart3, color: "text-emerald-400" },
  command_stats: { icon: BarChart3, color: "text-purple-400" },
  commands_registered: { icon: Zap, color: "text-yellow-400" },
  message_sent: { icon: Send, color: "text-cyan-400" },
  channel_created: { icon: Hash, color: "text-green-400" },
  new_content_notified: { icon: Bell, color: "text-orange-400" },
};

const DiscordBotPage = () => {
  const [config, setConfig] = useState<DiscordConfig | null>(null);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"config" | "logs" | "tools">("config");

  // New channel form
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelTopic, setNewChannelTopic] = useState("");

  // Send message form
  const [msgChannelId, setMsgChannelId] = useState("");
  const [msgContent, setMsgContent] = useState("");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  const invokeBot = useCallback(async (action: string, params?: Record<string, string>, body?: unknown) => {
    const queryStr = new URLSearchParams({ action, ...params }).toString();
    const url = `https://${projectId}.supabase.co/functions/v1/discord-bot?${queryStr}`;
    const opts: RequestInit = {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }, [projectId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Config
      const { data: cfgData } = await supabase.from("discord_config").select("*").limit(1).single();
      if (cfgData) {
        setConfig(cfgData as unknown as DiscordConfig);
      } else {
        // Create default config
        const { data: newCfg } = await supabase.from("discord_config").insert({}).select().single();
        if (newCfg) setConfig(newCfg as unknown as DiscordConfig);
      }

      // Logs
      const { data: logsData } = await supabase
        .from("discord_bot_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (logsData) setLogs(logsData as unknown as BotLog[]);

      // Bot info
      try {
        const info = await invokeBot("bot_info");
        if (info.success) setBotInfo(info.bot);
      } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [invokeBot]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime logs
  useEffect(() => {
    const ch = supabase
      .channel("discord-logs-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "discord_bot_logs" }, (payload) => {
        setLogs((prev) => [payload.new as unknown as BotLog, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const loadGuilds = async () => {
    setActionLoading("guilds");
    try {
      const res = await invokeBot("get_guilds");
      if (res.success) setGuilds(res.guilds);
      else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const loadChannels = async (guildId: string) => {
    setActionLoading("channels");
    try {
      const res = await invokeBot("get_channels", { guild_id: guildId });
      if (res.success) setChannels(res.channels);
      else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const registerCommands = async () => {
    setActionLoading("register");
    try {
      const res = await invokeBot("register_commands");
      if (res.success) {
        toast.success(`${res.count} comandos registrados!`);
        fetchData();
      } else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const updateConfig = async (updates: Partial<DiscordConfig>) => {
    if (!config) return;
    const { error } = await supabase.from("discord_config").update(updates as any).eq("id", config.id);
    if (error) { toast.error(error.message); return; }
    setConfig({ ...config, ...updates });
    toast.success("Configuração atualizada!");
  };

  const createChannel = async () => {
    if (!config?.guild_id || !newChannelName) return;
    setActionLoading("create_channel");
    try {
      const res = await invokeBot("create_channel", {}, {
        guild_id: config.guild_id,
        name: newChannelName.toLowerCase().replace(/\s+/g, "-"),
        topic: newChannelTopic,
      });
      if (res.success) {
        toast.success(`Canal #${res.channel.name} criado!`);
        setNewChannelName("");
        setNewChannelTopic("");
        if (config.guild_id) loadChannels(config.guild_id);
      } else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const sendMessage = async () => {
    if (!msgChannelId || !msgContent) return;
    setActionLoading("send_msg");
    try {
      const res = await invokeBot("send_message", {}, { channel_id: msgChannelId, content: msgContent });
      if (res.success) {
        toast.success("Mensagem enviada!");
        setMsgContent("");
        fetchData();
      } else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const sendRelease = async () => {
    setActionLoading("send_release");
    try {
      const res = await invokeBot("send_release");
      if (res.success) {
        toast.success(`Lançamento "${res.title}" enviado!`);
        fetchData();
      } else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const sendDailyTemplate = async () => {
    setActionLoading("send_template");
    try {
      const res = await invokeBot("send_daily_template");
      if (res.success) {
        toast.success("Template diário enviado!");
        fetchData();
      } else toast.error(res.error);
    } catch (e) { toast.error(String(e)); }
    finally { setActionLoading(null); }
  };

  const clearLogs = async () => {
    await supabase.from("discord_bot_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setLogs([]);
    toast.success("Logs limpos!");
  };

  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/discord-bot`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#5865F2]" /> Bot Discord
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerenciamento completo do bot Discord</p>
        </div>
        {botInfo && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20">
            {botInfo.avatar && (
              <img
                src={`https://cdn.discordapp.com/avatars/${botInfo.id}/${botInfo.avatar}.png?size=32`}
                className="w-6 h-6 rounded-full"
                alt=""
              />
            )}
            <span className="text-sm font-medium text-[#5865F2]">{botInfo.username}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
        {[
          { key: "config" as const, label: "Configuração", icon: Settings },
          { key: "tools" as const, label: "Ferramentas", icon: Zap },
          { key: "logs" as const, label: "Logs", icon: MessageSquare },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Config Tab */}
      {tab === "config" && (
        <div className="space-y-4">
          {/* Webhook URL */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Globe className="w-4 h-4" /> Webhook URL
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure esta URL como Interactions Endpoint URL no Discord Developer Portal.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada!"); }}
                className="px-4 h-10 rounded-xl bg-primary/15 text-primary border border-primary/20 text-sm font-medium hover:bg-primary/25 transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>

          {/* Guild / Server */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Volume2 className="w-4 h-4" /> Servidor
            </h3>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Guild ID</label>
                <input
                  value={config?.guild_id || ""}
                  onChange={(e) => setConfig(config ? { ...config, guild_id: e.target.value } : null)}
                  placeholder="ID do servidor Discord"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <button
                onClick={() => updateConfig({ guild_id: config?.guild_id })}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={loadGuilds}
                disabled={actionLoading === "guilds"}
                className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
              >
                {actionLoading === "guilds" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar Servidores"}
              </button>
            </div>
            {guilds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {guilds.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => { updateConfig({ guild_id: g.id }); loadChannels(g.id); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                      config?.guild_id === g.id
                        ? "bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/20"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {g.icon && (
                      <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=24`} className="w-5 h-5 rounded-full" alt="" />
                    )}
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notification Channel */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Bell className="w-4 h-4" /> Canal de Notificações
            </h3>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Channel ID</label>
                <input
                  value={config?.notification_channel_id || ""}
                  onChange={(e) => setConfig(config ? { ...config, notification_channel_id: e.target.value } : null)}
                  placeholder="ID do canal para notificações"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <button
                onClick={() => updateConfig({ notification_channel_id: config?.notification_channel_id })}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                Salvar
              </button>
              {config?.guild_id && (
                <button
                  onClick={() => loadChannels(config.guild_id!)}
                  disabled={actionLoading === "channels"}
                  className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
                >
                  {actionLoading === "channels" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Listar Canais"}
                </button>
              )}
            </div>
            {channels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {channels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      updateConfig({ notification_channel_id: c.id });
                      setMsgChannelId(c.id);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${
                      config?.notification_channel_id === c.id
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" /> {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="glass-strong rounded-2xl p-5 space-y-4">
            <h3 className="font-display font-bold">Opções</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Notificar novos conteúdos</p>
                <p className="text-xs text-muted-foreground">Enviar automaticamente quando novo filme/série for adicionado</p>
              </div>
              <button
                onClick={() => updateConfig({ auto_notify_new_content: !config?.auto_notify_new_content })}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  config?.auto_notify_new_content ? "bg-emerald-500" : "bg-white/20"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${
                  config?.auto_notify_new_content ? "left-6" : "left-0.5"
                }`} />
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL do Site</label>
              <div className="flex gap-2">
                <input
                  value={config?.site_url || ""}
                  onChange={(e) => setConfig(config ? { ...config, site_url: e.target.value } : null)}
                  className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                />
                <button
                  onClick={() => updateConfig({ site_url: config?.site_url })}
                  className="h-10 px-4 rounded-xl bg-primary/15 text-primary border border-primary/20 text-sm font-medium"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tools Tab */}
      {tab === "tools" && (
        <div className="space-y-4">
          {/* Register Commands */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Zap className="w-4 h-4" /> Registrar Comandos
            </h3>
            <p className="text-xs text-muted-foreground">
              Registra os slash commands (/lyne, /lancamentos, /stats) no Discord.
            </p>
            <button
              onClick={registerCommands}
              disabled={actionLoading === "register"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865F2] text-white font-medium text-sm hover:bg-[#4752C4] transition-colors disabled:opacity-50"
            >
              {actionLoading === "register" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Registrar Slash Commands
            </button>
          </div>

          {/* Create Channel */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Criar Canal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nome do Canal</label>
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="lancamentos"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tópico (opcional)</label>
                <input
                  value={newChannelTopic}
                  onChange={(e) => setNewChannelTopic(e.target.value)}
                  placeholder="Novos lançamentos do catálogo"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                />
              </div>
            </div>
            <button
              onClick={createChannel}
              disabled={actionLoading === "create_channel" || !config?.guild_id || !newChannelName}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              {actionLoading === "create_channel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
              Criar Canal
            </button>
          </div>

          {/* Send Message */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              <Send className="w-4 h-4" /> Enviar Mensagem
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Canal</label>
                {channels.length > 0 ? (
                  <select
                    value={msgChannelId}
                    onChange={(e) => setMsgChannelId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                  >
                    <option value="">Selecione um canal</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={msgChannelId}
                    onChange={(e) => setMsgChannelId(e.target.value)}
                    placeholder="Channel ID"
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mensagem</label>
                <textarea
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  rows={3}
                  placeholder="Digite a mensagem..."
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm resize-none"
                />
              </div>
            </div>
            <button
              onClick={sendMessage}
              disabled={actionLoading === "send_msg" || !msgChannelId || !msgContent}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/20 font-medium text-sm hover:bg-[#5865F2]/25 transition-colors disabled:opacity-50"
            >
              {actionLoading === "send_msg" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </button>
          </div>
          {/* Send Release Notification */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              🔥 Enviar Lançamento
            </h3>
            <p className="text-xs text-muted-foreground">
              Envia o último conteúdo adicionado ao catálogo com texto persuasivo e link direto.
            </p>
            <button
              onClick={sendRelease}
              disabled={actionLoading === "send_release"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
            >
              {actionLoading === "send_release" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar Lançamento Agora
            </button>
          </div>

          {/* Send Daily Template */}
          <div className="glass-strong rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2">
              💡 Template Diário
            </h3>
            <p className="text-xs text-muted-foreground">
              Envia uma mensagem aleatória tipo "Sabia que na LyneFlix..." ou "Saboor, meme do Toguro".
            </p>
            <button
              onClick={sendDailyTemplate}
              disabled={actionLoading === "send_template"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium text-sm hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {actionLoading === "send_template" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              Enviar Template Agora
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold">Logs do Bot</h3>
            <div className="flex gap-2">
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar
              </button>
              <button
                onClick={clearLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum log registrado ainda.
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => {
                const ev = EVENT_ICONS[log.event] || { icon: MessageSquare, color: "text-muted-foreground" };
                const Icon = ev.icon;
                const time = new Date(log.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${ev.color}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{log.event}</span>
                      {log.details && <span className="text-xs text-muted-foreground ml-2">{log.details}</span>}
                      {log.user_tag && <span className="text-xs text-blue-400 ml-2">@{log.user_tag}</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{time}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiscordBotPage;
