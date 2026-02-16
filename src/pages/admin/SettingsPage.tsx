import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const [siteName, setSiteName] = useState("Cineflow");
  const [siteDescription, setSiteDescription] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("site_settings").select("*");
      if (data) {
        data.forEach((s: any) => {
          if (s.key === "site_name") setSiteName(s.value?.value || "Cineflow");
          if (s.key === "site_description") setSiteDescription(s.value?.value || "");
          if (s.key === "maintenance_mode") setMaintenanceMode(s.value?.value || false);
        });
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = [
        { key: "site_name", value: { value: siteName } },
        { key: "site_description", value: { value: siteDescription } },
        { key: "maintenance_mode", value: { value: maintenanceMode } },
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

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
