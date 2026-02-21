import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Loader2, LogOut, Copy, Check, AlertCircle, Baby, X, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

import avatar1 from "@/assets/avatars/avatar-1.png";
import avatar2 from "@/assets/avatars/avatar-2.png";
import avatar3 from "@/assets/avatars/avatar-3.png";
import avatar4 from "@/assets/avatars/avatar-4.png";
import avatar5 from "@/assets/avatars/avatar-5.png";
import avatar6 from "@/assets/avatars/avatar-6.png";
import avatar7 from "@/assets/avatars/avatar-7.png";
import avatar8 from "@/assets/avatars/avatar-8.png";
import avatar9 from "@/assets/avatars/avatar-9.png";
import avatar10 from "@/assets/avatars/avatar-10.png";
import avatar11 from "@/assets/avatars/avatar-11.png";
import avatar12 from "@/assets/avatars/avatar-12.png";
import avatar13 from "@/assets/avatars/avatar-13.png";
import avatar14 from "@/assets/avatars/avatar-14.png";
import avatar15 from "@/assets/avatars/avatar-15.png";
import avatar16 from "@/assets/avatars/avatar-16.png";
import anime1 from "@/assets/avatars/anime-1.png";
import anime2 from "@/assets/avatars/anime-2.png";
import anime3 from "@/assets/avatars/anime-3.png";
import anime4 from "@/assets/avatars/anime-4.png";
import anime5 from "@/assets/avatars/anime-5.png";
import anime6 from "@/assets/avatars/anime-6.png";
import anime7 from "@/assets/avatars/anime-7.png";
import anime8 from "@/assets/avatars/anime-8.png";

const AVATARS = [
  avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8,
  anime1, anime2, anime3, anime4, anime5, anime6, anime7, anime8,
  avatar9, avatar10, avatar11, avatar12, avatar13, avatar14, avatar15, avatar16,
];

// Kids-friendly avatars (indices)
const KIDS_AVATARS = [0, 1, 2, 3, 8, 9, 10, 11];

interface UserProfile {
  id: string;
  name: string;
  avatar_index: number;
  is_default: boolean;
  share_code: string | null;
  is_kids: boolean;
}

const MAX_PROFILES = 3;

const ProfileSelector = () => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(0);
  const [newIsKids, setNewIsKids] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [avatarTab, setAvatarTab] = useState<"classic" | "anime" | "special">("classic");
  const [showReport, setShowReport] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportSending, setReportSending] = useState(false);
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
      is_kids: profile.is_kids,
    }));
    navigate("/");
  };

  const createProfile = async () => {
    if (!newName.trim()) return;
    if (profiles.length >= MAX_PROFILES) {
      toast({ title: "Limite atingido", description: `Máximo de ${MAX_PROFILES} perfis por conta`, variant: "destructive" });
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
      is_kids: newIsKids,
    });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível criar o perfil", variant: "destructive" });
    } else {
      setCreating(false);
      setNewName("");
      setNewIsKids(false);
      await loadProfiles();
    }
    setLoading(false);
  };

  const updateProfile = async (id: string) => {
    if (!newName.trim()) return;
    await supabase.from("user_profiles").update({ name: newName.trim(), avatar_index: newAvatar, is_kids: newIsKids }).eq("id", id);
    setEditing(null);
    setNewName("");
    setNewIsKids(false);
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

  const handleSendReport = async () => {
    if (!reportTitle.trim() || !reportMessage.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setReportSending(true);
    const visitorId = localStorage.getItem("lyneflix_visitor_id") || "unknown";
    const { error } = await supabase.from("content_reports").insert({
      tmdb_id: 0,
      content_type: "feedback",
      title: reportTitle.trim().slice(0, 200),
      message: reportMessage.trim().slice(0, 1000),
      visitor_id: visitorId,
      page_url: "/perfis",
    });
    setReportSending(false);
    if (error) {
      toast({ title: "Erro ao enviar", variant: "destructive" });
    } else {
      toast({ title: "Enviado com sucesso!", description: "Obrigado pelo feedback!" });
      setShowReport(false);
      setReportTitle("");
      setReportMessage("");
    }
  };

  const classicAvatars = AVATARS.slice(0, 8);
  const animeAvatars = AVATARS.slice(8, 16);
  const specialAvatars = AVATARS.slice(16, 24);
  const displayAvatars = avatarTab === "classic" ? classicAvatars : avatarTab === "anime" ? animeAvatars : specialAvatars;

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
        <div className="w-full max-w-md glass-strong rounded-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300 border border-white/10">
          <h2 className="font-display text-xl font-bold text-center mb-6">
            {editing ? "Editar Perfil" : "Novo Perfil"}
          </h2>

          {/* Avatar preview */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <img
                src={AVATARS[newAvatar] || AVATARS[0]}
                alt="Avatar"
                className="w-24 h-24 rounded-xl object-cover shadow-lg border-2 border-primary/30"
              />
              {newIsKids && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
                  <Baby className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Tab selector */}
          <div className="flex justify-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setAvatarTab("classic")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                avatarTab === "classic"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
              }`}
            >
              Clássicos
            </button>
            <button
              onClick={() => setAvatarTab("anime")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                avatarTab === "anime"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
              }`}
            >
              🎌 Anime
            </button>
            <button
              onClick={() => setAvatarTab("special")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                avatarTab === "special"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
              }`}
            >
              ✨ Especial
            </button>
          </div>

          {/* Avatar picker */}
          <div className="flex justify-center gap-2 mb-6 flex-wrap">
            {displayAvatars.map((src, i) => {
              const globalIndex = avatarTab === "classic" ? i : avatarTab === "anime" ? i + 8 : i + 16;
              return (
                <button
                  key={globalIndex}
                  onClick={() => setNewAvatar(globalIndex)}
                  className={`w-12 h-12 rounded-lg overflow-hidden transition-all ${
                    newAvatar === globalIndex ? "ring-2 ring-primary scale-110" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={src} alt={`Avatar ${globalIndex + 1}`} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do perfil"
            className="w-full h-11 px-4 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors mb-4"
            maxLength={30}
            autoFocus
          />

          {/* Kids mode toggle */}
          <button
            onClick={() => setNewIsKids(!newIsKids)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-4 transition-all border ${
              newIsKids 
                ? "bg-green-500/10 border-green-500/30 text-green-400" 
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            <Baby className="w-5 h-5" />
            <div className="text-left flex-1">
              <span className="text-sm font-medium block">Modo Criança</span>
              <span className="text-[11px] opacity-70">Mostra apenas conteúdo infantil</span>
            </div>
            <div className={`w-10 h-6 rounded-full transition-all ${newIsKids ? "bg-green-500" : "bg-white/20"} relative`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${newIsKids ? "left-[18px]" : "left-0.5"}`} />
            </div>
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => { setCreating(false); setEditing(null); setNewName(""); setNewIsKids(false); }}
              className="flex-1 h-11 rounded-lg border border-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => editing ? updateProfile(editing) : createProfile()}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
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
        <div className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] rounded-full bg-blue-600/5 blur-[100px]" />
      </div>

      <div className={`transition-all duration-700 w-full max-w-2xl ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-center mb-2">Quem está assistindo?</h1>
        <p className="text-sm text-muted-foreground text-center mb-10">Escolha seu perfil</p>

        <div className="flex flex-wrap justify-center gap-5 sm:gap-8 mb-10">
          {profiles.map((profile, i) => (
            <div
              key={profile.id}
              className="group flex flex-col items-center gap-3 cursor-pointer animate-in fade-in zoom-in-95"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="relative">
                <button
                  onClick={() => selectProfile(profile)}
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl overflow-hidden shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-primary/20 border-2 border-transparent group-hover:border-primary/40"
                >
                  <img
                    src={AVATARS[profile.avatar_index] || AVATARS[0]}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                </button>
                {profile.is_kids && (
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
                    <Baby className="w-3 h-3 text-white" />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(profile.id);
                    setNewName(profile.name);
                    setNewAvatar(profile.avatar_index);
                    setNewIsKids(profile.is_kids);
                    setAvatarTab(profile.avatar_index >= 16 ? "special" : profile.avatar_index >= 8 ? "anime" : "classic");
                  }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              <span className="text-sm font-medium text-center max-w-[130px] truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {profile.name}
              </span>

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
          {profiles.length < MAX_PROFILES && (
            <button
              onClick={() => { setCreating(true); setNewAvatar(Math.floor(Math.random() * AVATARS.length)); setAvatarTab("classic"); setNewIsKids(false); }}
              className="flex flex-col items-center gap-3 cursor-pointer group"
            >
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center transition-all group-hover:border-primary/50 group-hover:bg-white/5">
                <Plus className="w-10 h-10 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground">Adicionar</span>
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>

          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-primary/80 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Está com problemas? Clique aqui
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowReport(false)} />
          <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300 p-6 space-y-4">
            <button
              onClick={() => setShowReport(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-display font-bold text-foreground pr-8">🛠️ Reportar Problema</h2>
            <p className="text-xs text-muted-foreground">Descreva o problema e nossa equipe irá resolver o mais rápido possível.</p>

            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Título do problema"
              className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
              maxLength={200}
            />

            <Textarea
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              placeholder="Descreva o problema com detalhes..."
              className="bg-white/5 border-white/10 text-sm min-h-[100px] resize-none"
              maxLength={1000}
            />

            <button
              onClick={handleSendReport}
              disabled={reportSending || !reportTitle.trim() || !reportMessage.trim()}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reportSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {reportSending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSelector;
