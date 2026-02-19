import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Bookmark, Trash2, ClipboardPaste, X, Loader2, Check } from "lucide-react";
import { toSlug } from "@/lib/slugify";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

interface ListItem {
  id: string;
  tmdb_id: number;
  content_type: string;
  title: string;
  poster_path: string | null;
  added_at: string;
}

const MyListPage = () => {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Import flow
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  const getProfileId = (): string | null => {
    try {
      const raw = localStorage.getItem("lyneflix_active_profile");
      if (!raw) return null;
      return JSON.parse(raw).id;
    } catch {
      return null;
    }
  };

  const loadList = async () => {
    const profileId = getProfileId();
    if (!profileId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("my_list")
      .select("id, tmdb_id, content_type, title, poster_path, added_at")
      .eq("profile_id", profileId)
      .order("added_at", { ascending: false });

    setItems((data as ListItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleRemove = async (item: ListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("my_list").delete().eq("id", item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const handleClick = (item: ListItem) => {
    const route = item.content_type === "movie" ? "filme" : "serie";
    navigate(`/${route}/${toSlug(item.title, item.tmdb_id)}`);
  };

  const handleImport = async () => {
    const trimmed = importCode.trim().toUpperCase();
    if (!trimmed) return;

    const profileId = getProfileId();
    if (!profileId) {
      toast({ title: "Erro", description: "Selecione um perfil primeiro", variant: "destructive" });
      return;
    }

    setImporting(true);
    setImportSuccess(false);

    try {
      // Find profile by share code
      const { data: sourceProfile } = await supabase
        .from("user_profiles")
        .select("id, name")
        .eq("share_code", trimmed)
        .single();

      if (!sourceProfile) {
        toast({ title: "Código não encontrado", description: "Verifique o código e tente novamente", variant: "destructive" });
        setImporting(false);
        return;
      }

      // Get their list
      const { data: sourceList } = await supabase
        .from("my_list")
        .select("tmdb_id, content_type, title, poster_path")
        .eq("profile_id", sourceProfile.id);

      if (!sourceList?.length) {
        toast({ title: "Lista vazia", description: "Este perfil não tem itens na lista" });
        setImporting(false);
        return;
      }

      // Import directly - no confirmation needed
      let count = 0;
      for (const item of sourceList) {
        const { error } = await supabase.from("my_list").upsert(
          {
            profile_id: profileId,
            tmdb_id: item.tmdb_id,
            content_type: item.content_type,
            title: item.title,
            poster_path: item.poster_path,
          },
          { onConflict: "profile_id,tmdb_id,content_type" }
        );
        if (!error) count++;
      }

      setImportSuccess(true);
      toast({
        title: "Lista importada!",
        description: `${count} itens de ${sourceProfile.name} adicionados`,
      });

      // Reload list
      await loadList();

      setTimeout(() => {
        setShowImportModal(false);
        setImportCode("");
        setImportSuccess(false);
      }, 1500);
    } catch {
      toast({ title: "Erro", description: "Não foi possível importar", variant: "destructive" });
    }
    setImporting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Minha Lista</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {items.length > 0 ? `${items.length} título${items.length > 1 ? "s" : ""} salvo${items.length > 1 ? "s" : ""}` : "Nenhum título salvo"}
            </p>
          </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span className="hidden sm:inline">Importar Lista</span>
            <span className="sm:hidden">Importar</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Sua lista está vazia</p>
            <p className="text-sm mt-1">Adicione filmes e séries para assistir depois!</p>
            <button
              onClick={() => setShowImportModal(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <ClipboardPaste className="w-4 h-4" />
              Importar lista de um amigo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 sm:gap-4 lg:gap-5">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-card/50 border border-white/5 hover:border-primary/30 transition-all duration-300 hover:scale-[1.03] text-left"
              >
                <div className="aspect-[2/3] relative overflow-hidden">
                  {item.poster_path ? (
                    <img
                      src={`${IMG_BASE}${item.poster_path}`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Bookmark className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={(e) => handleRemove(item, e)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/80"
                    title="Remover da lista"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                  </button>
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary/80 text-[9px] font-bold text-primary-foreground uppercase">
                    {item.content_type === "movie" ? "Filme" : item.content_type === "dorama" ? "Dorama" : "Série"}
                  </div>
                </div>
                <div className="p-2 sm:p-2.5">
                  <p className="text-[11px] sm:text-xs font-medium text-foreground truncate">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal - single step, no confirmation */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setShowImportModal(false); setImportCode(""); setImportSuccess(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-bold">Importar Lista</h2>
              <button onClick={() => { setShowImportModal(false); setImportCode(""); setImportSuccess(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Cole o código de compartilhamento de um colega para adicionar os itens da lista dele à sua.
              </p>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Código de compartilhamento
                </label>
                <input
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  placeholder="LYNE-XXXXXX"
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-mono text-center uppercase tracking-widest focus:outline-none focus:border-primary/50 transition-colors"
                  maxLength={12}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleImport()}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex gap-2">
              <button onClick={() => { setShowImportModal(false); setImportCode(""); setImportSuccess(false); }}
                className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={handleImport} disabled={importing || !importCode.trim() || importSuccess}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {importing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Importando...</>
                ) : importSuccess ? (
                  <><Check className="w-4 h-4" />Importado!</>
                ) : (
                  <><ClipboardPaste className="w-4 h-4" />Importar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default MyListPage;
