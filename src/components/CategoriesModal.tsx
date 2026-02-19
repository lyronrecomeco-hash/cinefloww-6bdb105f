import { useState, useEffect } from "react";
import { X, Loader2, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface CategoriesModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: Category | null) => void;
  selectedId?: string | null;
}

const CategoriesModal = ({ open, onClose, onSelect, selectedId }: CategoriesModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("categories")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCategories((data as Category[]) || []);
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-display text-lg font-bold">Categorias</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh] scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* All option */}
              <button
                onClick={() => { onSelect(null); onClose(); }}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-center ${
                  !selectedId
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                }`}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { onSelect(cat); onClose(); }}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all text-center ${
                    selectedId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-white/5"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoriesModal;
