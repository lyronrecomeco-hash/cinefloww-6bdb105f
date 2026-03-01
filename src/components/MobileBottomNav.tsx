import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Clapperboard, MonitorPlay, Headphones, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { label: "Início", path: "/", icon: Home },
  { label: "Filmes", path: "/filmes", icon: Clapperboard },
  { label: "Séries", path: "/series", icon: MonitorPlay },
  { label: "Ao Vivo", path: "/tv", icon: Radio, isLive: true },
  { label: "Support", path: "/suporte", icon: Headphones, supportBadge: true },
];

const MobileBottomNav = () => {
  const location = useLocation();
  const [answeredCount, setAnsweredCount] = useState(0);

  // Check for answered tickets (new replies from support)
  useEffect(() => {
    let mounted = true;

    const checkAnswered = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("support_tickets")
        .select("id")
        .eq("status", "answered")
        .limit(50);
      if (mounted) setAnsweredCount((data || []).length);
    };

    checkAnswered();

    const channel = supabase
      .channel("mobile-support-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => checkAnswered())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Hide on player, admin, auth pages
  const hiddenPaths = ["/player", "/admin", "/conta", "/perfis", "/qrxp"];
  if (hiddenPaths.some((p) => location.pathname.startsWith(p))) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1.5 rounded-xl transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                {(item as any).isLive && (
                  <span className="absolute -top-1 -right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                )}
                {(item as any).supportBadge && answeredCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center animate-pulse">
                    {answeredCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight truncate max-w-[56px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
