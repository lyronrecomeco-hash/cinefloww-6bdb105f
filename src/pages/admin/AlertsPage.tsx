import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, Plus, Save, Trash2, Loader2, Eye, EyeOff,
  ExternalLink, X, Clock, ToggleLeft, ToggleRight, Send,
  Megaphone, AlertTriangle, Info, Gift, Shield, Sparkles,
  Copy
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SiteAlert {
  id: string;
  title: string;
  message: string;
  button_text: string;
  button_link: string | null;
  button_style: string;
  interval_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const EMPTY_ALERT = {
  title: "",
  message: "",
  button_text: "Entendido",
  button_link: "",
  button_style: "primary",
  interval_minutes: 60,
  active: true,
};

const TEMPLATES = [
  {
    icon: Megaphone,
    label: "Novidade",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    data: {
      title: "🎬 Novidade no CineFlow!",
      message: "Adicionamos novos filmes e séries ao catálogo! Confira agora as últimas estreias e aproveite para assistir em alta qualidade.",
      button_text: "Ver Novidades",
      button_link: "",
      button_style: "primary",
      interval_minutes: 120,
      active: false,
    },
  },
  {
    icon: AlertTriangle,
    label: "Manutenção",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    data: {
      title: "⚠️ Manutenção Programada",
      message: "Realizaremos uma manutenção no sistema para melhorias de desempenho. O site pode ficar temporariamente instável. Agradecemos a compreensão!",
      button_text: "Entendido",
      button_link: "",
      button_style: "secondary",
      interval_minutes: 30,
      active: false,
    },
  },
  {
    icon: Info,
    label: "Informativo",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    data: {
      title: "ℹ️ Aviso Importante",
      message: "Informamos que alguns conteúdos podem apresentar instabilidade temporária nos servidores de vídeo. Estamos trabalhando para normalizar o mais rápido possível.",
      button_text: "OK, Entendi",
      button_link: "",
      button_style: "secondary",
      interval_minutes: 60,
      active: false,
    },
  },
  {
    icon: Gift,
    label: "Promoção",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    data: {
      title: "🎁 Promoção Especial!",
      message: "Aproveite nossa promoção por tempo limitado! Compartilhe o CineFlow com seus amigos e ganhe acesso a conteúdos exclusivos.",
      button_text: "Saiba Mais",
      button_link: "",
      button_style: "primary",
      interval_minutes: 180,
      active: false,
    },
  },
  {
    icon: Shield,
    label: "Segurança",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    data: {
      title: "🔒 Aviso de Segurança",
      message: "Para sua segurança, recomendamos que não compartilhe links do site em redes públicas. Mantenha seu acesso privado para garantir a melhor experiência.",
      button_text: "Entendido",
      button_link: "",
      button_style: "secondary",
      interval_minutes: 1440,
      active: false,
    },
  },
  {
    icon: Sparkles,
    label: "Atualização",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    data: {
      title: "✨ Nova Atualização!",
      message: "O CineFlow foi atualizado! Agora você conta com um player melhorado, carregamento mais rápido e novas funcionalidades. Aproveite!",
      button_text: "Explorar",
      button_link: "",
      button_style: "primary",
      interval_minutes: 360,
      active: false,
    },
  },
];

const AlertsPage = () => {
  const [alerts, setAlerts] = useState<SiteAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<SiteAlert> | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [activeTab, setActiveTab] = useState<"alerts" | "templates">("alerts");
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase
      .from("site_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAlerts(data as unknown as SiteAlert[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
    const channel = supabase
      .channel("admin-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_alerts" }, () => fetchAlerts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title?.trim() || !editing.message?.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: editing.title!.trim(),
        message: editing.message!.trim(),
        button_text: editing.button_text || "Entendido",
        button_link: editing.button_link?.trim() || null,
        button_style: editing.button_style || "primary",
        interval_minutes: editing.interval_minutes || 60,
        active: editing.active ?? true,
      };
      if (editing.id) {
        await supabase.from("site_alerts").update(payload).eq("id", editing.id);
        toast({ title: "Aviso atualizado com sucesso!" });
      } else {
        await supabase.from("site_alerts").insert(payload);
        toast({ title: "Aviso criado e publicado!" });
      }
      setEditing(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("site_alerts").delete().eq("id", id);
    toast({ title: "Aviso removido" });
  };

  const toggleActive = async (alert: SiteAlert) => {
    await supabase.from("site_alerts").update({ active: !alert.active }).eq("id", alert.id);
    toast({ title: alert.active ? "Aviso desativado" : "Aviso ativado!" });
  };

  const useTemplate = async (tpl: typeof TEMPLATES[0]) => {
    setSaving(true);
    try {
      await supabase.from("site_alerts").insert(tpl.data);
      toast({ title: `Modelo "${tpl.label}" criado!`, description: "Ative quando quiser exibir no site." });
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

  const previewData = editing || EMPTY_ALERT;
  const isPrimary = previewData.button_style === "primary";
  const isDestructive = previewData.button_style === "destructive";
  const activeCount = alerts.filter(a => a.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            Avisos & Alertas
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Gerencie notificações e avisos exibidos aos usuários
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
            <span className="text-muted-foreground">Ativos:</span>
            <span className={`font-bold ${activeCount > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>{activeCount}</span>
          </div>
          <button
            onClick={() => { setEditing({ ...EMPTY_ALERT }); setActiveTab("alerts"); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Aviso
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
        <button
          onClick={() => setActiveTab("alerts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "alerts" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Bell className="w-3.5 h-3.5 inline mr-1.5" />
          Meus Avisos ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "templates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Copy className="w-3.5 h-3.5 inline mr-1.5" />
          Modelos Prontos
        </button>
      </div>

      {/* Editor */}
      {editing && activeTab === "alerts" && (
        <div className="glass p-6 rounded-2xl border border-white/10 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              {editing.id ? <Save className="w-4.5 h-4.5 text-primary" /> : <Plus className="w-4.5 h-4.5 text-primary" />}
              {editing.id ? "Editar Aviso" : "Novo Aviso"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                Preview
              </button>
              <button
                onClick={() => setEditing(null)}
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Título</label>
                <input
                  value={editing.title || ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Ex: Novidade no CineFlow!"
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Mensagem</label>
                <textarea
                  value={editing.message || ""}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  rows={4}
                  placeholder="Escreva a mensagem do aviso..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Texto do Botão</label>
                  <input
                    value={editing.button_text || ""}
                    onChange={(e) => setEditing({ ...editing, button_text: e.target.value })}
                    placeholder="Entendido"
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Estilo</label>
                  <select
                    value={editing.button_style || "primary"}
                    onChange={(e) => setEditing({ ...editing, button_style: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 appearance-none transition-colors"
                  >
                    <option value="primary">Primário (Destaque)</option>
                    <option value="secondary">Secundário (Neutro)</option>
                    <option value="destructive">Urgente (Vermelho)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Link do Botão <span className="text-muted-foreground/40">(opcional)</span>
                </label>
                <input
                  value={editing.button_link || ""}
                  onChange={(e) => setEditing({ ...editing, button_link: e.target.value })}
                  placeholder="https://..."
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Intervalo (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editing.interval_minutes || 60}
                    onChange={(e) => setEditing({ ...editing, interval_minutes: parseInt(e.target.value) || 60 })}
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Reaparece após este tempo</p>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setEditing({ ...editing, active: !editing.active })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors w-full justify-center ${
                      editing.active
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-white/5 text-muted-foreground border border-white/10"
                    }`}
                  >
                    {editing.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {editing.active ? "Ativo" : "Inativo"}
                  </button>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 w-full justify-center"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {editing.id ? "Salvar Alterações" : "Criar & Publicar"}
              </button>
            </div>

            {/* Preview */}
            {showPreview && (
              <div className="flex items-start justify-center pt-2">
                <div className="w-full max-w-sm">
                  <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-3 text-center">Preview em Tempo Real</p>
                  <div className="relative bg-black/40 rounded-2xl p-4">
                    <div className="relative glass rounded-2xl border border-white/10 shadow-2xl">
                      <button className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="p-5 space-y-3">
                        <h2 className="text-base font-display font-bold text-foreground pr-8 leading-snug">
                          {previewData.title || "Título do Aviso"}
                        </h2>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {previewData.message || "Mensagem do aviso aparecerá aqui..."}
                        </p>
                        <div className="flex gap-3 pt-1">
                          <button
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                              isDestructive
                                ? "bg-destructive text-destructive-foreground"
                                : isPrimary
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/10 text-foreground border border-white/10"
                            }`}
                          >
                            {previewData.button_link && <ExternalLink className="w-3.5 h-3.5" />}
                            {previewData.button_text || "Entendido"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Modelos prontos para usar. Clique em <span className="text-foreground font-medium">Usar Modelo</span> para adicionar à sua lista — ele será criado como <span className="text-amber-400 font-medium">inativo</span>, pronto para ativar quando quiser.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <div key={tpl.label} className={`rounded-2xl border p-5 space-y-3 transition-colors hover:border-white/20 ${tpl.bg}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 ${tpl.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{tpl.label}</h3>
                      <p className="text-[10px] text-muted-foreground/60">A cada {tpl.data.interval_minutes}min</p>
                    </div>
                  </div>
                  <h4 className="text-sm font-medium leading-snug">{tpl.data.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{tpl.data.message}</p>
                  <button
                    onClick={() => useTemplate(tpl)}
                    disabled={saving}
                    className="flex items-center gap-2 w-full justify-center px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Usar Modelo
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert List */}
      {activeTab === "alerts" && (
        <div className="space-y-3">
          {alerts.length === 0 && !editing && (
            <div className="glass rounded-2xl border border-white/10 p-12 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm font-medium">Nenhum aviso criado</p>
              <p className="text-muted-foreground/50 text-xs mt-1">Crie um novo ou use um modelo pronto</p>
            </div>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`glass rounded-xl border p-4 flex items-start gap-4 transition-all ${
                alert.active ? "border-white/10" : "border-white/5 opacity-50"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                alert.active ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
              }`}>
                <Bell className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{alert.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    alert.active
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-white/5 text-muted-foreground"
                  }`}>
                    {alert.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{alert.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    A cada {alert.interval_minutes}min
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    Botão: {alert.button_text}
                  </span>
                  {alert.button_link && (
                    <span className="text-[10px] text-primary/60 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      Link
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => toggleActive(alert)}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  title={alert.active ? "Desativar" : "Ativar"}
                >
                  {alert.active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setEditing(alert); setShowPreview(true); }}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  title="Editar"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
