import { useState, useEffect } from "react";
import { X, Search, Film, Tv, Star, Loader2, Send, CheckCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { searchMulti, TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";

interface RequestModalProps {
  onClose: () => void;
}

const RequestModal = ({ onClose }: RequestModalProps) => {
  const [step, setStep] = useState<"search" | "confirm" | "exists" | "success">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TMDBMovie | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [existingLink, setExistingLink] = useState("");

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      searchMulti(query).then((data) => {
        setResults(data.results.filter((r: TMDBMovie) => r.poster_path).slice(0, 10));
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = async (item: TMDBMovie) => {
    setSelected(item);
    const type = getMediaType(item);
    const cType = type === "movie" ? "movie" : "series";

    // Check if content already exists in database
    const { data } = await supabase
      .from("content")
      .select("id, status")
      .eq("tmdb_id", item.id)
      .eq("content_type", cType)
      .maybeSingle();

    if (data && data.status !== "inactive") {
      const link = type === "movie" ? `/filme/${item.id}` : `/serie/${item.id}`;
      setExistingLink(link);
      setStep("exists");
    } else {
      setStep("confirm");
    }
  };

  const handleSubmit = async () => {
    if (!selected || !name.trim()) return;
    setSubmitting(true);
    const type = getMediaType(selected);
    await supabase.from("content_requests").insert({
      tmdb_id: selected.id,
      content_type: type === "movie" ? "movie" : "series",
      title: getDisplayTitle(selected),
      original_title: (selected as any).original_title || (selected as any).original_name || null,
      poster_path: selected.poster_path,
      backdrop_path: selected.backdrop_path,
      overview: selected.overview,
      release_date: selected.release_date || (selected as any).first_air_date || null,
      vote_average: selected.vote_average,
      requester_name: name.trim(),
    });
    setSubmitting(false);
    setStep("success");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
      <div
        className="relative w-full sm:max-w-lg bg-card/90 backdrop-blur-2xl border border-white/10 overflow-hidden animate-scale-in flex flex-col rounded-t-3xl sm:rounded-2xl max-h-[85vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-white/10">
          <div>
            <h2 className="font-display text-base sm:text-xl font-bold">Fazer Pedido</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">O conteúdo pode levar de 1 a 3 dias</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5">
          {step === "search" && (
            <div className="space-y-3 sm:space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar filme ou série..."
                  autoFocus
                  className="w-full h-10 sm:h-11 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {searching && (
                <div className="flex justify-center py-6 sm:py-8">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              )}

              {!searching && results.length > 0 && (
                <div className="space-y-1.5 sm:space-y-2">
                  {results.map((item) => {
                    const type = getMediaType(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className="w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] hover:border-primary/20 transition-all text-left"
                      >
                        <img src={posterUrl(item.poster_path, "w92")} alt="" className="w-9 h-13 sm:w-10 sm:h-14 rounded-lg object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium line-clamp-1">{getDisplayTitle(item)}</p>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                            {type === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                            <span>{type === "movie" ? "Filme" : "Série"}</span>
                            <span>•</span>
                            <span>{getYear(item)}</span>
                            {item.vote_average > 0 && (
                              <>
                                <span>•</span>
                                <Star className="w-3 h-3 text-primary fill-primary" />
                                <span>{item.vote_average.toFixed(1)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!searching && query.length >= 2 && results.length === 0 && (
                <p className="text-center text-muted-foreground text-xs sm:text-sm py-6 sm:py-8">Nenhum resultado encontrado</p>
              )}

              {query.length < 2 && (
                <p className="text-center text-muted-foreground text-xs sm:text-sm py-6 sm:py-8">
                  Digite o nome do filme ou série que deseja
                </p>
              )}
            </div>
          )}

          {/* Content already exists */}
          {step === "exists" && selected && (
            <div className="text-center py-6 sm:py-8">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
              </div>
              <h3 className="font-display text-base sm:text-lg font-bold mb-2">Já temos esse conteúdo!</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                <strong className="text-foreground">{getDisplayTitle(selected)}</strong> já se encontra disponível no site.
              </p>
              <p className="text-xs text-muted-foreground mb-5">Clique no botão abaixo para ser direcionado.</p>
              <div className="flex flex-col gap-2">
                <Link
                  to={existingLink}
                  onClick={onClose}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ir para a página
                </Link>
                <button
                  onClick={() => { setStep("search"); setSelected(null); }}
                  className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  Buscar outro
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && selected && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <img src={posterUrl(selected.poster_path)} alt="" className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm sm:text-base line-clamp-2">{getDisplayTitle(selected)}</p>
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground mt-1">
                    <span>{getMediaType(selected) === "movie" ? "Filme" : "Série"}</span>
                    <span>•</span>
                    <span>{getYear(selected)}</span>
                  </div>
                  {selected.overview && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2 line-clamp-2 sm:line-clamp-3">{selected.overview}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 sm:mb-1.5 block">Seu nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como devemos te chamar?"
                  className="w-full h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  ⏱ O conteúdo pode levar de <strong className="text-foreground">1 a 3 dias</strong> para ser implementado no site.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep("search"); setSelected(null); }}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar Pedido
                </button>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-6 sm:py-8">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
              </div>
              <h3 className="font-display text-base sm:text-lg font-bold mb-2">Pedido Enviado!</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-5 sm:mb-6">
                Seu pedido foi registrado. O conteúdo pode levar de 1 a 3 dias para ser disponibilizado.
              </p>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestModal;
