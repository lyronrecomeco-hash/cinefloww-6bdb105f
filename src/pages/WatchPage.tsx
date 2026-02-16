import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Zap } from "lucide-react";
import CustomPlayer from "@/components/CustomPlayer";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const WatchPage = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") || "Carregando...";
  const imdbId = searchParams.get("imdb") || null;
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [phase, setPhase] = useState<"extracting" | "playing" | "fallback">("extracting");
  const [dots, setDots] = useState("");
  const extractTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build vidsrc URL
  const contentId = imdbId || id || "";
  const vidsrcUrl =
    type === "movie"
      ? `https://vidsrc.cc/v2/embed/movie/${contentId}`
      : `https://vidsrc.cc/v2/embed/tv/${contentId}/${season ?? 1}/${episode ?? 1}`;

  const proxyUrl = `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(vidsrcUrl)}`;

  // Animated dots
  useEffect(() => {
    if (phase !== "extracting") return;
    const interval = setInterval(() => setDots(d => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(interval);
  }, [phase]);

  // Listen for intercepted video sources from proxy iframe
  useEffect(() => {
    if (phase !== "extracting") return;

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
              provider: "VidSrc",
              type: isM3u8 ? "m3u8" : "mp4",
            };
            const updated = [...prev, newSource];

            if (prev.length === 0) {
              clearTimeout(extractTimeoutRef.current);
              setTimeout(() => setPhase("playing"), 600);
            }
            return updated;
          });
        }
      }
    };

    window.addEventListener("message", handler);

    // Timeout: fallback after 25s
    extractTimeoutRef.current = setTimeout(() => {
      setSources(prev => {
        if (prev.length === 0) {
          console.log("[WatchPage] Extraction timeout, using embedded player");
          setPhase("fallback");
        }
        return prev;
      });
    }, 25000);

    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(extractTimeoutRef.current);
    };
  }, [phase]);

  // Block popups
  useEffect(() => {
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.open = orig; };
  }, []);

  const goBack = () => navigate(-1);

  const retryExtraction = useCallback(() => {
    setSources([]);
    setPhase("extracting");
  }, []);

  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  // ===== EXTRACTING: show loading + full-size hidden iframe =====
  if (phase === "extracting") {
    return (
      <div className="fixed inset-0 z-[100] bg-background">
        {/* Loading UI */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <div className="text-center max-w-md px-6">
            {/* Spinner */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-accent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-bold mb-2 text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}

            <p className="text-muted-foreground text-sm mb-1">
              Extraindo vídeo{dots}
            </p>
            <p className="text-muted-foreground/50 text-xs">
              Obtendo fonte direta sem anúncios
            </p>

            {/* Progress bar animation */}
            <div className="mt-6 w-full max-w-xs mx-auto">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%", animation: "extractProgress 25s ease-out forwards" }} />
              </div>
            </div>

            <button onClick={goBack} className="mt-8 flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          </div>
        </div>

        {/* Full-size proxy iframe behind the overlay — browser needs to render it */}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="absolute inset-0 w-full h-full z-10 opacity-0"
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

  // ===== PLAYING: custom native player =====
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

  // ===== FALLBACK: ad-blocked fullscreen iframe =====
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-sm border-b border-border z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={goBack} className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold truncate">{title}</h2>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <button onClick={retryExtraction} className="h-8 px-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-1.5 hover:bg-primary/20 transition-colors text-[11px] font-medium text-primary">
          <Zap className="w-3 h-3" /> Extrair novamente
        </button>
      </div>

      {/* Iframe */}
      <div className="relative flex-1">
        {/* Ad blocking borders */}
        <div className="absolute top-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute top-0 left-0 w-[3px] h-full z-10 bg-black" />
        <div className="absolute top-0 right-0 w-[3px] h-full z-10 bg-black" />

        <iframe
          src={vidsrcUrl}
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
