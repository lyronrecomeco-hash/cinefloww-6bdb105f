import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Loader2, LogOut, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AVATAR_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-red-500 to-rose-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-600",
  "from-pink-500 to-rose-600",
  "from-green-500 to-emerald-600",
];

const AVATAR_ICONS = ["🎬", "🎮", "🍿", "🌟", "🎵", "🎭", "🎯", "🔥"];

interface UserProfile {
  id: string;
  name: string;
  avatar_index: number;
  is_default: boolean;
  share_code: string | null;
}

const ProfileSelector = () => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/conta"); return; }

    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at");

    setProfiles((data as UserProfile[]) || []);
    setLoading(false);
  };

  const selectProfile = (profile: UserProfile) => {
    localStorage.setItem("lyneflix_active_profile", JSON.stringify({
      id: profile.id,
      name: profile.name,
      avatar_index: profile.avatar_index,
      share_code: profile.share_code,
    }));
    navigate("/");
  };

  const createProfile = async () => {
    if (!newName.trim()) return;
    if (profiles.length >= 5) {
      toast({ title: "Limite atingido", description: "Máximo de 5 perfis por conta", variant: "destructive" });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setLoading(true);
    const { error } = await supabase.from("user_profiles").insert({
      user_id: session.user.id,
      name: newName.trim(),
      avatar_index: newAvatar,
      is_default: profiles.length === 0,
    });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível criar o perfil", variant: "destructive" });
    } else {
      setCreating(false);
      setNewName("");
      await loadProfiles();
    }
    setLoading(false);
  };

  const updateProfile = async (id: string) => {
    if (!newName.trim()) return;
    await supabase.from("user_profiles").update({ name: newName.trim(), avatar_index: newAvatar }).eq("id", id);
    setEditing(null);
    setNewName("");
    await loadProfiles();
  };

  const deleteProfile = async (id: string) => {
    if (profiles.length <= 1) {
      toast({ title: "Erro", description: "Você precisa ter pelo menos 1 perfil", variant: "destructive" });
      return;
    }
    await supabase.from("user_profiles").delete().eq("id", id);
    await loadProfiles();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({ title: "Código copiado!", description: code });
  };

  const handleLogout = async () => {
    localStorage.removeItem("lyneflix_active_profile");
    await supabase.auth.signOut();
    navigate("/conta");
  };

  if (loading && profiles.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Creating or editing modal
  if (creating || editing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md glass-strong rounded-3xl p-8 animate-in fade-in zoom-in-95 duration-300">
          <h2 className="font-display text-xl font-bold text-center mb-6">
            {editing ? "Editar Perfil" : "Novo Perfil"}
          </h2>

          {/* Avatar picker */}
          <div className="flex justify-center mb-6">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[newAvatar]} flex items-center justify-center text-3xl shadow-lg transition-all duration-300`}>
              {AVATAR_ICONS[newAvatar]}
            </div>
          </div>
          <div className="flex justify-center gap-2 mb-6 flex-wrap">
            {AVATAR_COLORS.map((_, i) => (
              <button
                key={i}
                onClick={() => setNewAvatar(i)}
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[i]} flex items-center justify-center text-lg transition-all ${
                  newAvatar === i ? "ring-2 ring-primary scale-110" : "opacity-60 hover:opacity-100"
                }`}
              >
                {AVATAR_ICONS[i]}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do perfil"
            className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors mb-4"
            maxLength={30}
            autoFocus
          />

          <div className="flex gap-3">
            <button
              onClick={() => { setCreating(false); setEditing(null); setNewName(""); }}
              className="flex-1 h-12 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => editing ? updateProfile(editing) : createProfile()}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-all"
            >
              {editing ? "Salvar" : "Criar"}
            </button>
          </div>

          {editing && profiles.length > 1 && (
            <button
              onClick={() => { deleteProfile(editing); setEditing(null); }}
              className="w-full mt-3 text-xs text-destructive/70 hover:text-destructive transition-colors"
            >
              Excluir este perfil
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] rounded-full bg-purple-600/5 blur-[100px]" />
      </div>

      <div className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-center mb-2">Quem está assistindo?</h1>
        <p className="text-sm text-muted-foreground text-center mb-10">Escolha seu perfil</p>

        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {profiles.map((profile, i) => (
            <div
              key={profile.id}
              className="group flex flex-col items-center gap-3 cursor-pointer animate-in fade-in zoom-in-95"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="relative">
                <button
                  onClick={() => selectProfile(profile)}
                  className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[profile.avatar_index]} flex items-center justify-center text-4xl sm:text-5xl shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-primary/20 border-2 border-transparent group-hover:border-primary/30`}
                >
                  {AVATAR_ICONS[profile.avatar_index]}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(profile.id);
                    setNewName(profile.name);
                    setNewAvatar(profile.avatar_index);
                  }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              <span className="text-sm font-medium text-center max-w-[120px] truncate">{profile.name}</span>

              {/* Share code */}
              {profile.share_code && (
                <button
                  onClick={(e) => { e.stopPropagation(); copyCode(profile.share_code!); }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary/80 transition-colors"
                >
                  {copiedCode === profile.share_code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {profile.share_code}
                </button>
              )}
            </div>
          ))}

          {/* Add profile button */}
          {profiles.length < 5 && (
            <button
              onClick={() => { setCreating(true); setNewAvatar(Math.floor(Math.random() * 8)); }}
              className="flex flex-col items-center gap-3 cursor-pointer group"
            >
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center transition-all group-hover:border-primary/50 group-hover:bg-white/5">
                <Plus className="w-10 h-10 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground">Adicionar</span>
            </button>
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-xl hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSelector;
