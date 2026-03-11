import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Save, RefreshCw, Plus, Trash2, Clock, Image, MessageSquare, Users, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  welcome_message: "🎬 Bem-vindo ao canal oficial da *LyneFlix*! 🍿\n\n✨ Aqui você fica por dentro de todos os lançamentos, novidades e dicas.\n\n🔗 Acesse: https://cinefloww.lovable.app\n\n📱 Ative as notificações para não perder nada!",
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
      toast({ title: "Configuração salva!", description: "As alterações foram aplicadas." });
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
        toast({ title: "Mensagem enviada!", description: "Verifique o canal." });
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
      {/* Channel Info */}
      <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <Send className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Configuração do Canal</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>ID do Canal</Label>
            <Input
              value={config.channel_id}
              onChange={(e) => setConfig((p) => ({ ...p, channel_id: e.target.value }))}
              placeholder="-1001234567890"
            />
            <p className="text-[10px] text-muted-foreground">ID numérico do canal/grupo</p>
          </div>
          <div className="space-y-2">
            <Label>Username do Canal</Label>
            <Input
              value={config.channel_username}
              onChange={(e) => setConfig((p) => ({ ...p, channel_username: e.target.value }))}
              placeholder="@lyneflix_ofc"
            />
          </div>
          <div className="space-y-2">
            <Label>Username do Bot</Label>
            <Input
              value={config.bot_username}
              onChange={(e) => setConfig((p) => ({ ...p, bot_username: e.target.value }))}
              placeholder="@lyneflix_bot"
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.auto_notify_new_content}
                onChange={(e) => setConfig((p) => ({ ...p, auto_notify_new_content: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-sm">Notificar novos conteúdos automaticamente</span>
            </label>
          </div>
        </div>

        {/* Channels List */}
        {channels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Canais/Grupos detectados
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {channels.map((ch: any) => (
                <button
                  key={ch.id}
                  onClick={() => setConfig((p) => ({ ...p, channel_id: String(ch.id), channel_username: ch.username ? `@${ch.username}` : p.channel_username }))}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    String(ch.id) === config.channel_id
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
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

      {/* Welcome Message */}
      <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Mensagem de Boas-Vindas</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.welcome_enabled}
              onChange={(e) => setConfig((p) => ({ ...p, welcome_enabled: e.target.checked }))}
              className="rounded border-border"
            />
            <span className="text-sm">Ativada</span>
          </label>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mensagem (suporta Markdown)</Label>
            <Textarea
              value={config.welcome_message}
              onChange={(e) => setConfig((p) => ({ ...p, welcome_message: e.target.value }))}
              rows={6}
              placeholder="Digite a mensagem de boas-vindas..."
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Image className="w-4 h-4" /> URL da Imagem/Banner
            </Label>
            <Input
              value={config.welcome_image_url}
              onChange={(e) => setConfig((p) => ({ ...p, welcome_image_url: e.target.value }))}
              placeholder="https://... (deixe vazio para usar o banner padrão)"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">📱 Preview</p>
            <div className="rounded-lg overflow-hidden border border-border max-w-sm">
              <img
                src={config.welcome_image_url || welcomeBanner}
                alt="Welcome banner"
                className="w-full h-32 object-cover"
              />
              <div className="p-3 bg-card/80">
                <p className="text-xs whitespace-pre-wrap">{config.welcome_message}</p>
              </div>
            </div>
          </div>

          <button
            onClick={testWelcomeMessage}
            disabled={testingWelcome || !config.channel_id}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm hover:bg-primary/30 disabled:opacity-50"
          >
            {testingWelcome ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Testar no Canal
          </button>
        </div>
      </div>

      {/* Scheduled Messages */}
      <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Mensagens Agendadas</h2>
          </div>
          <button
            onClick={addScheduledMessage}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm hover:bg-primary/30"
          >
            <Plus className="w-4 h-4" /> Nova
          </button>
        </div>

        {config.scheduled_messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma mensagem agendada. Clique em "Nova" para criar.
          </p>
        ) : (
          <div className="space-y-4">
            {config.scheduled_messages.map((msg) => (
              <div key={msg.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={msg.enabled}
                      onChange={(e) => updateScheduledMessage(msg.id, { enabled: e.target.checked })}
                      className="rounded border-border"
                    />
                    <span className="text-sm font-medium">{msg.enabled ? "Ativa" : "Desativada"}</span>
                  </label>
                  <button
                    onClick={() => removeScheduledMessage(msg.id)}
                    className="text-destructive hover:text-destructive/80 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <Textarea
                  value={msg.message}
                  onChange={(e) => updateScheduledMessage(msg.id, { message: e.target.value })}
                  rows={3}
                  placeholder="Mensagem a enviar..."
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Intervalo (horas)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={msg.interval_hours}
                      onChange={(e) => updateScheduledMessage(msg.id, { interval_hours: parseInt(e.target.value) || 24 })}
                      className="w-20"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={msg.image_url || ""}
                      onChange={(e) => updateScheduledMessage(msg.id, { image_url: e.target.value })}
                      placeholder="URL da imagem (opcional)"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Social Links */}
      <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-3">
        <h3 className="text-sm font-semibold">Links Rápidos</h3>
        <div className="flex flex-wrap gap-2">
          <a href="https://t.me/lyneflix_ofc" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(200,80%,45%)]/10 border border-[hsl(200,80%,45%)]/20 text-[hsl(200,80%,45%)] text-sm hover:bg-[hsl(200,80%,45%)]/20">
            <Send className="w-4 h-4" /> Canal Telegram
            <ExternalLink className="w-3 h-3" />
          </a>
          <a href="https://www.instagram.com/lyneflix/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(330,70%,55%)]/10 border border-[hsl(330,70%,55%)]/20 text-[hsl(330,70%,55%)] text-sm hover:bg-[hsl(330,70%,55%)]/20">
            📷 Instagram
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
};

export default TelegramChannelTab;
