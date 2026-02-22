import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Save, Loader2, ExternalLink, MousePointerClick } from "lucide-react";
import { toast } from "sonner";

const AdsManagerPage = () => {
  const [smartlink, setSmartlink] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalClicks, setTotalClicks] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ data: settings }, { count }] = await Promise.all([
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "adsterra_smartlink")
          .maybeSingle(),
        supabase
          .from("ad_clicks")
          .select("*", { count: "exact", head: true }),
      ]);
      if (settings?.value) {
        const val = settings.value as any;
        setSmartlink(typeof val === "string" ? val : val.url || "");
      }
      setTotalClicks(count || 0);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from("site_settings")
        .upsert(
          { key: "adsterra_smartlink", value: JSON.stringify(smartlink) },
          { onConflict: "key" }
        );
      toast.success("Smartlink salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar smartlink");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">
          <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          ADS Manager
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Configure o link do Adsterra Smartlink para monetização
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <MousePointerClick className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalClicks}</p>
              <p className="text-xs text-muted-foreground">Total de cliques</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${smartlink ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
              <Megaphone className={`w-5 h-5 ${smartlink ? "text-emerald-400" : "text-amber-400"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">{smartlink ? "Ativo" : "Não configurado"}</p>
              <p className="text-xs text-muted-foreground">Status do Smartlink</p>
            </div>
          </div>
        </div>
      </div>

      {/* Smartlink Config */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          Adsterra Smartlink URL
        </h2>
        <p className="text-xs text-muted-foreground">
          Cole aqui o link do seu Adsterra Smartlink. Este link será exibido no modal de anúncio antes do player.
        </p>
        <input
          type="url"
          value={smartlink}
          onChange={(e) => setSmartlink(e.target.value)}
          placeholder="https://www.profitablecpmrate.com/..."
          className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Smartlink
        </button>
      </div>

      {/* Info */}
      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
        <p className="text-xs text-amber-300/80">
          ⚠️ <strong>Modo Teste:</strong> Atualmente o modal de anúncio está ativo apenas para a conta <strong>admin-st@gmail.com</strong>. 
          Após validar, você pode ativar para todos os usuários.
        </p>
      </div>
    </div>
  );
};

export default AdsManagerPage;
