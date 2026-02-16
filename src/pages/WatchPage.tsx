import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Mic, Subtitles, Video, Globe, ChevronRight, Loader2 } from "lucide-react";
import CustomPlayer from "@/components/CustomPlayer";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
];

// Multiple embed providers with fallback
function buildEmbedUrls(imdbId: string | null, tmdbId: string, type: string, season?: number, episode?: number): string[] {
  const isMovie = type === "movie";
  const id = imdbId || tmdbId;
  const s = season ?? 1;
  const e = episode ?? 1;

  return [
    // 1. MegaEmbed (Brazilian, TMDB, minimal ads, high quality)
    isMovie
      ? `https://megaembed.com/embed/${tmdbId}`
      : `https://megaembed.com/embed/${tmdbId}/${s}/${e}`,

    // 2. Embed.su (TMDB)
    isMovie
      ? `https://embed.su/embed/movie/${tmdbId}/1/1`
      : `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`,

    // 3. VidLink (TMDB)
    isMovie
      ? `https://vidlink.pro/movie/${tmdbId}?autoplay=true`
      : `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true`,

    // 4. AutoEmbed (TMDB)
    isMovie
      ? `https://autoembed.co/movie/tmdb/${tmdbId}`
      : `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`,

    // 5. VikingEmbed (IMDB/TMDB)
    `https://vembed.stream/play/${id}`,
  ];
}

const WatchPage = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") || "Carregando...";
  const imdbId = searchParams.get("imdb") || null;
  const audioParam = searchParams.get("audio");
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [phase, setPhase] = useState<"audio-select" | "loading" | "playing" | "fallback">(
    audioParam ? "loading" : "audio-select"
  );
  const [selectedAudio, setSelectedAudio] = useState(audioParam || "");
  const [audioTypes, setAudioTypes] = useState<string[]>([]);
  const [currentProviderIdx, setCurrentProviderIdx] = useState(0);
  const [playerLink, setPlayerLink] = useState<string | null>(null);

  const isMovie = type === "movie";
  const embedUrls = buildEmbedUrls(imdbId, id || "", type || "movie", season, episode);
  const currentEmbedUrl = playerLink || embedUrls[currentProviderIdx] || embedUrls[0];
  // Only proxy embedplayapi.site - other providers load directly in iframe
  const needsProxy = currentEmbedUrl.includes("embedplayapi.site");
  const iframeSrc = needsProxy 
    ? `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(currentEmbedUrl)}`
    : currentEmbedUrl;

  // Load audio types from DB
  useEffect(() => {
    const cType = type === "movie" ? "movie" : "series";
    supabase
      .from("content")
      .select("audio_type")
      .eq("tmdb_id", Number(id))
      .eq("content_type", cType)
      .maybeSingle()
      .then(({ data }) => {
        const dbTypes = data?.audio_type?.length ? data.audio_type : [];
        const merged = new Set([...dbTypes, "dublado", "legendado"]);
        setAudioTypes([...merged]);
      });
  }, [id, type]);

  // Try server-side extraction
  const tryExtraction = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: Number(id),
          imdb_id: imdbId,
          content_type: isMovie ? "movie" : "series",
          audio_type: selectedAudio || "legendado",
          season,
          episode,
        },
      });

      if (!fnError && data?.url) {
        console.log(`[WatchPage] Got direct URL: ${data.url}`);
        setSources([{
          url: data.url,
          quality: "auto",
          provider: data.provider || "extract",
          type: data.type === "mp4" ? "mp4" : "m3u8",
        }]);
        setPhase("playing");
        return;
      }

      // Use player_link if available for better proxy fallback
      if (data?.player_link) {
        console.log(`[WatchPage] Got player link for proxy: ${data.player_link}`);
        setPlayerLink(data.player_link);
      }
    } catch {
      // Silent fail
    }

    console.log("[WatchPage] No direct URL, using proxy iframe fallback");
    setPhase("fallback");
  }, [id, imdbId, isMovie, selectedAudio, season, episode]);

  // Start extraction when audio is selected or passed via URL
  useEffect(() => {
    if (phase === "loading" && selectedAudio) {
      tryExtraction();
    }
  }, [phase, selectedAudio, tryExtraction]);

  // Auto-start if audio was passed via URL
  useEffect(() => {
    if (audioParam) {
      setSelectedAudio(audioParam);
      setPhase("loading");
    }
  }, [audioParam]);

  // Listen for intercepted video sources from proxy iframe
  useEffect(() => {
    if (phase !== "fallback") return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "__VIDEO_SOURCE__" && event.data.url) {
        const url = event.data.url as string;
        const isM3u8 = url.includes(".m3u8") || url.includes("/playlist") || url.includes("/master");
        const isMp4 = url.includes(".mp4");

        if (isM3u8 || isMp4) {
          setSources(prev => {
            if (prev.find(s => s.url === url)) return prev;
            const newSource: VideoSource = {
              url,
              quality: "auto",
              provider: "intercepted",
              type: isM3u8 ? "m3u8" : "mp4",
            };
            if (prev.length === 0) {
              setTimeout(() => setPhase("playing"), 300);
            }
            return [...prev, newSource];
          });
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [phase]);

  // Block popups
  useEffect(() => {
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.open = orig; };
  }, []);

  const goBack = () => navigate(-1);
  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  const handleAudioSelect = (audio: string) => {
    setSelectedAudio(audio);
    setPhase("loading");
  };

  // Try next provider
  const tryNextProvider = () => {
    if (currentProviderIdx < embedUrls.length - 1) {
      setCurrentProviderIdx(prev => prev + 1);
    }
  };

  // ===== AUDIO SELECT =====
  if (phase === "audio-select") {
    const available = AUDIO_OPTIONS.filter(o => audioTypes.includes(o.key));

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />

        <div className="relative w-full max-w-md">
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="bg-card/50 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
                {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
                <p className="text-sm text-muted-foreground mt-2">Escolha o tipo de áudio</p>
              </div>

              <div className="space-y-3">
                {available.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleAudioSelect(opt.key)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-primary/30 transition-all duration-200 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 pt-5 border-t border-white/10">
                <button
                  onClick={() => handleAudioSelect("legendado")}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  Pular e assistir legendado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== LOADING =====
  if (phase === "loading") {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando player...</p>
        </div>
      </div>
    );
  }

  // ===== PLAYING (native player with direct source) =====
  if (phase === "playing" && sources.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <CustomPlayer
          sources={sources}
          title={title}
          subtitle={subtitle}
          onClose={goBack}
          onError={() => {
            console.log("[WatchPage] Player error, switching to fallback");
            setPhase("fallback");
          }}
        />
      </div>
    );
  }

  // ===== FALLBACK (embed via proxy iframe) =====
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-sm border-b border-white/10 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={goBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold truncate">{title}</h2>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {currentProviderIdx < embedUrls.length - 1 && (
          <button
            onClick={tryNextProvider}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 transition-colors"
          >
            Trocar servidor
          </button>
        )}
      </div>

      <div className="relative flex-1">
        <div className="absolute top-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute top-0 left-0 w-[3px] h-full z-10 bg-black" />
        <div className="absolute top-0 right-0 w-[3px] h-full z-10 bg-black" />

        <iframe
          src={iframeSrc}
          className="w-full h-full"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          style={{ border: 0 }}
          title={title}
        />
      </div>
    </div>
  );
};

export default WatchPage;
