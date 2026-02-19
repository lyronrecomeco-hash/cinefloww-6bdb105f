import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flag, CheckCircle, ExternalLink, X, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";

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

const ReportsPage = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "resolved" | "all">("pending");
  const [selected, setSelected] = useState<Report | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    let query = supabase
      .from("content_reports" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query.limit(100);
    setReports((data as any as Report[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, [filter]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_reports" }, () => {
        fetchReports();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  const handleResolve = async (report: Report) => {
    setResolving(true);
    try {
      await supabase
        .from("content_reports" as any)
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", report.id);

      toast.success(`Report de "${report.title}" marcado como resolvido!`);
      setSelected(null);
      fetchReports();
    } catch {
      toast.error("Erro ao resolver report.");
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Problemas reportados pelos usuários</p>
        </div>
        {pendingCount > 0 && filter === "pending" && (
          <span className="px-3 py-1.5 rounded-xl bg-destructive/20 text-destructive text-sm font-semibold border border-destructive/30">
            {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["pending", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
            }`}
          >
            {f === "pending" ? "Pendentes" : f === "resolved" ? "Resolvidos" : "Todos"}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum report encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full text-left p-4 rounded-xl bg-card/50 border border-white/10 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${r.status === "pending" ? "bg-amber-500" : "bg-green-500"}`} />
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
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-card border border-white/10 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected.status === "pending" ? "bg-amber-500/20" : "bg-green-500/20"}`}>
                {selected.status === "pending" ? <Clock className="w-5 h-5 text-amber-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />}
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">{selected.title}</h3>
                <p className="text-muted-foreground text-xs">
                  {selected.content_type === "movie" ? "Filme" : "Série"} • TMDB #{selected.tmdb_id} • {formatDate(selected.created_at)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Mensagem do Usuário</label>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm leading-relaxed">{selected.message}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Visitor: {selected.visitor_id.slice(0, 8)}...</span>
                {selected.resolved_at && <span>• Resolvido em {formatDate(selected.resolved_at)}</span>}
              </div>

              <div className="flex gap-2 pt-2">
                {selected.page_url && (
                  <a
                    href={selected.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver Página
                  </a>
                )}
                <a
                  href={`/player/${selected.content_type === "movie" ? "movie" : "series"}/${selected.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Player
                </a>
                {selected.status === "pending" && (
                  <button
                    onClick={() => handleResolve(selected)}
                    disabled={resolving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                  >
                    {resolving ? (
                      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
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

export default ReportsPage;
