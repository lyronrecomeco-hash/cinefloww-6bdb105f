import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save, Loader2, Users, Handshake, Plus, Trash2, Eye, EyeOff, ExternalLink, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Partner {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  icon_url: string | null;
  logo_url: string | null;
  show_navbar_icon: boolean;
  active: boolean;
  sort_order: number;
}

const SettingsPage = () => {
  const [siteName, setSiteName] = useState("Cineflow");
  const [siteDescription, setSiteDescription] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [watchTogetherEnabled, setWatchTogetherEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Partners state
  const [partners, setPartners] = useState<Partner[]>([]);
  const [editingPartner, setEditingPartner] = useState<Partial<Partner> | null>(null);
  const [savingPartner, setSavingPartner] = useState(false);

  const fetchPartners = useCallback(async () => {
    const { data } = await supabase.from("partners").select("*").order("sort_order");
    if (data) setPartners(data as Partner[]);
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
    fetchPartners();
  }, [fetchPartners]);

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

  const savePartner = async () => {
    if (!editingPartner?.name) return;
    setSavingPartner(true);
    try {
      if (editingPartner.id) {
        await supabase.from("partners").update({
          name: editingPartner.name,
          description: editingPartner.description || null,
          website_url: editingPartner.website_url || null,
          icon_url: editingPartner.icon_url || null,
          logo_url: editingPartner.logo_url || null,
          show_navbar_icon: editingPartner.show_navbar_icon ?? false,
          active: editingPartner.active ?? true,
        }).eq("id", editingPartner.id);
      } else {
        await supabase.from("partners").insert({
          name: editingPartner.name,
          description: editingPartner.description || null,
          website_url: editingPartner.website_url || null,
          icon_url: editingPartner.icon_url || null,
          logo_url: editingPartner.logo_url || null,
          show_navbar_icon: editingPartner.show_navbar_icon ?? false,
          active: editingPartner.active ?? true,
        });
      }
      toast({ title: editingPartner.id ? "Parceiro atualizado!" : "Parceiro adicionado!" });
      setEditingPartner(null);
      fetchPartners();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSavingPartner(false);
  };

  const deletePartner = async (id: string) => {
    await supabase.from("partners").delete().eq("id", id);
    fetchPartners();
    toast({ title: "Parceiro removido" });
  };

  const togglePartnerNavbar = async (p: Partner) => {
    await supabase.from("partners").update({ show_navbar_icon: !p.show_navbar_icon }).eq("id", p.id);
    fetchPartners();
  };

  const togglePartnerActive = async (p: Partner) => {
    await supabase.from("partners").update({ active: !p.active }).eq("id", p.id);
    fetchPartners();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display">Configurações</h1>
          <p className="text-xs text-muted-foreground">Configurações gerais do site</p>
        </div>
      </div>

      {/* General Settings */}
      <div className="glass p-6 space-y-5">
        <h2 className="font-display text-lg font-bold">Geral</h2>

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
              <p className="text-sm font-medium">Watch Together</p>
              <p className="text-xs text-muted-foreground mt-0.5">Botão de assistir junto nas páginas de detalhe</p>
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

      {/* Partners Section */}
      <div className="glass p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Handshake className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-display text-lg font-bold">Parceiros</h2>
          </div>
          <button
            onClick={() => setEditingPartner({ name: "", description: "", website_url: "", icon_url: "", logo_url: "", show_navbar_icon: false, active: true })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Gerencie parceiros que aparecem no site. Controle ícone na navbar, logo no modal e link para o site.
        </p>

        {/* Partners list */}
        {partners.length === 0 && !editingPartner && (
          <p className="text-center text-muted-foreground text-sm py-6">Nenhum parceiro cadastrado</p>
        )}

        <div className="space-y-3">
          {partners.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {p.icon_url ? (
                  <img src={p.icon_url} alt={p.name} className="w-7 h-7 object-contain mix-blend-screen" />
                ) : (
                  <Handshake className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {!p.active && <span className="text-[10px] bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded">Inativo</span>}
                  {p.show_navbar_icon && <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">Navbar</span>}
                </div>
                {p.website_url && <p className="text-xs text-muted-foreground truncate">{p.website_url}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => togglePartnerNavbar(p)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" title="Toggle navbar icon">
                  {p.show_navbar_icon ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button onClick={() => togglePartnerActive(p)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" title="Toggle ativo">
                  <div className={`w-2.5 h-2.5 rounded-full ${p.active ? "bg-emerald-400" : "bg-white/20"}`} />
                </button>
                <button onClick={() => setEditingPartner({ ...p })} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" title="Editar">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => deletePartner(p.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" title="Remover">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Edit/Add Form */}
        {editingPartner && (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-primary/20 space-y-4">
            <h3 className="text-sm font-semibold">{editingPartner.id ? "Editar Parceiro" : "Novo Parceiro"}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase mb-1">Nome</label>
                <input
                  value={editingPartner.name || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  placeholder="CineVeo"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase mb-1">URL do Site</label>
                <input
                  value={editingPartner.website_url || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, website_url: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  placeholder="https://cineveo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground uppercase mb-1">Descrição</label>
              <textarea
                value={editingPartner.description || ""}
                onChange={(e) => setEditingPartner({ ...editingPartner, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
                placeholder="Descrição do parceiro..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase mb-1">URL do Ícone (navbar)</label>
                <input
                  value={editingPartner.icon_url || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, icon_url: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  placeholder="URL da imagem do ícone"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase mb-1">URL da Logo (modal)</label>
                <input
                  value={editingPartner.logo_url || ""}
                  onChange={(e) => setEditingPartner({ ...editingPartner, logo_url: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  placeholder="URL da logo completa"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPartner.show_navbar_icon ?? false}
                  onChange={(e) => setEditingPartner({ ...editingPartner, show_navbar_icon: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs">Mostrar ícone na navbar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPartner.active ?? true}
                  onChange={(e) => setEditingPartner({ ...editingPartner, active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs">Ativo</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={savePartner}
                disabled={savingPartner || !editingPartner.name}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingPartner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
              <button
                onClick={() => setEditingPartner(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
