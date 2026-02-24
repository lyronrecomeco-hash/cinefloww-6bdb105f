import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, Search, Ban, CheckCircle, Shield, Clock, Eye, X, Loader2, RefreshCw,
  UserPlus, Key, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  ip_hash: string | null;
  last_login_at: string | null;
  login_count: number;
  banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  created_at: string;
}

interface AuditLog {
  id: string;
  event: string;
  ip_hash: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface SiteActivity {
  id: string;
  pathname: string | null;
  visited_at: string;
}

interface WatchActivity {
  tmdb_id: number;
  content_type: string;
  progress_seconds: number;
  duration_seconds: number;
  season: number | null;
  episode: number | null;
  updated_at: string;
}

interface AdminUser {
  user_id: string;
  email: string;
  role: string;
  allowed_paths: string[];
}

const ADMIN_TABS = [
  { path: "/admin", label: "Dashboard" },
  { path: "/admin/filmes", label: "Filmes" },
  { path: "/admin/series", label: "Séries" },
  { path: "/admin/doramas", label: "Doramas" },
  { path: "/admin/animes", label: "Animes" },
  { path: "/admin/pedidos", label: "Pedidos" },
  { path: "/admin/ads", label: "ADS Manager" },
  { path: "/admin/categorias", label: "Categorias" },
  { path: "/admin/banco", label: "Banco" },
  { path: "/admin/discord", label: "Bot Discord" },
  { path: "/admin/logs", label: "Logs" },
  { path: "/admin/seguranca", label: "Segurança" },
  { path: "/admin/telegram", label: "Bot Telegram" },
  { path: "/admin/usuarios", label: "Usuários" },
  { path: "/admin/avisos", label: "Avisos" },
  { path: "/admin/watch-rooms", label: "Watch Together" },
  { path: "/admin/config", label: "Configurações" },
];

const UsersPage = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [userLogs, setUserLogs] = useState<AuditLog[]>([]);
  const [siteActivity, setSiteActivity] = useState<SiteActivity[]>([]);
  const [watchActivity, setWatchActivity] = useState<WatchActivity[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<"activity" | "auth" | "watch">("activity");
  const [banReason, setBanReason] = useState("");
  const [stats, setStats] = useState({ total: 0, banned: 0, today: 0 });
  const { toast } = useToast();

  // Create admin state
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<"admin" | "moderator">("moderator");
  const [newAdminPaths, setNewAdminPaths] = useState<string[]>(["/admin"]);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Admin users list
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [editingAdmin, setEditingAdmin] = useState<string | null>(null);
  const [editPaths, setEditPaths] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const p = (data as Profile[]) || [];
    setProfiles(p);

    const today = new Date().toISOString().split("T")[0];
    setStats({
      total: p.length,
      banned: p.filter((u) => u.banned).length,
      today: p.filter((u) => u.created_at.startsWith(today)).length,
    });
    setLoading(false);
  }, []);

  const fetchAdminUsers = useCallback(async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (!roles?.length) return;

    const userIds = roles.map((r) => r.user_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, email")
      .in("user_id", userIds);

    const { data: perms } = await supabase.from("admin_permissions").select("user_id, allowed_paths");

    const admins: AdminUser[] = roles.map((r) => {
      const prof = profs?.find((p) => p.user_id === r.user_id);
      const perm = perms?.find((p) => p.user_id === r.user_id);
      return {
        user_id: r.user_id,
        email: prof?.email || "—",
        role: r.role,
        allowed_paths: (perm?.allowed_paths as string[]) || [],
      };
    });
    setAdminUsers(admins);
  }, []);

  useEffect(() => {
    fetchProfiles();
    fetchAdminUsers();

    const channel = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchProfiles())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchProfiles, fetchAdminUsers]);

  const openDetail = async (profile: Profile) => {
    setSelected(profile);
    setLogsLoading(true);
    setBanReason(profile.ban_reason || "");
    setActiveLogTab("activity");

    const authPromise = supabase
      .from("auth_audit_log")
      .select("*")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const sitePromise = profile.ip_hash
      ? supabase
          .from("site_visitors")
          .select("id, pathname, visited_at")
          .eq("ip_hash", profile.ip_hash)
          .order("visited_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as SiteActivity[] });

    const watchPromise = supabase
      .from("watch_progress")
      .select("tmdb_id, content_type, progress_seconds, duration_seconds, season, episode, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    const [authRes, siteRes, watchRes] = await Promise.all([authPromise, sitePromise, watchPromise]);

    setUserLogs((authRes.data as AuditLog[]) || []);
    setSiteActivity((siteRes.data as SiteActivity[]) || []);
    setWatchActivity((watchRes.data as WatchActivity[]) || []);
    setLogsLoading(false);
  };

  const toggleBan = async (profile: Profile) => {
    const newBanned = !profile.banned;
    await supabase
      .from("profiles")
      .update({
        banned: newBanned,
        ban_reason: newBanned ? banReason || "Violação dos termos de uso" : null,
        banned_at: newBanned ? new Date().toISOString() : null,
      })
      .eq("user_id", profile.user_id);

    await supabase.from("auth_audit_log").insert({
      user_id: profile.user_id,
      event: newBanned ? "admin_ban" : "admin_unban",
      metadata: { reason: banReason, admin: true },
    });

    toast({
      title: newBanned ? "Usuário banido" : "Usuário desbanido",
      description: `${profile.email} foi ${newBanned ? "banido" : "desbanido"}.`,
    });
    setSelected(null);
    fetchProfiles();
  };

  const handleCreateAdmin = async () => {
    if (!newAdminEmail.trim() || !newAdminPassword.trim()) return;
    setCreatingAdmin(true);

    try {
      // Create user via edge function
      const { data, error } = await supabase.functions.invoke("create-admin", {
        body: { email: newAdminEmail.trim(), password: newAdminPassword },
      });

      if (error) throw error;
      const userId = data?.user_id || data?.id;
      if (!userId) throw new Error("Falha ao criar usuário");

      // Assign role
      await supabase.from("user_roles").upsert({
        user_id: userId,
        role: newAdminRole,
      }, { onConflict: "user_id,role" });

      // Save permissions
      await supabase.from("admin_permissions").upsert({
        user_id: userId,
        allowed_paths: newAdminPaths,
      }, { onConflict: "user_id" });

      toast({ title: "Admin criado!", description: `${newAdminEmail} agora é ${newAdminRole}.` });
      setShowCreateAdmin(false);
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminPaths(["/admin"]);
      fetchAdminUsers();
      fetchProfiles();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleSavePermissions = async (userId: string) => {
    setSavingPerms(true);
    try {
      await supabase.from("admin_permissions").upsert({
        user_id: userId,
        allowed_paths: editPaths,
      }, { onConflict: "user_id" });

      toast({ title: "Permissões salvas!" });
      setEditingAdmin(null);
      fetchAdminUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingPerms(false);
    }
  };

  const togglePath = (path: string, paths: string[], setPaths: (p: string[]) => void) => {
    setPaths(paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path]);
  };

  const filtered = profiles.filter(
    (p) =>
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.ip_hash || "").includes(search)
  );

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gerenciamento de contas, admins e permissões</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateAdmin(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm hover:bg-primary/20 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Criar Admin
          </button>
          <button
            onClick={fetchProfiles}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Admin Users Section */}
      {adminUsers.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-primary" />
            Administradores ({adminUsers.length})
          </h2>
          <div className="space-y-2">
            {adminUsers.map((admin) => (
              <div key={admin.user_id} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{admin.email.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{admin.email}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        admin.role === "admin" ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {admin.role.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (editingAdmin === admin.user_id) {
                        setEditingAdmin(null);
                      } else {
                        setEditingAdmin(admin.user_id);
                        setEditPaths(admin.allowed_paths);
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    {editingAdmin === admin.user_id ? "Cancelar" : "Permissões"}
                  </button>
                </div>

                {/* Permissions editor */}
                {editingAdmin === admin.user_id && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-muted-foreground mb-2">Selecione as abas que este usuário pode acessar:</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {ADMIN_TABS.map((tab) => (
                        <button
                          key={tab.path}
                          onClick={() => togglePath(tab.path, editPaths, setEditPaths)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                            editPaths.includes(tab.path)
                              ? "bg-primary/20 border-primary/30 text-primary"
                              : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditPaths(ADMIN_TABS.map((t) => t.path))}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        Selecionar tudo
                      </button>
                      <button
                        onClick={() => handleSavePermissions(admin.user_id)}
                        disabled={savingPerms}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors flex items-center gap-1"
                      >
                        {savingPerms ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-primary">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.today}</p>
          <p className="text-xs text-muted-foreground">Hoje</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{stats.banned}</p>
          <p className="text-xs text-muted-foreground">Banidos</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email, nome ou IP..."
          className="w-full h-11 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">Nenhum usuário encontrado</p>
        ) : (
          filtered.map((profile) => (
            <button
              key={profile.id}
              onClick={() => openDetail(profile)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(profile.display_name || profile.email).charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.display_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {profile.banned && (
                  <span className="px-2 py-0.5 rounded-full bg-destructive/20 text-destructive text-[10px] font-medium">
                    BANIDO
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground hidden sm:block">
                  {formatDate(profile.created_at)}
                </span>
                <Eye className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Create Admin Modal */}
      {showCreateAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowCreateAdmin(false)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto glass-strong rounded-3xl p-6 animate-in fade-in zoom-in-95 duration-300">
            <button onClick={() => setShowCreateAdmin(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Criar Administrador
            </h3>
            <p className="text-xs text-muted-foreground mb-6">Crie uma conta com acesso ao painel administrativo.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@lyneflix.online"
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Senha</label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Função</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewAdminRole("admin")}
                    className={`flex-1 h-11 rounded-xl text-sm font-medium border transition-colors ${
                      newAdminRole === "admin"
                        ? "bg-primary/20 border-primary/30 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    Admin (total)
                  </button>
                  <button
                    onClick={() => setNewAdminRole("moderator")}
                    className={`flex-1 h-11 rounded-xl text-sm font-medium border transition-colors ${
                      newAdminRole === "moderator"
                        ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    Moderador
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Abas permitidas {newAdminRole === "admin" && <span className="text-primary">(Admin tem acesso total)</span>}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ADMIN_TABS.map((tab) => (
                    <button
                      key={tab.path}
                      onClick={() => togglePath(tab.path, newAdminPaths, setNewAdminPaths)}
                      disabled={newAdminRole === "admin"}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                        newAdminRole === "admin" || newAdminPaths.includes(tab.path)
                          ? "bg-primary/20 border-primary/30 text-primary"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                      } disabled:opacity-60`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateAdmin}
                disabled={creatingAdmin || !newAdminEmail.trim() || !newAdminPassword.trim()}
                className="w-full h-12 rounded-xl font-semibold text-sm bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {creatingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {creatingAdmin ? "Criando..." : "Criar Administrador"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto glass-strong rounded-3xl p-6 animate-in fade-in zoom-in-95 duration-300">
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
                <span className="text-xl font-bold text-primary">
                  {(selected.display_name || selected.email).charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">{selected.display_name || "Sem nome"}</h3>
                <p className="text-sm text-muted-foreground">{selected.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="glass rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Criado em</p>
                <p className="text-xs font-medium">{formatDate(selected.created_at)}</p>
              </div>
              <div className="glass rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Último login</p>
                <p className="text-xs font-medium">{formatDate(selected.last_login_at)}</p>
              </div>
              <div className="glass rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Logins</p>
                <p className="text-xs font-medium">{selected.login_count}</p>
              </div>
              <div className="glass rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">IP Hash</p>
                <p className="text-xs font-mono">{selected.ip_hash || "—"}</p>
              </div>
            </div>

            <div className="glass rounded-xl p-4 mb-6">
              <p className="text-xs font-medium mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {selected.banned ? "Usuário banido" : "Ações de segurança"}
              </p>
              {selected.banned && (
                <p className="text-xs text-destructive mb-2">Motivo: {selected.ban_reason || "Não especificado"}</p>
              )}
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Motivo do banimento..."
                className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-xs mb-3 focus:outline-none focus:border-primary/50"
                maxLength={200}
              />
              <button
                onClick={() => toggleBan(selected)}
                className={`w-full h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  selected.banned
                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    : "bg-destructive/20 text-destructive hover:bg-destructive/30"
                }`}
              >
                {selected.banned ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                {selected.banned ? "Desbanir" : "Banir usuário"}
              </button>
            </div>

            <div>
              <p className="text-xs font-medium mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Logs do Usuário
              </p>

              {/* Tab selector */}
              <div className="flex gap-1 mb-3">
                {([
                  { key: "activity" as const, label: "Navegação", count: siteActivity.length },
                  { key: "watch" as const, label: "Assistidos", count: watchActivity.length },
                  { key: "auth" as const, label: "Auth", count: userLogs.length },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveLogTab(tab.key)}
                    className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                      activeLogTab === tab.key
                        ? "bg-primary/20 border-primary/30 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {logsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {/* Site Activity Tab */}
                  {activeLogTab === "activity" && (
                    siteActivity.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem registros de navegação</p>
                    ) : (
                      siteActivity.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] text-xs">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                            {v.pathname || "/"}
                          </span>
                          <span className="ml-auto text-muted-foreground/60">{formatDate(v.visited_at)}</span>
                        </div>
                      ))
                    )
                  )}

                  {/* Watch Activity Tab */}
                  {activeLogTab === "watch" && (
                    watchActivity.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem registros de reprodução</p>
                    ) : (
                      watchActivity.map((w, i) => {
                        const pct = w.duration_seconds > 0 ? Math.round((w.progress_seconds / w.duration_seconds) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] text-xs">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pct >= 90 ? "bg-emerald-400" : "bg-amber-400"}`} />
                            <span className="font-mono text-muted-foreground">TMDB:{w.tmdb_id}</span>
                            <span className="text-muted-foreground/60">{w.content_type}</span>
                            {w.season != null && <span className="text-muted-foreground/60">S{w.season}E{w.episode}</span>}
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">{pct}%</span>
                            <span className="ml-auto text-muted-foreground/60">{formatDate(w.updated_at)}</span>
                          </div>
                        );
                      })
                    )
                  )}

                  {/* Auth Tab */}
                  {activeLogTab === "auth" && (
                    userLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem registros de autenticação</p>
                    ) : (
                      userLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] text-xs">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            log.event.includes("fail") || log.event.includes("ban") ? "bg-destructive" :
                            log.event.includes("success") || log.event.includes("signup") ? "bg-emerald-400" :
                            "bg-muted-foreground"
                          }`} />
                          <span className="font-mono text-muted-foreground">{log.event}</span>
                          <span className="ml-auto text-muted-foreground/60">{formatDate(log.created_at)}</span>
                        </div>
                      ))
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
