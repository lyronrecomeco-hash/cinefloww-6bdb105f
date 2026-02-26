import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Film, Tv, Loader2, CheckCircle, XCircle, Cloud, HardDrive, Search, Link } from "lucide-react";
import { searchMulti } from "@/services/tmdb";

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "indexing" | "done" | "error";
  progress: number;
  tmdb_id?: number;
  content_type?: string;
  title?: string;
  season?: number;
  episode?: number;
  audio_type?: string;
  key?: string;
  public_url?: string;
  error?: string;
}

interface R2File {
  key: string;
  size: number;
  lastModified: string;
}

const R2UploadPage = () => {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [r2Files, setR2Files] = useState<R2File[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [searchingTmdb, setSearchingTmdb] = useState(false);
  const [selectedTmdb, setSelectedTmdb] = useState<any | null>(null);
  const [indexForm, setIndexForm] = useState({ season: 0, episode: 0, audio_type: "dublado" });
  const [manualUrl, setManualUrl] = useState("");
  const [indexingManual, setIndexingManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const formatSize = (bytes: number) => {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(2) + " GB";
    if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + " MB";
    return (bytes / 1e3).toFixed(0) + " KB";
  };

  const loadR2Files = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await supabase.functions.invoke("upload-r2", {
        body: { action: "list" },
      });
      if (resp.data?.items) setR2Files(resp.data.items);
    } catch { }
    setLoadingFiles(false);
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newUploads: UploadItem[] = Array.from(files).map(f => ({
      id: crypto.randomUUID(),
      file: f,
      status: "pending" as const,
      progress: 0,
      audio_type: "dublado",
    }));
    setUploads(prev => [...prev, ...newUploads]);
  };

  const uploadFile = async (item: UploadItem) => {
    setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: "uploading", progress: 0 } : u));

    try {
      // 1. Get presigned URL
      const { data: presignData, error: presignErr } = await supabase.functions.invoke("upload-r2", {
        body: { action: "presign", filename: item.file.name, content_type: item.file.type || "video/mp4" },
      });

      if (presignErr || !presignData?.presigned_url) throw new Error(presignErr?.message || "Presign failed");

      // 2. Upload directly to R2
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploads(prev => prev.map(u => u.id === item.id ? { ...u, progress: pct } : u));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          const responseSnippet = (xhr.responseText || "").slice(0, 220);
          reject(new Error(`HTTP ${xhr.status}${responseSnippet ? ` - ${responseSnippet}` : ""}`));
        };
        xhr.onerror = () => reject(new Error("Falha de rede/CORS no R2. Configure CORS do bucket para permitir PUT/GET/HEAD/OPTIONS e sua origem do app."));
        xhr.onabort = () => reject(new Error("Upload cancelado"));
        xhr.setRequestHeader("Content-Type", item.file.type || "video/mp4");
        xhr.send(item.file);
      });

      setUploads(prev => prev.map(u => u.id === item.id ? {
        ...u, status: "done", progress: 100, key: presignData.key, public_url: presignData.public_url
      } : u));

      toast({ title: "Upload concluído", description: item.file.name });
    } catch (err: any) {
      setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: "error", error: err.message } : u));
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
  };

  const uploadAll = () => {
    uploads.filter(u => u.status === "pending").forEach(u => uploadFile(u));
  };

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  const deleteR2File = async (key: string) => {
    if (!confirm(`Deletar ${key}?`)) return;
    await supabase.functions.invoke("upload-r2", { body: { action: "delete", key } });
    setR2Files(prev => prev.filter(f => f.key !== key));
    toast({ title: "Arquivo deletado" });
  };

  // TMDB search
  const handleTmdbSearch = async () => {
    if (!tmdbQuery.trim()) return;
    setSearchingTmdb(true);
    try {
      const results = await searchMulti(tmdbQuery);
      setTmdbResults((results?.results || []).filter((r: any) => r.media_type === "movie" || r.media_type === "tv").slice(0, 12));
    } catch { }
    setSearchingTmdb(false);
  };

  const selectTmdbItem = (item: any) => {
    setSelectedTmdb(item);
    setIndexForm({ season: 0, episode: 0, audio_type: "dublado" });
  };

  // Index video to video_cache
  const indexVideo = async (videoUrl: string) => {
    if (!selectedTmdb) {
      toast({ title: "Selecione um conteúdo TMDB primeiro", variant: "destructive" });
      return;
    }

    setIndexingManual(true);
    try {
      const contentType = selectedTmdb.media_type === "movie" ? "movie" : "series";
      const { error } = await supabase.functions.invoke("upload-r2", {
        body: {
          action: "index",
          tmdb_id: selectedTmdb.id,
          content_type: contentType,
          title: selectedTmdb.title || selectedTmdb.name,
          video_url: videoUrl,
          video_type: "mp4",
          season: indexForm.season,
          episode: indexForm.episode,
          audio_type: indexForm.audio_type,
        },
      });

      if (error) throw error;
      toast({ title: "✅ Indexado com sucesso!", description: `${selectedTmdb.title || selectedTmdb.name} → video_cache` });
      
      // Auto-increment episode for series
      if (contentType === "series") {
        setIndexForm(prev => ({ ...prev, episode: prev.episode + 1 }));
      }
      setManualUrl("");
    } catch (err: any) {
      toast({ title: "Erro ao indexar", description: err.message, variant: "destructive" });
    }
    setIndexingManual(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-primary" /> R2 CDN Upload
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Upload de vídeos grandes (300MB+) para o Cloudflare R2</p>
        </div>
        <button onClick={loadR2Files} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4" /> {loadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ver Arquivos"}
        </button>
      </div>

      {/* TMDB Search + Index Section */}
      <div className="bg-card border border-white/10 rounded-xl p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Film className="w-4 h-4" /> 1. Selecionar Conteúdo (TMDB)</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={tmdbQuery}
            onChange={e => setTmdbQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleTmdbSearch()}
            placeholder="Buscar filme ou série..."
            className="flex-1 h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm"
          />
          <button onClick={handleTmdbSearch} className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            {searchingTmdb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>

        {tmdbResults.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-4">
            {tmdbResults.map(item => (
              <button
                key={item.id}
                onClick={() => selectTmdbItem(item)}
                className={`rounded-lg overflow-hidden border-2 transition-all ${
                  selectedTmdb?.id === item.id ? "border-primary scale-105" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : "/placeholder.svg"}
                  alt={item.title || item.name}
                  className="w-full aspect-[2/3] object-cover"
                />
                <div className="p-1 text-[10px] truncate text-center bg-black/50">{item.title || item.name}</div>
              </button>
            ))}
          </div>
        )}

        {selectedTmdb && (
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={selectedTmdb.poster_path ? `https://image.tmdb.org/t/p/w92${selectedTmdb.poster_path}` : "/placeholder.svg"}
                className="w-12 h-16 rounded object-cover"
              />
              <div>
                <p className="font-semibold text-sm">{selectedTmdb.title || selectedTmdb.name}</p>
                <p className="text-xs text-muted-foreground">
                  TMDB {selectedTmdb.id} • {selectedTmdb.media_type === "movie" ? "Filme" : "Série"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {selectedTmdb.media_type === "tv" && (
                <>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase">Temporada</label>
                    <input type="number" min={0} value={indexForm.season} onChange={e => setIndexForm(f => ({ ...f, season: +e.target.value }))}
                      className="w-full h-9 px-2 rounded bg-white/5 border border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase">Episódio</label>
                    <input type="number" min={0} value={indexForm.episode} onChange={e => setIndexForm(f => ({ ...f, episode: +e.target.value }))}
                      className="w-full h-9 px-2 rounded bg-white/5 border border-white/10 text-sm" />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Áudio</label>
                <select value={indexForm.audio_type} onChange={e => setIndexForm(f => ({ ...f, audio_type: e.target.value }))}
                  className="w-full h-9 px-2 rounded bg-white/5 border border-white/10 text-sm">
                  <option value="dublado">Dublado</option>
                  <option value="legendado">Legendado</option>
                  <option value="nacional">Nacional</option>
                </select>
              </div>
            </div>

            {/* Manual URL input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={manualUrl}
                  onChange={e => setManualUrl(e.target.value)}
                  placeholder="Cole a URL do vídeo (R2, Mega, MP4 direto...)"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <button
                onClick={() => indexVideo(manualUrl)}
                disabled={!manualUrl.trim() || indexingManual}
                className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {indexingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Indexar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Section */}
      <div className="bg-card border border-white/10 rounded-xl p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Upload className="w-4 h-4" /> 2. Upload para R2 CDN</h2>
        
        <div
          className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Arraste arquivos ou clique para selecionar</p>
          <p className="text-xs text-muted-foreground/60 mt-1">MP4, MKV — sem limite de tamanho</p>
        </div>
        <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

        {uploads.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{uploads.length} arquivo(s)</span>
              <button onClick={uploadAll} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                Enviar Todos
              </button>
            </div>
            {uploads.map(u => (
              <div key={u.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{u.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(u.file.size)}</p>
                  {u.status === "uploading" && (
                    <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {u.status === "done" && (
                    <button
                      onClick={() => {
                        if (u.public_url) {
                          setManualUrl(u.public_url);
                          toast({ title: "URL copiada para indexação" });
                        }
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Indexar
                    </button>
                  )}
                  {u.status === "pending" && <button onClick={() => uploadFile(u)} className="text-xs text-primary">Enviar</button>}
                  {u.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {u.status === "done" && <CheckCircle className="w-4 h-4 text-primary" />}
                  {u.status === "error" && <span title={u.error}><XCircle className="w-4 h-4 text-destructive" /></span>}
                  <button onClick={() => removeUpload(u.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* R2 Files List */}
      {r2Files.length > 0 && (
        <div className="bg-card border border-white/10 rounded-xl p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><HardDrive className="w-4 h-4" /> Arquivos no R2</h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {r2Files.map(f => (
              <div key={f.key} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                <Film className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{f.key}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(f.size)} • {new Date(f.lastModified).toLocaleDateString("pt-BR")}</p>
                </div>
                <button
                  onClick={() => {
                    const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/upload-r2`;
                    setManualUrl(f.key);
                    toast({ title: "Key copiada", description: f.key });
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Usar
                </button>
                <button onClick={() => deleteR2File(f.key)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default R2UploadPage;
