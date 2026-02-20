import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

type Mode = "loading" | "iframe" | "error";

const TVPlayerPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [channelName, setChannelName] = useState("");
  const [mode, setMode] = useState<Mode>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [iframeSrcdoc, setIframeSrcdoc] = useState("");
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load embed page via proxy-tv, inject ad-blocking, render as srcdoc
  const loadChannel = useCallback(async () => {
    if (!id) return;
    setMode("loading");
    setErrorMsg("");

    try {
      // Get channel info
      const { data: channel } = await supabase
        .from("tv_channels")
        .select("name, stream_url")
        .eq("id", id)
        .eq("active", true)
        .single();

      if (!channel) {
        setMode("error");
        setErrorMsg("Canal não encontrado");
        return;
      }

      setChannelName(channel.name);

      // Fetch proxied HTML with ad-blocking injected
      const { data, error } = await supabase.functions.invoke("proxy-tv", {
        body: { url: channel.stream_url },
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
  }, [id]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

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
      {/* Iframe player — srcdoc from proxy-tv with ads blocked */}
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
              onClick={loadChannel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
            <button
              onClick={() => navigate("/tv")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
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
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 text-foreground text-sm hover:bg-black/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        {channelName && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
            </span>
            <span className="text-sm text-foreground font-medium">{channelName}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TVPlayerPage;
