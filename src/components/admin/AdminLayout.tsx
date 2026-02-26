import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Film, Tv, Sparkles, Drama, FolderOpen, ScrollText,
  Settings, LogOut, Menu, X, ChevronRight, Database, MessageSquare, Bell, Shield, Bot, Flag, Radio, Users, Wrench, Server, Cloud, Search
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Filmes", path: "/admin/filmes", icon: Film },
  { label: "Séries", path: "/admin/series", icon: Tv },
  { label: "Doramas", path: "/admin/doramas", icon: Drama },
  { label: "Animes", path: "/admin/animes", icon: Sparkles },
  { label: "Pedidos", path: "/admin/pedidos", icon: MessageSquare, badge: true },
  { label: "ADS Manager", path: "/admin/ads", icon: Flag },
  { label: "Categorias", path: "/admin/categorias", icon: FolderOpen },
  { label: "Banco", path: "/admin/banco", icon: Database },
  { label: "Fontes & Vídeos", path: "/admin/fontes", icon: Wrench },
  { label: "Integrações", path: "/admin/integracoes", icon: Bot },
  { label: "Logs", path: "/admin/logs", icon: ScrollText },
  { label: "VPS Manager", path: "/admin/vps", icon: Server },
  { label: "R2 CDN", path: "/admin/r2", icon: Cloud },
  { label: "Segurança", path: "/admin/seguranca", icon: Shield },
  { label: "Usuários", path: "/admin/usuarios", icon: Users },
  { label: "Avisos", path: "/admin/avisos", icon: Bell },
  { label: "Watch Together", path: "/admin/watch-rooms", icon: Radio },
  { label: "Configurações", path: "/admin/config", icon: Settings },
];

const withTimeout = <T,>(promise: Promise<T>, ms = 6000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timer));
  });

const ROLE_CACHE_KEY = "_admin_role_cache";

const playNotificationSound = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
};

const AdminLayout = () => {
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<string>("admin");
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [menuQuery, setMenuQuery] = useState("");
  const prevPendingRef = useRef(0);
  const navSearchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        if (window.innerWidth < 1024) setMobileOpen(true);
        requestAnimationFrame(() => navSearchRef.current?.focus());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 6000);
        if (!isMounted) return;
        if (!session) { navigate("/admin/login"); return; }

        // Check admin or moderator role (with cached fallback when Cloud is overloaded)
        let role: string | null = null;
        try {
          const rolesResp = await withTimeout(
            (async () => await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .in("role", ["admin", "moderator"]))(),
            6000
          );
          const roles = (rolesResp as any)?.data;
          if (roles?.length) {
            role = roles[0].role;
            localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId: session.user.id, role, ts: Date.now() }));
          }
        } catch {
          const raw = localStorage.getItem(ROLE_CACHE_KEY);
          if (raw) {
            try {
              const cached = JSON.parse(raw) as { userId: string; role: string; ts: number };
              const freshEnough = Date.now() - cached.ts < 12 * 60 * 60 * 1000;
              if (cached.userId === session.user.id && freshEnough && ["admin", "moderator"].includes(cached.role)) {
                role = cached.role;
              }
            } catch {}
          }
        }

        if (!isMounted) return;
        if (!role) { await supabase.auth.signOut(); navigate("/admin/login"); return; }

        setUserRole(role);
        setUserEmail(session.user.email || "");

        // If moderator, load allowed paths
        if (role === "moderator") {
          const permsResp = await withTimeout(
            (async () => await supabase
              .from("admin_permissions")
              .select("allowed_paths")
              .eq("user_id", session.user.id)
              .maybeSingle())(),
            6000
          );
          const { data: perms } = permsResp;

          if (isMounted && perms?.allowed_paths) {
            setAllowedPaths(perms.allowed_paths as string[]);
          }
        }

        // Fetch initial pending count (non-blocking, with tight timeout)
        const pendingPromise = supabase
          .from("content_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");

        Promise.race([
          pendingPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]).then((result) => {
          if (!isMounted || !result) return;
          const { count } = result as any;
          const c = count || 0;
          setPendingRequests(c);
          prevPendingRef.current = c;
        }).catch(() => {});
      } catch (err) {
        console.error("[AdminLayout] Auth check failed:", err);
        if (isMounted) navigate("/admin/login");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate("/admin/login");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Real-time subscription for new requests
  useEffect(() => {
    const channel = supabase
      .channel("admin-requests")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_requests" },
        () => {
          setPendingRequests((prev) => {
            playNotificationSound();
            return prev + 1;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content_requests" },
        (payload) => {
          if (payload.old && (payload.old as any).status === "pending" && (payload.new as any).status !== "pending") {
            setPendingRequests((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  // Filter menu items based on role and permissions + search query
  const roleMenuItems = userRole === "admin"
    ? menuItems
    : menuItems.filter((item) => allowedPaths.includes(item.path));

  const visibleMenuItems = roleMenuItems.filter((item) =>
    item.label.toLowerCase().includes(menuQuery.trim().toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-display font-bold text-lg">L</span>
          </div>
          {sidebarOpen && (
            <span className="font-display font-bold text-lg tracking-tight">
              Lyne<span className="text-gradient">Flix</span>
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={navSearchRef}
            type="text"
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            placeholder="Buscar no painel (Ctrl+K)"
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-transparent">
        {visibleMenuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {sidebarOpen && (
                <span className="relative">
                  {item.label}
                  {(item as any).badge && pendingRequests > 0 && (
                    <span className="absolute -top-2 -right-5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
                      {pendingRequests}
                    </span>
                  )}
                </span>
              )}
              {isActive && sidebarOpen && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
            </button>
          );
        })}

        {visibleMenuItems.length === 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">Nenhum item encontrado.</p>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className={`flex items-center gap-3 px-3 py-2 ${sidebarOpen ? "" : "justify-center"}`}>
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{userEmail.charAt(0).toUpperCase()}</span>
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{userEmail}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{userRole}</p>
            </div>
          )}
          {sidebarOpen && (
            <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-white/10 bg-card/50 backdrop-blur-xl transition-all duration-300 fixed top-0 left-0 h-screen z-40 ${
          sidebarOpen ? "w-60" : "w-[68px]"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-60 h-full bg-card border-r border-white/10 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? "lg:ml-60" : "lg:ml-[68px]"}`}>
        {/* Top bar */}
        <header className="h-14 border-b border-white/10 bg-card/30 backdrop-blur-xl flex items-center px-4 gap-3 sticky top-0 z-30">
          <button
            onClick={() => { if (window.innerWidth < 1024) setMobileOpen(true); else setSidebarOpen(!sidebarOpen); }}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          {pendingRequests > 0 && (
            <button
              onClick={() => navigate("/admin/pedidos")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {pendingRequests} pedido{pendingRequests > 1 ? "s" : ""}
            </button>
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">Painel Administrativo</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
