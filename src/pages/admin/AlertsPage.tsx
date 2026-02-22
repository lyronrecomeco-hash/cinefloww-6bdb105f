import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, Plus, Save, Trash2, Loader2, Eye, EyeOff,
  ExternalLink, X, Clock, ToggleLeft, ToggleRight, Send,
  Megaphone, AlertTriangle, Info, Gift, Shield, Sparkles,
  Copy, Zap, Heart, Star, Radio, Volume2, Users, TrendingUp, Flag, WifiOff
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
      title: "🎬 Novidade na LyneFlix!",
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
      message: "Aproveite nossa promoção por tempo limitado! Compartilhe a LyneFlix com seus amigos e ganhe acesso a conteúdos exclusivos.",
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
      message: "A LyneFlix foi atualizada! Agora você conta com um player melhorado, carregamento mais rápido e novas funcionalidades. Aproveite!",
      button_text: "Explorar",
      button_link: "",
      button_style: "primary",
      interval_minutes: 360,
      active: false,
    },
  },
  {
    icon: Zap,
    label: "Urgente",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    data: {
      title: "🚨 Atenção!",
      message: "Detectamos um problema técnico que pode afetar a reprodução de alguns conteúdos. Nossa equipe já está trabalhando na correção. Pedimos desculpas pelo inconveniente.",
      button_text: "Fechar",
      button_link: "",
      button_style: "destructive",
      interval_minutes: 15,
      active: false,
    },
  },
  {
    icon: Heart,
    label: "Agradecimento",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    data: {
      title: "❤️ Obrigado!",
      message: "Agradecemos por fazer parte da comunidade LyneFlix! Sua presença é muito importante para nós. Continue aproveitando o melhor do entretenimento!",
      button_text: "Valeu!",
      button_link: "",
      button_style: "primary",
      interval_minutes: 720,
      active: false,
    },
  },
  {
    icon: Star,
    label: "Destaque",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    data: {
      title: "⭐ Conteúdo em Destaque",
      message: "Temos uma recomendação especial para você! Confira o conteúdo em destaque desta semana, selecionado especialmente pela nossa equipe.",
      button_text: "Ver Destaque",
      button_link: "",
      button_style: "primary",
      interval_minutes: 240,
      active: false,
    },
  },
  {
    icon: Radio,
    label: "Transmissão",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    data: {
      title: "📡 Transmissão ao Vivo",
      message: "Estamos com uma transmissão especial ao vivo! Não perca este evento exclusivo disponível por tempo limitado na LyneFlix.",
      button_text: "Assistir Agora",
      button_link: "",
      button_style: "primary",
      interval_minutes: 10,
      active: false,
    },
  },
  {
    icon: Volume2,
    label: "Comunicado",
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
    data: {
      title: "📢 Comunicado Oficial",
      message: "Informamos que estamos expandindo nosso catálogo com novos parceiros de conteúdo. Em breve, mais filmes e séries estarão disponíveis para você!",
      button_text: "Entendido",
      button_link: "",
      button_style: "secondary",
      interval_minutes: 480,
      active: false,
    },
  },
  {
    icon: Users,
    label: "Comunidade",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    data: {
      title: "👥 Junte-se à Comunidade!",
      message: "Entre no nosso grupo exclusivo para receber novidades em primeira mão, sugestões de filmes e interagir com outros usuários da LyneFlix!",
      button_text: "Participar",
      button_link: "",
      button_style: "primary",
      interval_minutes: 1440,
      active: false,
    },
  },
  {
    icon: TrendingUp,
    label: "Tendências",
    color: "text-lime-400",
    bg: "bg-lime-500/10 border-lime-500/20",
    data: {
      title: "🔥 Em Alta Agora",
      message: "Confira os filmes e séries mais assistidos da semana! Veja o que está bombando na LyneFlix e não fique de fora.",
      button_text: "Ver Tendências",
      button_link: "",
      button_style: "primary",
      interval_minutes: 300,
      active: false,
    },
  },
  // ── Novos templates de report/feedback ──
  {
    icon: Flag,
    label: "Episódio Cortado",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    data: {
      title: "⏱️ Episódio com Minutos Faltando?",
      message: "Percebeu que algum episódio está com minutos faltando ou cortado no final? Reporte para nossa equipe resolver com urgência! Sua ajuda mantém a qualidade do catálogo.",
      button_text: "Reportar",
      button_link: "",
      button_style: "destructive",
      interval_minutes: 1440,
      active: false,
    },
  },
  {
    icon: AlertTriangle,
    label: "Filme/Série Lento",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    data: {
      title: "🐌 Conteúdo Carregando Lento?",
      message: "Se o filme ou série está demorando para carregar ou travando durante a reprodução, reporte para nossa equipe! Estamos sempre otimizando as fontes para melhor experiência.",
      button_text: "Reportar Lentidão",
      button_link: "",
      button_style: "destructive",
      interval_minutes: 1440,
      active: false,
    },
  },
  {
    icon: Zap,
    label: "Player Não Carrega",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    data: {
      title: "🚫 Player Não Está Carregando?",
      message: "Encontrou um filme ou série que não abre no player? Reporte para nossa equipe resolver com prioridade! Nossos conteúdos estão sendo adicionados gradualmente e algumas fontes podem ainda não estar disponíveis.",
      button_text: "Reportar Player",
      button_link: "",
      button_style: "destructive",
      interval_minutes: 1440,
      active: false,
    },
  },
  {
    icon: Info,
    label: "Site Novo - Paciência",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    data: {
      title: "🆕 Estamos em Construção!",
      message: "A LyneFlix é novinha! Os conteúdos estão sendo adicionados aos poucos. Se algum filme ou série não abrir, pode reportar — mas saiba que nossa equipe está trabalhando dia e noite para liberar tudo. Tenha paciência e obrigado por estar com a gente desde o início! 💙",
      button_text: "Entendido, Valeu!",
      button_link: "",
      button_style: "primary",
      interval_minutes: 2880,
      active: false,
    },
  },
  {
    icon: WifiOff,
    label: "Bloqueio DNS",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    data: {
      title: "📡 Não consegue acessar o site?",
      message: "Algumas operadoras de internet (Vivo, Claro, TIM, Oi) podem bloquear o acesso a determinados sites. Isso NÃO é um problema do site.\n\n✅ Solução rápida:\nBaixe o app gratuito 1.1.1.1 da Cloudflare, abra e toque em \"Conectar\". Pronto, acesso liberado!\n\n📲 Disponível na Play Store e App Store.",
      button_text: "Baixar 1.1.1.1",
      button_link: "https://1.1.1.1",
      button_style: "primary",
      interval_minutes: 1440,
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
      await fetchAlerts();
      setActiveTab("alerts");
      toast({ title: `Modelo "${tpl.label}" adicionado!`, description: "Ative quando quiser exibir no site." });
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
          Modelos Prontos ({TEMPLATES.length})
        </button>
      </div>

      {/* Editor */}
      {editing && activeTab === "alerts" && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          {/* Editor Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <h2 className="font-display font-bold text-base flex items-center gap-2">
              {editing.id ? <Save className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
              {editing.id ? "Editar Aviso" : "Criar Novo Aviso"}
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

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            {/* Form - 3 cols */}
            <div className="lg:col-span-3 p-6 space-y-5 border-r border-white/5">
              {/* Row 1: Title */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Título do Aviso</label>
                <input
                  value={editing.title || ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Ex: 🎬 Novidade no CineFlow!"
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/30"
                />
              </div>

              {/* Row 2: Message */}
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Mensagem</label>
                <textarea
                  value={editing.message || ""}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  rows={3}
                  placeholder="Escreva a mensagem que aparecerá no aviso..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/30"
                />
              </div>

              {/* Row 3: Button text + style + link */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Texto do Botão</label>
                  <input
                    value={editing.button_text || ""}
                    onChange={(e) => setEditing({ ...editing, button_text: e.target.value })}
                    placeholder="Entendido"
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estilo</label>
                  <select
                    value={editing.button_style || "primary"}
                    onChange={(e) => setEditing({ ...editing, button_style: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 appearance-none transition-colors"
                  >
                    <option value="primary">Primário</option>
                    <option value="secondary">Neutro</option>
                    <option value="destructive">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Link <span className="text-muted-foreground/30">(opcional)</span>
                  </label>
                  <input
                    value={editing.button_link || ""}
                    onChange={(e) => setEditing({ ...editing, button_link: e.target.value })}
                    placeholder="https://..."
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>

              {/* Row 4: Interval + Status + Save */}
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    <Clock className="w-3 h-3 inline mr-0.5" /> Intervalo
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={editing.interval_minutes || 60}
                      onChange={(e) => setEditing({ ...editing, interval_minutes: parseInt(e.target.value) || 60 })}
                      className="w-full h-10 px-3 pr-10 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40">min</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditing({ ...editing, active: !editing.active })}
                  className={`h-10 flex items-center gap-1.5 px-4 rounded-xl text-sm font-medium transition-colors ${
                    editing.active
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-white/5 text-muted-foreground border border-white/10"
                  }`}
                >
                  {editing.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {editing.active ? "Ativo" : "Inativo"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 justify-center"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {editing.id ? "Salvar" : "Criar & Publicar"}
                </button>
              </div>
            </div>

            {/* Preview - 2 cols */}
            {showPreview && (
              <div className="lg:col-span-2 p-6 flex flex-col items-center justify-center bg-black/20">
                <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest mb-4">Como o usuário verá</p>
                <div className="w-full max-w-xs">
                  <div className="relative glass rounded-2xl border border-white/10 shadow-2xl">
                    <button className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="p-5 space-y-3">
                      <h2 className="text-sm font-display font-bold text-foreground pr-8 leading-snug">
                        {previewData.title || "Título do Aviso"}
                      </h2>
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {previewData.message || "Mensagem aparecerá aqui..."}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                            isDestructive
                              ? "bg-destructive text-destructive-foreground"
                              : isPrimary
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/10 text-foreground border border-white/10"
                          }`}
                        >
                          {previewData.button_link && <ExternalLink className="w-3 h-3" />}
                          {previewData.button_text || "Entendido"}
                        </button>
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
            Modelos prontos para usar. Ao clicar em <span className="text-foreground font-medium">Usar Modelo</span>, ele será adicionado como <span className="text-amber-400 font-medium">inativo</span> na sua lista — ative quando quiser.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <div key={tpl.label} className={`rounded-xl border p-4 space-y-2.5 transition-colors hover:border-white/20 ${tpl.bg}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 ${tpl.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm leading-tight">{tpl.label}</h3>
                      <p className="text-[10px] text-muted-foreground/50">A cada {tpl.data.interval_minutes}min</p>
                    </div>
                  </div>
                  <h4 className="text-xs font-medium leading-snug">{tpl.data.title}</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{tpl.data.message}</p>
                  <button
                    onClick={() => useTemplate(tpl)}
                    disabled={saving}
                    className="flex items-center gap-1.5 w-full justify-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Usar Modelo
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert List */}
      {activeTab === "alerts" && !editing && (
        <div className="space-y-2.5">
          {alerts.length === 0 && (
            <div className="glass rounded-2xl border border-white/10 p-12 text-center">
              <Bell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm font-medium">Nenhum aviso criado</p>
              <p className="text-muted-foreground/50 text-xs mt-1">Crie um novo ou use um modelo pronto</p>
            </div>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`glass rounded-xl border p-4 flex items-start gap-3.5 transition-all ${
                alert.active ? "border-white/10" : "border-white/5 opacity-50"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                alert.active ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
              }`}>
                <Bell className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{alert.title}</h3>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    alert.active ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-muted-foreground"
                  }`}>
                    {alert.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{alert.message}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {alert.interval_minutes}min
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    Botão: {alert.button_text}
                  </span>
                  {alert.button_link && (
                    <span className="text-[10px] text-primary/50 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Link
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
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
