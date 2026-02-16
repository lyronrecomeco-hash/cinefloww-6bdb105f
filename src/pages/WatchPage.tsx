import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Zap, Mic, Subtitles, Video, Globe, ChevronRight, X } from "lucide-react";
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
  const [phase, setPhase] = useState<"audio-select" | "extracting" | "playing" | "fallback">(
    audioParam ? "extracting" : "audio-select"
  );
  const [selectedAudio, setSelectedAudio] = useState(audioParam || "");
  const [audioTypes, setAudioTypes] = useState<string[]>([]);
  const [dots, setDots] = useState("");
  const [extractionStatus, setExtractionStatus] = useState("Verificando cache...");
  const extractTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
        if (data?.audio_type?.length) setAudioTypes(data.audio_type);
        else setAudioTypes(["legendado"]);
      });
  }, [id, type]);

  // Build SuperFlix URL
  const contentId = imdbId || id || "";
  const superflixUrl =
    type === "movie"
      ? `https://superflixapi.one/filme/${contentId}`
      : `https://superflixapi.one/serie/${contentId}/${season ?? 1}/${episode ?? 1}`;

  const proxyUrl = `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(superflixUrl)}`;

  // Animated dots
  useEffect(() => {
    if (phase !== "extracting") return;
    const interval = setInterval(() => setDots(d => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(interval);
  }, [phase]);

  // Main extraction flow
  const startExtraction = useCallback(async (audio: string) => {
    setSelectedAudio(audio);
    setPhase("extracting");
    setExtractionStatus("Verificando cache...");

    try {
      // Step 1: Try server-side extraction (checks cache first)
      const { data, error } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: Number(id),
          imdb_id: imdbId,
          content_type: type === "movie" ? "movie" : "series",
          audio_type: audio,
          season,
          episode,
        },
      });

      if (!error && data?.url) {
        console.log(`[WatchPage] Got URL from server: ${data.url} (cached: ${data.cached})`);
        setExtractionStatus(data.cached ? "Carregando do cache..." : "Fonte encontrada!");
        
        setSources([{
          url: data.url,
          quality: "auto",
           provider: "SuperFlix",
          type: data.type === "mp4" ? "mp4" : "m3u8",
        }]);
        
        setTimeout(() => setPhase("playing"), 500);
        return;
      }

      // Step 2: Server couldn't find direct URL, use client-side interception
      console.log("[WatchPage] Server extraction failed, trying client-side interception");
      setExtractionStatus("Extraindo via player...");
      startClientExtraction();

    } catch (err) {
      console.error("[WatchPage] Extraction error:", err);
      setExtractionStatus("Extraindo via player...");
      startClientExtraction();
    }
  }, [id, imdbId, type, season, episode]);

  // Client-side extraction via proxy iframe
  const startClientExtraction = useCallback(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "__VIDEO_SOURCE__" && event.data.url) {
        const url = event.data.url as string;
        console.log(`[WatchPage] Intercepted: ${event.data.source} -> ${url}`);

        const isM3u8 = url.includes(".m3u8") || url.includes("/playlist") || url.includes("/master");
        const isMp4 = url.includes(".mp4");

        if (isM3u8 || isMp4) {
          setSources(prev => {
            if (prev.find(s => s.url === url)) return prev;
            const newSource: VideoSource = {
              url,
              quality: "auto",
              provider: "SuperFlix",
              type: isM3u8 ? "m3u8" : "mp4",
            };

            if (prev.length === 0) {
              clearTimeout(extractTimeoutRef.current);
              setExtractionStatus("Fonte capturada!");

              // Save to cache via edge function (fire and forget)
              supabase.functions.invoke("extract-video", {
                body: {
                  tmdb_id: Number(id),
                  imdb_id: imdbId,
                  content_type: type === "movie" ? "movie" : "series",
                  audio_type: selectedAudio || "legendado",
                  season,
                  episode,
                },
              }).catch(() => {});

              setTimeout(() => setPhase("playing"), 600);
            }
            return [...prev, newSource];
          });
        }
      }
    };

    window.addEventListener("message", handler);

    // Timeout: fallback after 20s
    extractTimeoutRef.current = setTimeout(() => {
      setSources(prev => {
        if (prev.length === 0) {
          console.log("[WatchPage] Client extraction timeout, fallback");
          setPhase("fallback");
        }
        return prev;
      });
    }, 20000);

    // Cleanup stored for phase change
    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(extractTimeoutRef.current);
    };
  }, [id, imdbId, type, season, episode, selectedAudio]);

  // Auto-start if audio was passed via URL
  useEffect(() => {
    if (audioParam && phase === "extracting") {
      startExtraction(audioParam);
    }
  }, [audioParam]);

  // Block popups
  useEffect(() => {
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.open = orig; };
  }, []);

  const goBack = () => navigate(-1);
  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  // ===== AUDIO SELECT =====
  if (phase === "audio-select") {
    const available = AUDIO_OPTIONS.filter(o => audioTypes.includes(o.key));
    
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        
        <div className="relative w-full max-w-md">
          {/* Back button */}
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="bg-card/50 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
                  {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
                  <p className="text-sm text-muted-foreground mt-2">Escolha o tipo de áudio</p>
                </div>
              </div>

              <div className="space-y-3">
                {available.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => startExtraction(opt.key)}
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
                  onClick={() => startExtraction("legendado")}
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

  // ===== EXTRACTING =====
  if (phase === "extracting") {
    return (
      <div className="fixed inset-0 z-[100] bg-background">
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-accent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-bold mb-2 text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}

            <p className="text-muted-foreground text-sm mb-1">
              {extractionStatus}{dots}
            </p>
            <p className="text-muted-foreground/50 text-xs">
              Preparando reprodução sem anúncios
            </p>

            <div className="mt-6 w-full max-w-xs mx-auto">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ animation: "extractProgress 20s ease-out forwards" }} />
              </div>
            </div>

            <button onClick={goBack} className="mt-8 flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          </div>
        </div>

        {/* Hidden proxy iframe for client-side interception */}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="absolute inset-0 w-full h-full z-10 opacity-0 pointer-events-none"
          sandbox="allow-scripts allow-same-origin allow-forms"
          allow="autoplay; encrypted-media"
          title="extractor"
        />

        <style>{`
          @keyframes extractProgress {
            0% { width: 5%; }
            30% { width: 40%; }
            60% { width: 65%; }
            90% { width: 85%; }
            100% { width: 95%; }
          }
        `}</style>
      </div>
    );
  }

  // ===== PLAYING =====
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

  // ===== FALLBACK =====
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
        <button
          onClick={() => { setSources([]); setPhase("extracting"); startExtraction(selectedAudio || "legendado"); }}
          className="h-8 px-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-1.5 hover:bg-primary/20 transition-colors text-[11px] font-medium text-primary"
        >
          <Zap className="w-3 h-3" /> Extrair novamente
        </button>
      </div>

      <div className="relative flex-1">
        <div className="absolute top-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute top-0 left-0 w-[3px] h-full z-10 bg-black" />
        <div className="absolute top-0 right-0 w-[3px] h-full z-10 bg-black" />

        <iframe
          src={superflixUrl}
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
