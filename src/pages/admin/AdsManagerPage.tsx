import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Save, Loader2, ExternalLink, MousePointerClick, Settings, Film, Tv } from "lucide-react";
import { toast } from "sonner";

const AdsManagerPage = () => {
  const [smartlink, setSmartlink] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalClicks, setTotalClicks] = useState(0);
  const [movieAds, setMovieAds] = useState(1);
  const [seriesAds, setSeriesAds] = useState(2);
  const [adsEnabled, setAdsEnabled] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: settings }, { count }, { data: configData }] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "adsterra_smartlink").maybeSingle(),
        supabase.from("ad_clicks").select("*", { count: "exact", head: true }),
        supabase.from("site_settings").select("value").eq("key", "ad_config").maybeSingle(),
      ]);
      if (settings?.value) {
        const val = settings.value as any;
        setSmartlink(typeof val === "string" ? val.replace(/^"|"$/g, '') : val.url || "");
      }
      if (configData?.value) {
        const cfg = configData.value as any;
        setMovieAds(cfg.movie_ads ?? 1);
        setSeriesAds(cfg.series_ads ?? 2);
        setAdsEnabled(cfg.enabled !== false);
      }
      setTotalClicks(count || 0);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        supabase.from("site_settings").upsert(
          { key: "adsterra_smartlink", value: JSON.stringify(smartlink) },
          { onConflict: "key" }
        ),
        supabase.from("site_settings").upsert(
          { key: "ad_config", value: { movie_ads: movieAds, series_ads: seriesAds, enabled: adsEnabled } as any },
          { onConflict: "key" }
        ),
      ]);
      toast.success("Configurações de ADS salvas!");
    } catch {
      toast.error("Erro ao salvar");
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
          Configure monetização e controle de anúncios
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${adsEnabled ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
              <Settings className={`w-5 h-5 ${adsEnabled ? "text-emerald-400" : "text-red-400"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">{adsEnabled ? "Ativado p/ todos" : "Desativado"}</p>
              <p className="text-xs text-muted-foreground">Exibição de ADS</p>
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
        <input
          type="url"
          value={smartlink}
          onChange={(e) => setSmartlink(e.target.value)}
          placeholder="https://www.profitablecpmrate.com/..."
          className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Ad Count Control */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          Controle de Anúncios por Tipo
        </h2>
        <p className="text-xs text-muted-foreground">
          Defina quantos cliques são necessários antes de liberar o player.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Filmes</span>
            </div>
            <div className="flex items-center gap-3">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setMovieAds(n)}
                  className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                    movieAds === n
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1">anúncio(s)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Séries (libera sessão)</span>
            </div>
            <div className="flex items-center gap-3">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setSeriesAds(n)}
                  className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                    seriesAds === n
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1">anúncio(s)</span>
            </div>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <div>
            <p className="text-sm font-medium">Exibir ADS para todos</p>
            <p className="text-xs text-muted-foreground">Quando ativado, todos os usuários passam pelo modal</p>
          </div>
          <button
            onClick={() => setAdsEnabled(!adsEnabled)}
            className={`w-12 h-7 rounded-full transition-all relative ${
              adsEnabled ? "bg-primary" : "bg-white/10"
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-all ${
              adsEnabled ? "left-6" : "left-1"
            }`} />
          </button>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvar Configurações
      </button>

      {/* Info */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
        <p className="text-xs text-primary/80">
          💡 <strong>Como funciona:</strong> O modal anti-bypass usa tokens de sessão únicos. 
          Filmes exigem {movieAds} clique(s), séries exigem {seriesAds} clique(s) que liberam todos os episódios da sessão.
          O sistema é impossível de burlar por refresh, DevTools ou navegação direta.
        </p>
      </div>
    </div>
  );
};

export default AdsManagerPage;
