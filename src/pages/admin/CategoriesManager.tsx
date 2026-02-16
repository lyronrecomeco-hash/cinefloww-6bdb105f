import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, Check, X, FolderOpen, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CategoriesManager = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const { toast } = useToast();

  const fetchCategories = async () => {
    setLoading(true);
    const { data } = await supabase.from("categories").select("*").order("name");
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const slugify = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("categories").insert({
      name: newName.trim(),
      slug: slugify(newName.trim()),
      description: newDesc.trim() || null,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria criada!" });
      setNewName(""); setNewDesc("");
      fetchCategories();
    }
    setAdding(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from("categories").update({
      name: editName.trim(),
      slug: slugify(editName.trim()),
      description: editDesc.trim() || null,
    }).eq("id", id);
    if (!error) { setEditId(null); fetchCategories(); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover categoria "${name}"?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (!error) fetchCategories();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Categorias</h1>
        <p className="text-sm text-muted-foreground mt-1">{categories.length} categorias</p>
      </div>

      {/* Add form */}
      <div className="glass p-5">
        <h3 className="font-display font-semibold text-sm mb-4">Nova Categoria</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da categoria"
            className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Descrição (opcional)"
            className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="glass p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma categoria criada</p>
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Nome</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Slug</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden md:table-cell">Descrição</th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    {editId === cat.id ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-sm w-full" />
                    ) : (
                      <span className="text-sm font-medium">{cat.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{cat.slug}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {editId === cat.id ? (
                      <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 px-2 rounded-lg bg-white/5 border border-white/10 text-sm w-full" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{cat.description || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {editId === cat.id ? (
                        <>
                          <button onClick={() => handleUpdate(cat.id)} className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditId(null)} className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditDesc(cat.description || ""); }} className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(cat.id, cat.name)} className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CategoriesManager;
