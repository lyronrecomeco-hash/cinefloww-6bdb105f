import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Save, Loader2, Play, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContentEditModalProps {
  item: any;
  onClose: () => void;
  onSave: () => void;
}

const AUDIO_OPTIONS = [
  { value: "dublado", label: "Dublado (PT-BR)", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { value: "legendado", label: "Legendado", color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  { value: "cam", label: "CAM", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
];

const STATUS_OPTIONS = [
  { value: "published", label: "Publicado" },
  { value: "draft", label: "Rascunho" },
  { value: "archived", label: "Arquivado" },
];

const ContentEditModal = ({ item, onClose, onSave }: ContentEditModalProps) => {
  const [title, setTitle] = useState(item.title || "");
  const [overview, setOverview] = useState(item.overview || "");
  const [status, setStatus] = useState(item.status || "published");
  const [featured, setFeatured] = useState(item.featured || false);
  const [audioType, setAudioType] = useState<string[]>(item.audio_type || []);
  const [saving, setSaving] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleAudio = (value: string) => {
    setAudioType((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("content").update({
      title, overview, status, featured, audio_type: audioType,
    }).eq("id", item.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo!" });
      onSave();
    }
    setSaving(false);
  };

  const tmdbId = item.tmdb_id;
  const isMovie = item.content_type === "movie";

  const handleTestPlayer = async () => {
    setShowPlayer(true);
    setExtracting(true);
    setExtractError(null);
    setVideoUrl(null);

    try {
      const { data, error } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: tmdbId,
          content_type: isMovie ? "movie" : "tv",
          audio_type: audioType[0] || "legendado",
        },
      });

      if (error) throw new Error(error.message);
      if (data?.url) {
        setVideoUrl(data.url);
      } else {
        setExtractError("Nenhum vídeo encontrado para este conteúdo.");
      }
    } catch (err: any) {
      setExtractError(err.message || "Erro ao extrair vídeo");
    } finally {
      setExtracting(false);
    }
  };

  const openInPlayer = () => {
    if (videoUrl) {
      const params = new URLSearchParams({ url: videoUrl, title: item.title });
      window.open(`/player?${params.toString()}`, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto glass-strong animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/10 bg-card/80 backdrop-blur-xl">
          <h2 className="font-display text-lg font-bold truncate flex-1">{item.title}</h2>
          <div className="flex items-center gap-2 ml-3">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Info row */}
          <div className="flex gap-5">
            {item.poster_path && (
              <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt={item.title} className="w-28 h-auto rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 appearance-none">
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Destaque</label>
                  <button onClick={() => setFeatured(!featured)} className={`h-10 px-4 rounded-xl text-sm font-medium border transition-colors w-full flex items-center justify-center gap-2 ${featured ? "bg-primary/15 text-primary border-primary/20" : "bg-white/5 border-white/10 text-muted-foreground"}`}>
                    <Star className={`w-3.5 h-3.5 ${featured ? "fill-primary" : ""}`} />{featured ? "Sim" : "Não"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Audio type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tipo de Áudio</label>
            <div className="flex flex-wrap gap-2">
              {AUDIO_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => toggleAudio(opt.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    audioType.includes(opt.value) ? opt.color : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overview */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Sinopse</label>
            <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50" />
          </div>

          {/* Info badges */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">TMDB: {item.tmdb_id}</span>
            {item.imdb_id && <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">IMDB: {item.imdb_id}</span>}
            {item.vote_average && <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">★ {Number(item.vote_average).toFixed(1)}</span>}
            {item.release_date && <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">{item.release_date.split("-")[0]}</span>}
            {item.runtime && <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10">{item.runtime}min</span>}
            <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 capitalize">{item.content_type}</span>
          </div>

          {/* Player test - CineVeo */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Player CineVeo</label>
              <div className="flex gap-2">
                <button onClick={handleTestPlayer} disabled={extracting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium border border-primary/20 hover:bg-primary/25 transition-colors disabled:opacity-50">
                  {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-primary" />}
                  {extracting ? "Extraindo..." : showPlayer ? "Re-extrair" : "Testar Player"}
                </button>
                {videoUrl && (
                  <button onClick={openInPlayer}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors">
                    <Play className="w-3 h-3" />Abrir no Player
                  </button>
                )}
              </div>
            </div>

            {showPlayer && (
              <div className="space-y-2">
                {extracting && (
                  <div className="flex items-center justify-center h-32 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />Extraindo vídeo do CineVeo...
                    </div>
                  </div>
                )}
                {extractError && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    {extractError}
                  </div>
                )}
                {videoUrl && (
                  <div className="relative w-full rounded-xl overflow-hidden border border-white/10" style={{ paddingBottom: "56.25%" }}>
                    <video src={videoUrl} controls autoPlay className="absolute inset-0 w-full h-full bg-black" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentEditModal;