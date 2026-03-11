import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Save, RefreshCw, Plus, Trash2, Clock, Image, MessageSquare, Users, ExternalLink, Bot, Hash, Bell, ToggleLeft, ToggleRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import welcomeBanner from "@/assets/lyneflix-welcome-banner.jpg";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ScheduledMessage {
  id: string;
  message: string;
  interval_hours: number;
  enabled: boolean;
  image_url?: string;
}

interface ChannelConfig {
  id?: string;
  channel_id: string;
  channel_username: string;
  bot_username: string;
  welcome_enabled: boolean;
  welcome_message: string;
  welcome_image_url: string;
  scheduled_messages: ScheduledMessage[];
  auto_notify_new_content: boolean;
}

const DEFAULT_CONFIG: ChannelConfig = {
  channel_id: "",
  channel_username: "@lyneflix_ofc",
  bot_username: "",
  welcome_enabled: true,
  welcome_message: "🎬 Bem-vindo ao canal oficial da *LyneFlix*! 🍿\n\n✨ Aqui você fica por dentro de todos os lançamentos, novidades e dicas.\n\n🔗 Acesse: https://lyneflix.online\n\n📱 Ative as notificações para não perder nada!",
  welcome_image_url: "",
  scheduled_messages: [],
  auto_notify_new_content: false,
};

const TelegramChannelTab = () => {
  const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [testingWelcome, setTestingWelcome] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("telegram_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setConfig({
        id: data.id,
        channel_id: data.channel_id || "",
        channel_username: data.channel_username || "",
        bot_username: data.bot_username || "",
        welcome_enabled: data.welcome_enabled,
        welcome_message: data.welcome_message || DEFAULT_CONFIG.welcome_message,
        welcome_image_url: data.welcome_image_url || "",
        scheduled_messages: (data.scheduled_messages as any as ScheduledMessage[]) || [],
        auto_notify_new_content: data.auto_notify_new_content,
      });
    }
    setLoading(false);
  }, []);

  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const res = await fetch(
        `https://${PROJECT_ID}.supabase.co/functions/v1/telegram-bot?action=getChats`,
        { headers: { Authorization: `Bearer ${ANON_KEY}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setChannels(data.chats || []);
      }
    } catch {}
    setLoadingChannels(false);
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchChannels();
  }, [fetchConfig, fetchChannels]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const payload = {
        channel_id: config.channel_id,
        channel_username: config.channel_username,
        bot_username: config.bot_username,
        welcome_enabled: config.welcome_enabled,
        welcome_message: config.welcome_message,
        welcome_image_url: config.welcome_image_url,
        scheduled_messages: config.scheduled_messages as any,
        auto_notify_new_content: config.auto_notify_new_content,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        await supabase.from("telegram_config").update(payload).eq("id", config.id);
      } else {
        const { data } = await supabase.from("telegram_config").insert(payload).select().single();
        if (data) setConfig((prev) => ({ ...prev, id: data.id }));
      }
      toast({ title: "✅ Configuração salva!", description: "As alterações foram aplicadas com sucesso." });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const testWelcomeMessage = async () => {
    setTestingWelcome(true);
    try {
      const res = await fetch(
        `https://${PROJECT_ID}.supabase.co/functions/v1/telegram-bot?action=testWelcome`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: config.channel_id,
            message: config.welcome_message,
            image_url: config.welcome_image_url,
          }),
        }
      );
      if (res.ok) {
        toast({ title: "✅ Mensagem enviada!", description: "Verifique o canal do Telegram." });
      } else {
        toast({ title: "Erro ao enviar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
    setTestingWelcome(false);
  };

  const addScheduledMessage = () => {
    setConfig((prev) => ({
      ...prev,
      scheduled_messages: [
        ...prev.scheduled_messages,
        { id: crypto.randomUUID(), message: "", interval_hours: 24, enabled: true },
      ],
    }));
  };

  const updateScheduledMessage = (id: string, updates: Partial<ScheduledMessage>) => {
    setConfig((prev) => ({
      ...prev,
      scheduled_messages: prev.scheduled_messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  };

  const removeScheduledMessage = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      scheduled_messages: prev.scheduled_messages.filter((m) => m.id !== id),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bot</p>
              <p className="text-sm font-semibold truncate">{config.bot_username || "Não configurado"}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Hash className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canal</p>
              <p className="text-sm font-semibold truncate">{config.channel_username || "Não vinculado"}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Auto-notificações</p>
              <p className="text-sm font-semibold">{config.auto_notify_new_content ? "Ativadas" : "Desativadas"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Config */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
          <Send className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold">Configuração do Canal</h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">ID do Canal</Label>
              <Input
                value={config.channel_id}
                onChange={(e) => setConfig((p) => ({ ...p, channel_id: e.target.value }))}
                placeholder="-1001234567890"
                className="bg-white/[0.03] border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Username do Canal</Label>
              <Input
                value={config.channel_username}
                onChange={(e) => setConfig((p) => ({ ...p, channel_username: e.target.value }))}
                placeholder="@lyneflix_ofc"
                className="bg-white/[0.03] border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Username do Bot</Label>
              <Input
                value={config.bot_username}
                onChange={(e) => setConfig((p) => ({ ...p, bot_username: e.target.value }))}
                placeholder="@lyneflix_bot"
                className="bg-white/[0.03] border-white/10"
              />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.auto_notify_new_content}
                  onCheckedChange={(checked) => setConfig((p) => ({ ...p, auto_notify_new_content: checked }))}
                />
                <span className="text-sm">Notificar novos conteúdos</span>
              </div>
            </div>
          </div>

          {/* Detected Channels */}
          {channels.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Canais detectados pelo bot
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {channels.map((ch: any) => (
                  <button
                    key={ch.id}
                    onClick={() => setConfig((p) => ({ ...p, channel_id: String(ch.id), channel_username: ch.username ? `@${ch.username}` : p.channel_username }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                      String(ch.id) === config.channel_id
                        ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {ch.title?.charAt(0) || "T"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ch.title}</p>
                      <p className="text-[10px] text-muted-foreground">{ch.type} • {ch.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Welcome Message */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Mensagem de Boas-Vindas</h2>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={config.welcome_enabled}
              onCheckedChange={(checked) => setConfig((p) => ({ ...p, welcome_enabled: checked }))}
            />
            <span className="text-xs text-muted-foreground">{config.welcome_enabled ? "Ativada" : "Desativada"}</span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Mensagem (suporta Markdown)</Label>
                <Textarea
                  value={config.welcome_message}
                  onChange={(e) => setConfig((p) => ({ ...p, welcome_message: e.target.value }))}
                  rows={8}
                  placeholder="Digite a mensagem de boas-vindas..."
                  className="font-mono text-sm bg-white/[0.03] border-white/10 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  <Image className="w-3.5 h-3.5" /> URL do Banner
                </Label>
                <Input
                  value={config.welcome_image_url}
                  onChange={(e) => setConfig((p) => ({ ...p, welcome_image_url: e.target.value }))}
                  placeholder="https://... (vazio = banner padrão)"
                  className="bg-white/[0.03] border-white/10"
                />
              </div>
              <button
                onClick={testWelcomeMessage}
                disabled={testingWelcome || !config.channel_id}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testingWelcome ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar Teste no Canal
              </button>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">📱 Preview</p>
              <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                <img
                  src={config.welcome_image_url || welcomeBanner}
                  alt="Welcome banner"
                  className="w-full h-40 object-cover"
                />
                <div className="p-4 space-y-2">
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">{config.welcome_message}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Messages */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Mensagens Agendadas</h2>
            <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
              {config.scheduled_messages.length}
            </span>
          </div>
          <button
            onClick={addScheduledMessage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/25 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova
          </button>
        </div>

        <div className="p-6">
          {config.scheduled_messages.length === 0 ? (
            <div className="text-center py-10">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma mensagem agendada</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Nova" para criar uma mensagem periódica</p>
            </div>
          ) : (
            <div className="space-y-3">
              {config.scheduled_messages.map((msg, idx) => (
                <div key={msg.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                      <Switch
                        checked={msg.enabled}
                        onCheckedChange={(checked) => updateScheduledMessage(msg.id, { enabled: checked })}
                      />
                      <span className="text-xs text-muted-foreground">{msg.enabled ? "Ativa" : "Pausada"}</span>
                    </div>
                    <button
                      onClick={() => removeScheduledMessage(msg.id)}
                      className="text-destructive/60 hover:text-destructive p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    <Textarea
                      value={msg.message}
                      onChange={(e) => updateScheduledMessage(msg.id, { message: e.target.value })}
                      rows={3}
                      placeholder="Mensagem a enviar..."
                      className="font-mono text-sm bg-white/[0.02] border-white/10 resize-none"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">A cada</Label>
                        <Input
                          type="number"
                          min={1}
                          value={msg.interval_hours}
                          onChange={(e) => updateScheduledMessage(msg.id, { interval_hours: parseInt(e.target.value) || 24 })}
                          className="w-16 h-8 text-xs bg-white/[0.03] border-white/10"
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <Input
                          value={msg.image_url || ""}
                          onChange={(e) => updateScheduledMessage(msg.id, { image_url: e.target.value })}
                          placeholder="URL da imagem (opcional)"
                          className="h-8 text-xs bg-white/[0.03] border-white/10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Social Links */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="text-base font-semibold flex items-center gap-3">
            <ExternalLink className="w-5 h-5 text-primary" />
            Links Rápidos
          </h3>
        </div>
        <div className="p-6 flex flex-wrap gap-3">
          <a href="https://t.me/lyneflix_ofc" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors">
            <Send className="w-4 h-4" /> Canal Telegram
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
          <a href="https://www.instagram.com/lyneflix/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400 text-sm font-medium hover:bg-pink-500/20 transition-colors">
            📷 Instagram
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
};

export default TelegramChannelTab;
