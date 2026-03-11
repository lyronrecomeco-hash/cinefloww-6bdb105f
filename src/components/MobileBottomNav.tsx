import { Link, useLocation } from "react-router-dom";
import { Home, Clapperboard, MonitorPlay, Radio, Sparkles } from "lucide-react";

const navItems = [
  { label: "Início", path: "/", icon: Home },
  { label: "Filmes", path: "/filmes", icon: Clapperboard },
  { label: "Séries", path: "/series", icon: MonitorPlay },
  { label: "Animes", path: "/animes", icon: Sparkles },
  { label: "Ao Vivo", path: "/lynetv", icon: Radio, isLive: true },
];

const MobileBottomNav = () => {
  const location = useLocation();

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
                isActive ? "text-primary" : "text-muted-foreground"
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
