import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Film, Tv, Sparkles, Drama, FolderOpen, ScrollText,
  Settings, LogOut, Menu, X, ChevronRight, Database, MessageSquare, Bell, Shield, Bot, Radio, Users, BarChart3
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Filmes", path: "/admin/filmes", icon: Film },
  { label: "Séries", path: "/admin/series", icon: Tv },
  { label: "Doramas", path: "/admin/doramas", icon: Drama },
  { label: "Animes", path: "/admin/animes", icon: Sparkles },
  { label: "Pedidos", path: "/admin/pedidos", icon: MessageSquare, badge: true },
  { label: "ADS Métrica", path: "/admin/ads", icon: BarChart3 },
  { label: "Categorias", path: "/admin/categorias", icon: FolderOpen },
  { label: "Banco", path: "/admin/banco", icon: Database },
  { label: "Bot Discord", path: "/admin/discord", icon: Bot },
  { label: "Logs", path: "/admin/logs", icon: ScrollText },
  { label: "Segurança", path: "/admin/seguranca", icon: Shield },
  { label: "Bot Telegram", path: "/admin/telegram", icon: Bot },
  { label: "Usuários", path: "/admin/usuarios", icon: Users },
  { label: "Avisos", path: "/admin/avisos", icon: Bell },
  { label: "Watch Together", path: "/admin/watch-rooms", icon: Radio },
  { label: "Configurações", path: "/admin/config", icon: Settings },
];

// Simple notification sound using Web Audio API
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
  const [pendingRequests, setPendingRequests] = useState(0);
  const prevPendingRef = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAdminRole = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin");
        return !!(data && data.length > 0);
      } catch {
        return false;
      }
    };

    // Listener for ongoing auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT") navigate("/admin/login");
      if (session?.user) {
        setUserEmail(session.user.email || "");
        setTimeout(() => {
          if (isMounted) {
            checkAdminRole(session.user.id).then(isAdmin => {
              if (isMounted && !isAdmin) {
                supabase.auth.signOut();
                navigate("/admin/login");
              }
            });
          }
        }, 0);
      }
    });

    // Initial auth check
    const initAuth = async () => {
      try {
        const { data: { session }, error: sessErr } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (sessErr || !session) { navigate("/admin/login"); return; }

        const isAdmin = await checkAdminRole(session.user.id);
        if (!isMounted) return;
        if (!isAdmin) {
          try { await supabase.auth.signOut(); } catch {}
          navigate("/admin/login");
          return;
        }

        setUserEmail(session.user.email || "");

        // Fetch initial pending count (non-blocking, with timeout)
        const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
          Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
        try {
          const result = await withTimeout(
            supabase.from("content_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
            5000
          );
          if (isMounted && result) {
            const c = (result as any).count || 0;
            setPendingRequests(c);
            prevPendingRef.current = c;
          }
        } catch {}
      } catch (err) {
        console.error("[AdminLayout] initAuth error:", err);
        if (isMounted) navigate("/admin/login");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

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
            const newCount = prev + 1;
            // Play sound for new request
            playNotificationSound();
            return newCount;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content_requests" },
        (payload) => {
          // If status changed FROM pending, decrement
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
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
              <p className="text-[10px] text-muted-foreground">Administrador</p>
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
          <aside className="relative w-[260px] max-w-[85vw] h-full bg-card border-r border-white/10 flex flex-col overflow-y-auto">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarOpen ? "lg:ml-60" : "lg:ml-[68px]"}`}>
        {/* Top bar */}
        <header className="h-14 border-b border-white/10 bg-card/30 backdrop-blur-xl flex items-center px-3 sm:px-4 gap-2 sm:gap-3 sticky top-0 z-30">
          <button
            onClick={() => { if (window.innerWidth < 1024) setMobileOpen(true); else setSidebarOpen(!sidebarOpen); }}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex-1" />
          {pendingRequests > 0 && (
            <button
              onClick={() => navigate("/admin/pedidos")}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] sm:text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{pendingRequests} pedido{pendingRequests > 1 ? "s" : ""}</span>
              <span className="xs:hidden">{pendingRequests}</span>
            </button>
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">Painel Administrativo</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
