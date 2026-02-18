import { useState, useEffect, useRef, useCallback, memo } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

interface IframeInterceptorProps {
  proxyUrl: string;
  onVideoFound: (url: string, type: "mp4" | "m3u8") => void;
  onError: () => void;
  onClose: () => void;
  title: string;
}

const IframeInterceptor = memo(({ proxyUrl, onVideoFound, onError, onClose, title }: IframeInterceptorProps) => {
  const [status, setStatus] = useState<"loading" | "intercepting" | "found">("loading");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const foundRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Store proxyUrl in ref to avoid re-renders
  const proxyUrlRef = useRef(proxyUrl);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (foundRef.current) return;
    const data = event.data;
    if (data?.type === "__VIDEO_SOURCE__" && data.url) {
      const url = data.url as string;
      if (url.includes(".m3u8") || url.includes(".mp4") || url.includes("/master") || url.includes("/playlist") || url.includes("index-")) {
        foundRef.current = true;
        setStatus("found");
        const vType: "mp4" | "m3u8" = url.includes(".mp4") ? "mp4" : "m3u8";
        setTimeout(() => onVideoFound(url, vType), 300);
      }
    }
  }, [onVideoFound]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    
    // Timeout: if no video found in 30s, give up
    timeoutRef.current = setTimeout(() => {
      if (!foundRef.current) {
        console.warn("[IframeInterceptor] Timeout - no video found");
        onError();
      }
    }, 30000);

    return () => {
      window.removeEventListener("message", handleMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleMessage, onError]);

  // Periodically try to access iframe content to scan for video elements
  useEffect(() => {
    const scanInterval = setInterval(() => {
      if (foundRef.current) { clearInterval(scanInterval); return; }
      try {
        const iframe = iframeRef.current;
        if (!iframe?.contentDocument) return;
        const videos = iframe.contentDocument.querySelectorAll("video, source");
        videos.forEach((el) => {
          const src = (el as HTMLVideoElement).src || (el as HTMLSourceElement).src || (el as HTMLVideoElement).currentSrc;
          if (src && (src.includes(".m3u8") || src.includes(".mp4") || src.includes("/master") || src.includes("/playlist"))) {
            if (!foundRef.current) {
              foundRef.current = true;
              setStatus("found");
              const vType: "mp4" | "m3u8" = src.includes(".mp4") ? "mp4" : "m3u8";
              setTimeout(() => onVideoFound(src, vType), 300);
            }
          }
        });
      } catch {
        // Cross-origin - expected, rely on postMessage
      }
    }, 1000);

    return () => clearInterval(scanInterval);
  }, [onVideoFound]);

  return (
    <div className="relative w-full h-full">
      {/* The proxy iframe - no sandbox to allow full video playback */}
      <iframe
        ref={iframeRef}
        src={proxyUrlRef.current}
        className="w-full h-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => setStatus("intercepting")}
      />

      {/* Overlay while intercepting */}
      {status !== "found" && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 pointer-events-none">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">
            {status === "loading" ? "Carregando player..." : "Detectando fonte de vídeo..."}
          </p>
          <p className="text-xs text-muted-foreground/50 mt-1">{title}</p>
        </div>
      )}

      {/* Back button - always clickable */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 text-white text-sm hover:bg-black/80 transition-colors pointer-events-auto"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>
    </div>
  );
});

IframeInterceptor.displayName = "IframeInterceptor";

export default IframeInterceptor;
