import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import Hls from "hls.js";

const TVPlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [channelName, setChannelName] = useState("");
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>();

  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  const attachSource = useCallback((url: string, type: "m3u8" | "mp4") => {
    const video = videoRef.current;
    if (!video) return;

    cleanup();

    if (type === "mp4" || (type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl"))) {
      video.src = url;
      video.play().catch(() => {});
      setStatus("playing");
      return;
    }

    if (!Hls.isSupported()) {
      setStatus("error");
      setErrorMsg("Navegador não suporta HLS");
      return;
    }

    const hls = new Hls({
      lowLatencyMode: true,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      maxBufferLength: 10,
      maxMaxBufferLength: 20,
      enableWorker: true,
      liveDurationInfinity: true,
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
      setStatus("playing");
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        console.error("[TVPlayer] Fatal HLS error:", data.type, data.details);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else {
          setStatus("error");
          setErrorMsg("Erro ao carregar stream");
        }
      }
    });

    hlsRef.current = hls;
  }, [cleanup]);

  const extractStream = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("extract-tv", {
        body: { channel_id: id },
      });

      if (error || !data) {
        setStatus("error");
        setErrorMsg("Falha ao extrair stream");
        return;
      }

      setChannelName(data.channel_name || "");

      if (data.type === "m3u8" || data.type === "mp4") {
        attachSource(data.url, data.type);
      } else {
        // iframe type — try proxy-tv to get HTML and extract from it
        try {
          const proxyResp = await supabase.functions.invoke("proxy-tv", {
            body: { url: data.url },
          });
          if (proxyResp.data?.html) {
            // Try to find m3u8/mp4 in the proxied HTML
            const html = proxyResp.data.html as string;
            const m3u8Match = html.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/i);
            const mp4Match = html.match(/['"]([^'"]*\.mp4[^'"]*)['"]/i);
            if (m3u8Match?.[1]) {
              attachSource(m3u8Match[1].replace("http://", "https://"), "m3u8");
              return;
            }
            if (mp4Match?.[1] && !mp4Match[1].includes("logo")) {
              attachSource(mp4Match[1].replace("http://", "https://"), "mp4");
              return;
            }
          }
        } catch {}
        setStatus("error");
        setErrorMsg("Não foi possível extrair o stream deste canal");
      }
    } catch (err) {
      console.error("[TVPlayer] Extract error:", err);
      setStatus("error");
      setErrorMsg("Erro de conexão");
    }
  }, [id, attachSource]);

  useEffect(() => {
    extractStream();
    return cleanup;
  }, [extractStream, cleanup]);

  // Auto-hide controls
  const resetControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  useEffect(() => {
    resetControls();
    const handler = () => resetControls();
    window.addEventListener("mousemove", handler);
    window.addEventListener("touchstart", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("touchstart", handler);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [resetControls]);

  // Fullscreen on mobile
  useEffect(() => {
    const tryFullscreen = () => {
      if (window.innerWidth < 768) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        try {
          (screen.orientation as any)?.lock?.("landscape").catch(() => {});
        } catch {}
      }
    };
    tryFullscreen();
    return () => {
      document.exitFullscreen?.().catch(() => {});
      try { (screen.orientation as any)?.unlock?.(); } catch {}
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        onClick={() => {
          const v = videoRef.current;
          if (v) v.paused ? v.play() : v.pause();
        }}
      />

      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Carregando canal...</p>
          {channelName && <p className="text-xs text-muted-foreground/60 mt-1">{channelName}</p>}
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 gap-4">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{errorMsg || "Erro ao reproduzir"}</p>
          <div className="flex gap-3">
            <button
              onClick={extractStream}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
            <button
              onClick={() => navigate("/tv")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-foreground text-sm font-medium hover:bg-white/15 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          </div>
        </div>
      )}

      {/* Top bar controls */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-20 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={() => navigate("/tv")}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 text-white text-sm hover:bg-black/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        {channelName && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-sm text-white font-medium">{channelName}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TVPlayerPage;
