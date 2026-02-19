import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tv2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TVChannel {
  id: string;
  name: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
  active: boolean;
  sort_order: number;
}

interface TVCategory {
  id: number;
  name: string;
  sort_order: number;
}

const TVManager = () => {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editChannel, setEditChannel] = useState<TVChannel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", image_url: "", stream_url: "", category: "Variedades", sort_order: 0 });
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const [chRes, catRes] = await Promise.all([
      supabase.from("tv_channels").select("*").order("sort_order"),
      supabase.from("tv_categories").select("*").order("sort_order"),
    ]);
    setChannels((chRes.data as TVChannel[]) || []);
    setCategories((catRes.data as TVCategory[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = channels.filter(ch =>
    !search || ch.name.toLowerCase().includes(search.toLowerCase()) || ch.id.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActive = async (ch: TVChannel) => {
    await supabase.from("tv_channels").update({ active: !ch.active }).eq("id", ch.id);
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, active: !c.active } : c));
    toast({ title: ch.active ? "Canal desativado" : "Canal ativado" });
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Excluir este canal?")) return;
    await supabase.from("tv_channels").delete().eq("id", id);
    setChannels(prev => prev.filter(c => c.id !== id));
    toast({ title: "Canal excluído" });
  };

  const openEdit = (ch: TVChannel) => {
    setForm({ id: ch.id, name: ch.name, image_url: ch.image_url || "", stream_url: ch.stream_url, category: ch.category, sort_order: ch.sort_order });
    setEditChannel(ch);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ id: "", name: "", image_url: "", stream_url: "", category: "Variedades", sort_order: 0 });
    setEditChannel(null);
    setShowForm(true);
  };

  const saveChannel = async () => {
    if (!form.id || !form.name || !form.stream_url) {
      toast({ title: "Preencha ID, Nome e URL", variant: "destructive" });
      return;
    }
    if (editChannel) {
      await supabase.from("tv_channels").update({
        name: form.name, image_url: form.image_url || null, stream_url: form.stream_url, category: form.category, sort_order: form.sort_order,
      }).eq("id", editChannel.id);
      toast({ title: "Canal atualizado" });
    } else {
      await supabase.from("tv_channels").insert({
        id: form.id, name: form.name, image_url: form.image_url || null, stream_url: form.stream_url, category: form.category, sort_order: form.sort_order,
      });
      toast({ title: "Canal criado" });
    }
    setShowForm(false);
    fetchData();
  };

  const activeCount = channels.filter(c => c.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Tv2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display">TV Lyne</h1>
            <p className="text-xs text-muted-foreground">{channels.length} canais • {activeCount} ativos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar canal..."
              className="h-9 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 w-48" />
          </div>
          <button onClick={openNew} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Novo Canal
          </button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{editChannel ? "Editar Canal" : "Novo Canal"}</h3>
            <div className="space-y-3">
              <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} disabled={!!editChannel}
                placeholder="ID (ex: sbt)" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm disabled:opacity-50" />
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome do canal" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <input value={form.stream_url} onChange={e => setForm(f => ({ ...f, stream_url: e.target.value }))}
                placeholder="URL do stream (embed)" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="URL da imagem (opcional)" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm">
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                placeholder="Ordem" className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-white/5 text-sm hover:bg-white/10 transition-colors">Cancelar</button>
              <button onClick={saveChannel} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3">Canal</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Categoria</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ch => (
                  <tr key={ch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {ch.image_url ? (
                          <img src={ch.image_url} alt={ch.name} className="w-8 h-8 object-contain rounded-lg bg-white/5 p-1" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><Tv2 className="w-4 h-4 text-muted-foreground" /></div>
                        )}
                        <div>
                          <p className="font-medium">{ch.name}</p>
                          <p className="text-[10px] text-muted-foreground">{ch.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{ch.category}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(ch)} className="inline-flex items-center gap-1">
                        {ch.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => window.open(`/tv/${ch.id}`, "_blank")} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Assistir">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => openEdit(ch)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteChannel(ch.id)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TVManager;
