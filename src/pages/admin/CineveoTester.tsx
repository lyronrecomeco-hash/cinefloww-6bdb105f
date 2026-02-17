import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Loader2, Search, CheckCircle, XCircle, Film, Tv } from "lucide-react";

interface ExtractionResult {
  url: string | null;
  type?: string;
  provider?: string;
  cached?: boolean;
  error?: string;
}

type ProviderOption = "cineveo" | "megaembed" | "all";

const providerOptions: { value: ProviderOption; label: string; desc: string }[] = [
  { value: "cineveo", label: "CineVeo", desc: "Apenas CDN CineVeo (mp4 direto)" },
  { value: "megaembed", label: "MegaEmbed", desc: "Apenas MegaEmbed (m3u8/mp4 bruto)" },
  { value: "all", label: "Todos", desc: "Tenta CineVeo → MegaEmbed → EmbedPlay" },
];

const CineveoTester = () => {
  const [tmdbId, setTmdbId] = useState("");
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [audioType, setAudioType] = useState("legendado");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption>("cineveo");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [testingPlayer, setTestingPlayer] = useState(false);

  const handleTest = async () => {
    if (!tmdbId) return;
    setLoading(true);
    setResult(null);
    setTestingPlayer(false);

    try {
      const body: Record<string, unknown> = {
        tmdb_id: Number(tmdbId),
        content_type: contentType === "series" ? "tv" : "movie",
        audio_type: audioType,
        force_provider: selectedProvider === "all" ? undefined : selectedProvider,
      };
      if (contentType === "series") {
        body.season = Number(season);
        body.episode = Number(episode);
      }

      const { data, error } = await supabase.functions.invoke("extract-video", { body });

      if (error) {
        setResult({ url: null, error: error.message });
      } else {
        setResult(data as ExtractionResult);
      }
    } catch (err) {
      setResult({ url: null, error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">CineVeo Tester</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Teste a extração de vídeo bruto (MP4/M3U8) por provedor.
        </p>
      </div>

      {/* Form */}
      <div className="glass-strong rounded-2xl p-5 space-y-4">
        {/* Provider selector */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wider">Provedor</label>
          <div className="flex flex-wrap gap-2">
            {providerOptions.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedProvider(p.value)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  selectedProvider === p.value
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
                }`}
              >
                <span>{p.label}</span>
                <span className="text-[10px] opacity-70 font-normal">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setContentType("movie")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              contentType === "movie"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
            }`}
          >
            <Film className="w-4 h-4" /> Filme
          </button>
          <button
            onClick={() => setContentType("series")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              contentType === "series"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
            }`}
          >
            <Tv className="w-4 h-4" /> Série
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">TMDB ID</label>
            <input
              type="number"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              placeholder="Ex: 1242898"
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Áudio</label>
            <select
              value={audioType}
              onChange={(e) => setAudioType(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
            >
              <option value="legendado">Legendado</option>
              <option value="dublado">Dublado</option>
              <option value="cam">CAM</option>
            </select>
          </div>
          {contentType === "series" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Temporada</label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Episódio</label>
                <input
                  type="number"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleTest}
          disabled={loading || !tmdbId}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? "Extraindo..." : "Testar Extração"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="glass-strong rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            {result.url ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            <h3 className="font-display font-bold text-lg">
              {result.url ? "Vídeo Encontrado!" : "Nenhum Vídeo"}
            </h3>
          </div>

          {result.error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {result.error}
            </div>
          )}

          {result.url && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</p>
                  <p className="text-sm font-medium mt-0.5">{result.provider}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo</p>
                  <p className="text-sm font-medium mt-0.5">{result.type}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cache</p>
                  <p className="text-sm font-medium mt-0.5">{result.cached ? "Sim" : "Não"}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">URL</p>
                <p className="text-xs font-mono break-all text-muted-foreground">{result.url}</p>
              </div>

              <button
                onClick={() => setTestingPlayer(!testingPlayer)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/20 text-sm font-medium hover:bg-primary/25 transition-colors"
              >
                <Play className="w-4 h-4" />
                {testingPlayer ? "Fechar Player" : "Testar no Player"}
              </button>

              {testingPlayer && (
                <div className="rounded-xl overflow-hidden border border-white/10 aspect-video">
                  <video
                    src={result.url}
                    controls
                    autoPlay
                    className="w-full h-full bg-black"
                  >
                    Seu navegador não suporta vídeo HTML5.
                  </video>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CineveoTester;
