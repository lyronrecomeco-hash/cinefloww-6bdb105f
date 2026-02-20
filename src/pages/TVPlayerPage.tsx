import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, Volume2, VolumeX } from "lucide-react";
import Hls from "hls.js";

type Mode = "loading" | "hls" | "iframe" | "error";

const TVPlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [channelName, setChannelName] = useState("");
  const [mode, setMode] = useState<Mode>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [iframeSrcdoc, setIframeSrcdoc] = useState("");
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>();
  const streamUrlRef = useRef("");
  const embedUrlRef = useRef("");

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

  // Fallback: load embed page via proxy-tv and render as iframe srcdoc
  const loadIframeFallback = useCallback(async () => {
    if (!embedUrlRef.current) {
      setMode("error");
      setErrorMsg("URL do canal não disponível");
      return;
    }
    setMode("loading");
    try {
      const { data, error } = await supabase.functions.invoke("proxy-tv", {
        body: { url: embedUrlRef.current },
      });
      if (error || !data?.html) {
        setMode("error");
        setErrorMsg("Falha ao carregar player");
        return;
      }
      setIframeSrcdoc(data.html);
      setMode("iframe");
    } catch {
      setMode("error");
      setErrorMsg("Erro de conexão");
    }
  }, []);

  const attachHls = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;

    cleanup();
    video.muted = true;
    setIsMuted(true);

    // Native HLS (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
      setMode("hls");
      return;
    }

    if (!Hls.isSupported()) {
      loadIframeFallback();
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

    let hasPlayed = false;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().then(() => {
        hasPlayed = true;
        setMode("hls");
      }).catch(() => {
        // Autoplay blocked — still show video, user can click
        hasPlayed = true;
        setMode("hls");
      });
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        console.warn("[TVPlayer] Fatal HLS error:", data.type, data.details);
        hls.destroy();
        hlsRef.current = null;
        if (!hasPlayed) {
          // HLS never played — fallback to iframe
          console.log("[TVPlayer] Falling back to iframe player");
          loadIframeFallback();
        } else {
          // Was playing, try reload
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => {
              const hls2 = new Hls({ lowLatencyMode: true, liveDurationInfinity: true });
              hls2.loadSource(url);
              hls2.attachMedia(video);
              hls2.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
              hls2.on(Hls.Events.ERROR, (_, d2) => {
                if (d2.fatal) loadIframeFallback();
              });
              hlsRef.current = hls2;
            }, 2000);
          } else {
            loadIframeFallback();
          }
        }
      }
    });

    hlsRef.current = hls;
  }, [cleanup, loadIframeFallback]);

  const extractStream = useCallback(async () => {
    if (!id) return;
    setMode("loading");
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("extract-tv", {
        body: { channel_id: id },
      });

      if (error || !data) {
        setMode("error");
        setErrorMsg("Falha ao extrair stream");
        return;
      }

      setChannelName(data.channel_name || "");

      // Store the embed URL for iframe fallback
      const { data: ch } = await supabase
        .from("tv_channels")
        .select("stream_url")
        .eq("id", id)
        .single();
      if (ch?.stream_url) embedUrlRef.current = ch.stream_url;

      if (data.type === "m3u8" || data.type === "mp4") {
        streamUrlRef.current = data.url;
        if (data.type === "mp4") {
          const video = videoRef.current;
          if (video) {
            video.muted = true;
            setIsMuted(true);
            video.src = data.url;
            video.play().catch(() => {});
            setMode("hls");
          }
        } else {
          attachHls(data.url);
        }
      } else {
        // iframe type — go directly to iframe fallback
        embedUrlRef.current = data.url;
        loadIframeFallback();
      }
    } catch (err) {
      console.error("[TVPlayer] Extract error:", err);
      setMode("error");
      setErrorMsg("Erro de conexão");
    }
  }, [id, attachHls, loadIframeFallback]);

  useEffect(() => {
    extractStream();
    return cleanup;
  }, [extractStream, cleanup]);

  // Unmute handler
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  }, []);

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

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* HLS Video (hidden when in iframe mode) */}
      {mode !== "iframe" && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
          muted
          onClick={() => {
            const v = videoRef.current;
            if (v) v.paused ? v.play() : v.pause();
          }}
        />
      )}

      {/* Iframe mode — srcdoc player from embedtv */}
      {mode === "iframe" && iframeSrcdoc && (
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrcdoc}
          className="w-full h-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      )}

      {/* Loading overlay */}
      {mode === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Carregando canal...</p>
          {channelName && <p className="text-xs text-muted-foreground/60 mt-1">{channelName}</p>}
        </div>
      )}

      {/* Error overlay */}
      {mode === "error" && (
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

        {/* Mute/Unmute for HLS mode */}
        {mode === "hls" && (
          <button
            onClick={toggleMute}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 text-white text-sm hover:bg-black/70 transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isMuted ? "Ativar som" : "Mudo"}
          </button>
        )}
      </div>
    </div>
  );
};

export default TVPlayerPage;
