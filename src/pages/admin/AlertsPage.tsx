import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, Plus, Save, Trash2, Loader2, Eye, EyeOff,
  ExternalLink, X, Clock, ToggleLeft, ToggleRight, Send
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

const AlertsPage = () => {
  const [alerts, setAlerts] = useState<SiteAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<SiteAlert> | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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
        toast({ title: "Aviso atualizado!" });
      } else {
        await supabase.from("site_alerts").insert(payload);
        toast({ title: "Aviso criado e enviado ao site!" });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Avisos & Alertas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie avisos que aparecem para os usuários no site
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY_ALERT })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Aviso
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div className="glass p-6 rounded-2xl border border-white/10 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">
              {editing.id ? "Editar Aviso" : "Novo Aviso"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPreview ? "Fechar Preview" : "Preview"}
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
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Mensagem</label>
                <textarea
                  value={editing.message || ""}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  rows={4}
                  placeholder="Escreva a mensagem do aviso..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Texto do Botão</label>
                  <input
                    value={editing.button_text || ""}
                    onChange={(e) => setEditing({ ...editing, button_text: e.target.value })}
                    placeholder="Entendido"
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Estilo do Botão</label>
                  <select
                    value={editing.button_style || "primary"}
                    onChange={(e) => setEditing({ ...editing, button_style: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 appearance-none"
                  >
                    <option value="primary">Primário (Azul)</option>
                    <option value="secondary">Secundário (Neutro)</option>
                    <option value="destructive">Destaque (Vermelho)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Link do Botão <span className="text-muted-foreground/50">(opcional)</span>
                </label>
                <input
                  value={editing.button_link || ""}
                  onChange={(e) => setEditing({ ...editing, button_link: e.target.value })}
                  placeholder="https://exemplo.com"
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Intervalo (minutos)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editing.interval_minutes || 60}
                    onChange={(e) => setEditing({ ...editing, interval_minutes: parseInt(e.target.value) || 60 })}
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Reaparece após este tempo</p>
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 w-full justify-center"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {editing.id ? "Salvar Alterações" : "Criar & Enviar ao Site"}
              </button>
            </div>

            {/* Preview */}
            {showPreview && (
              <div className="flex items-center justify-center">
                <div className="w-full max-w-sm">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 text-center">Preview em Tempo Real</p>
                  <div className="relative glass rounded-2xl border border-white/10 shadow-2xl">
                    <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                    <div className="p-6 space-y-4">
                      <h2 className="text-lg font-display font-bold text-foreground pr-8">
                        {previewData.title || "Título do Aviso"}
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {previewData.message || "Mensagem do aviso aparecerá aqui..."}
                      </p>
                      <div className="flex gap-3 pt-2">
                        <button
                          className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                            isDestructive
                              ? "bg-destructive text-destructive-foreground"
                              : isPrimary
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/10 text-foreground border border-white/10"
                          }`}
                        >
                          {previewData.button_link && <ExternalLink className="w-4 h-4" />}
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

      {/* Alert List */}
      <div className="space-y-3">
        {alerts.length === 0 && !editing && (
          <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum aviso criado ainda</p>
            <p className="text-muted-foreground/50 text-xs mt-1">Crie um aviso para exibir aos usuários do site</p>
          </div>
        )}

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`glass rounded-xl border p-4 flex items-start gap-4 transition-colors ${
              alert.active ? "border-white/10" : "border-white/5 opacity-60"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              alert.active ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground"
            }`}>
              <Bell className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{alert.title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  alert.active
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-white/5 text-muted-foreground"
                }`}>
                  {alert.active ? "ATIVO" : "INATIVO"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{alert.message}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  A cada {alert.interval_minutes}min
                </span>
                {alert.button_link && (
                  <span className="text-[10px] text-primary/60 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Com link
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
                onClick={() => setEditing(alert)}
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
    </div>
  );
};

export default AlertsPage;
