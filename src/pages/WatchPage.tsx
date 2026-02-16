import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
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
  const [phase, setPhase] = useState<"loading" | "playing" | "fallback">("loading");
  const [error, setError] = useState<string | null>(null);

  // Build EmbedPlay URL
  const isMovie = type === "movie";
  const embedId = imdbId || id || "";

  const embedPlayUrl = isMovie
    ? `https://embedplayapi.site/embed/${embedId}`
    : `https://embedplayapi.site/embed/${embedId}/${season ?? 1}/${episode ?? 1}`;

  const proxyUrl = `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(embedPlayUrl)}`;

  // Try server-side extraction first
  useEffect(() => {
    const extract = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("extract-video", {
          body: {
            tmdb_id: Number(id),
            imdb_id: imdbId,
            content_type: isMovie ? "movie" : "series",
            season,
            episode,
          },
        });

        if (!fnError && data?.url) {
          console.log(`[WatchPage] Got direct URL: ${data.url}`);
          setSources([{
            url: data.url,
            quality: "auto",
            provider: "EmbedPlay",
            type: data.type === "mp4" ? "mp4" : "m3u8",
          }]);
          setPhase("playing");
          return;
        }
      } catch {
        // Silent fail
      }

      // Go to fallback iframe to intercept
      console.log("[WatchPage] No direct URL, using proxy iframe fallback");
      setPhase("fallback");
    };

    extract();
  }, [id, imdbId, isMovie, season, episode]);

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
              provider: "EmbedPlay",
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

  // ===== FALLBACK (EmbedPlay via proxy iframe) =====
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
      </div>

      <div className="relative flex-1">
        {/* Ad protection borders */}
        <div className="absolute top-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] z-10 bg-black" />
        <div className="absolute top-0 left-0 w-[3px] h-full z-10 bg-black" />
        <div className="absolute top-0 right-0 w-[3px] h-full z-10 bg-black" />

        <iframe
          src={proxyUrl}
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
