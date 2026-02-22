import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Loader2, CheckCircle, XCircle, Clock, Film, Tv, X, ExternalLink, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { posterUrl, backdropUrl } from "@/services/tmdb";
import { toast as sonnerToast } from "sonner";

interface ContentRequest {
  id: string;
  tmdb_id: number;
  content_type: string;
  title: string;
  original_title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  vote_average: number | null;
  requester_name: string;
  requester_email: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Clock },
  approved: { label: "Aprovado", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: CheckCircle },
  completed: { label: "Concluído", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  rejected: { label: "Rejeitado", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: XCircle },
};

interface Report {
  id: string;
  tmdb_id: number;
  content_type: string;
  title: string;
  message: string;
  visitor_id: string;
  page_url: string | null;
  status: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

const RequestsPage = () => {
  const [activeTab, setActiveTab] = useState<"pedidos" | "reports">("pedidos");
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContentRequest | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const { toast } = useToast();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("content_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests((data as ContentRequest[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); fetchReports(); }, [fetchRequests]);

  const fetchReports = async () => {
    const { data } = await supabase
      .from("content_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setReports((data as any as Report[]) || []);
  };

  const handleResolveReport = async (report: Report) => {
    setResolving(true);
    try {
      await supabase
        .from("content_reports")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", report.id);
      sonnerToast.success(`Report de "${report.title}" marcado como resolvido!`);
      setSelectedReport(null);
      fetchReports();
    } catch {
      sonnerToast.error("Erro ao resolver report.");
    } finally {
      setResolving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("content_requests").update({ status }).eq("id", id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    toast({ title: "Status atualizado", description: `Pedido marcado como ${STATUS_MAP[status]?.label || status}` });
  };

  const tryResolveVideo = async (req: ContentRequest) => {
    setResolving(true);
    try {
      const { data } = await supabase.functions.invoke("extract-video", {
        body: { tmdb_id: req.tmdb_id, content_type: req.content_type, audio_type: "legendado" },
      });
      if (data?.url) {
        setVideoUrl(data.url);
        toast({ title: "Link encontrado!", description: data.url.substring(0, 60) + "..." });
      } else {
        toast({ title: "Link não disponível", description: "Nenhum link direto encontrado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Falha ao resolver link", variant: "destructive" });
    }
    setResolving(false);
  };

  const addToContent = async (req: ContentRequest) => {
    const url = videoUrl.trim();
    if (!url) {
      toast({ title: "URL necessária", description: "Insira o link MP4 do vídeo", variant: "destructive" });
      return;
    }

    // Upsert content
    await supabase.from("content").upsert(
      {
        tmdb_id: req.tmdb_id,
        content_type: req.content_type,
        title: req.title,
        original_title: req.original_title,
        poster_path: req.poster_path,
        backdrop_path: req.backdrop_path,
        overview: req.overview,
        release_date: req.release_date,
        vote_average: req.vote_average || 0,
        status: "published",
      },
      { onConflict: "tmdb_id,content_type" }
    );

    // Cache video
    await supabase.from("video_cache").upsert(
      {
        tmdb_id: req.tmdb_id,
        content_type: req.content_type,
        video_url: url,
        video_type: url.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "manual",
        audio_type: "legendado",
      },
      { onConflict: "tmdb_id,content_type,audio_type,season,episode" }
    );

    await updateStatus(req.id, "completed");
    setVideoUrl("");
    setSelected(null);
    toast({ title: "Conteúdo adicionado!", description: `${req.title} foi publicado no site` });
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const pendingReports = reports.filter(r => r.status === "pending").length;

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-3">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Pedidos & Reports
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gerenciar pedidos e reports dos usuários</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("pedidos")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "pedidos"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Pedidos
          {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{pendingCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "reports"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          Reports
          {pendingReports > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-bold">{pendingReports}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : activeTab === "pedidos" ? (
        /* Pedidos Tab */
        requests.length === 0 ? (
          <div className="glass p-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum pedido recebido ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const st = STATUS_MAP[req.status] || STATUS_MAP.pending;
              const Icon = st.icon;
              return (
                <button
                  key={req.id}
                  onClick={() => { setSelected(req); setVideoUrl(""); }}
                  className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left"
                >
                  {req.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${req.poster_path}`} alt="" className="w-10 h-14 sm:w-12 sm:h-16 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      {req.content_type === "movie" ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{req.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{req.content_type === "movie" ? "Filme" : "Série"}</span>
                      <span>•</span>
                      <span>por {req.requester_name}</span>
                      <span>•</span>
                      <span>{new Date(req.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full border font-medium flex items-center gap-1 ${st.color}`}>
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{st.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        /* Reports Tab */
        reports.length === 0 ? (
          <div className="glass p-12 text-center">
            <Flag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum report encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReport(r)}
                className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${r.status === "pending" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span className="font-semibold text-sm truncate">{r.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground uppercase">
                        {r.content_type === "movie" ? "Filme" : "Série"}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs line-clamp-1">{r.message}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}
      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
          <div
            className="relative w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] bg-card/90 backdrop-blur-2xl border border-white/10 overflow-hidden animate-scale-in flex flex-col rounded-t-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Banner */}
            {selected.backdrop_path && (
              <div className="relative h-32 sm:h-40 overflow-hidden flex-shrink-0">
                <img src={backdropUrl(selected.backdrop_path, "w780")} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
              </div>
            )}

            <div className="flex items-start justify-between p-4 sm:p-5 -mt-12 relative z-10">
              <div className="flex gap-4">
                {selected.poster_path && (
                  <img src={posterUrl(selected.poster_path)} alt="" className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl object-cover shadow-xl flex-shrink-0" />
                )}
                <div className="pt-8 sm:pt-10">
                  <h2 className="font-display text-lg sm:text-xl font-bold">{selected.title}</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>{selected.content_type === "movie" ? "Filme" : "Série"}</span>
                    {selected.release_date && <><span>•</span><span>{selected.release_date.slice(0, 4)}</span></>}
                    {selected.vote_average && selected.vote_average > 0 && <><span>•</span><span>★ {Number(selected.vote_average).toFixed(1)}</span></>}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors mt-8 sm:mt-10 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 pt-0 space-y-4">
              {selected.overview && (
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{selected.overview}</p>
              )}

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Pedido por:</strong> {selected.requester_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong className="text-foreground">Data:</strong> {new Date(selected.created_at).toLocaleString("pt-BR")}
                </p>
              </div>

              {/* Video URL input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link MP4 do vídeo</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://cdn.exemplo.com/video.mp4"
                    className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={() => tryResolveVideo(selected)}
                    disabled={resolving}
                    className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                    Auto
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {selected.status !== "completed" && (
                  <button
                    onClick={() => addToContent(selected)}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Publicar no Site
                  </button>
                )}
                {selected.status === "pending" && (
                  <button
                    onClick={() => updateStatus(selected.id, "rejected")}
                    className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                  >
                    Rejeitar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setSelectedReport(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-card border border-white/10 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedReport(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedReport.status === "pending" ? "bg-amber-500/20" : "bg-emerald-500/20"}`}>
                {selectedReport.status === "pending" ? <Clock className="w-5 h-5 text-amber-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">{selectedReport.title}</h3>
                <p className="text-muted-foreground text-xs">
                  {selectedReport.content_type === "movie" ? "Filme" : "Série"} • TMDB #{selectedReport.tmdb_id} • {formatDate(selectedReport.created_at)}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm leading-relaxed">{selectedReport.message}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Visitor: {selectedReport.visitor_id.slice(0, 8)}...</span>
                {selectedReport.resolved_at && <span>• Resolvido em {formatDate(selectedReport.resolved_at)}</span>}
              </div>
              <div className="flex gap-2 pt-2">
                <a
                  href={`/player/${selectedReport.content_type === "movie" ? "movie" : "series"}/${selectedReport.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Player
                </a>
                {selectedReport.status === "pending" && (
                  <button
                    onClick={() => handleResolveReport(selectedReport)}
                    disabled={resolving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                  >
                    {resolving ? (
                      <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Resolvido
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestsPage;
