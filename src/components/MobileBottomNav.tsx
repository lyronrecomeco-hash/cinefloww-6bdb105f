import { Link, useLocation } from "react-router-dom";
import { Home, Clapperboard, MonitorPlay, Bookmark, Headphones } from "lucide-react";

const navItems = [
  { label: "Início", path: "/", icon: Home },
  { label: "Filmes", path: "/filmes", icon: Clapperboard },
  { label: "Séries", path: "/series", icon: MonitorPlay },
  { label: "Minha Lista", path: "/minha-lista", icon: Bookmark },
  { label: "Suporte", path: "/suporte", icon: Headphones },
];

const MobileBottomNav = () => {
  const location = useLocation();

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
              className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1.5 rounded-xl transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
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
