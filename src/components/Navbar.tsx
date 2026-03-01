import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, User, LogIn, LayoutGrid, Radio } from "lucide-react";
import { searchMulti, TMDBMovie, posterUrl, getDisplayTitle, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";
import { supabase } from "@/integrations/supabase/client";
import RequestModal from "@/components/RequestModal";
import CategoriesModal from "@/components/CategoriesModal";
import CineVeoModal from "@/components/CineVeoModal";
import avatar1 from "@/assets/avatars/avatar-1.png";
import avatar2 from "@/assets/avatars/avatar-2.png";
import avatar3 from "@/assets/avatars/avatar-3.png";
import avatar4 from "@/assets/avatars/avatar-4.png";
import avatar5 from "@/assets/avatars/avatar-5.png";
import avatar6 from "@/assets/avatars/avatar-6.png";
import avatar7 from "@/assets/avatars/avatar-7.png";
import avatar8 from "@/assets/avatars/avatar-8.png";
import anime1 from "@/assets/avatars/anime-1.png";
import anime2 from "@/assets/avatars/anime-2.png";
import anime3 from "@/assets/avatars/anime-3.png";
import anime4 from "@/assets/avatars/anime-4.png";
import anime5 from "@/assets/avatars/anime-5.png";
import anime6 from "@/assets/avatars/anime-6.png";
import anime7 from "@/assets/avatars/anime-7.png";
import anime8 from "@/assets/avatars/anime-8.png";
import cineveoIcon from "@/assets/cineveo-icon.png";
const AVATAR_IMAGES = [avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8, anime1, anime2, anime3, anime4, anime5, anime6, anime7, anime8];

const navItems = [
  { label: "Início", path: "/" },
  { label: "Filmes", path: "/filmes" },
  { label: "Séries", path: "/series" },
  { label: "Lançamentos", path: "/lancamentos" },
  { label: "Em Breve", path: "/em-breve" },
  { label: "Minha Lista", path: "/minha-lista" },
];

const Navbar = () => {
  const [showRequest, setShowRequest] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showCineVeo, setShowCineVeo] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [searching, setSearching] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeProfile, setActiveProfile] = useState<{ name: string; avatar_index: number } | null>(null);
  const [cineveoPartner, setCineveoPartner] = useState<{ show_navbar_icon: boolean; icon_url?: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    try {
      const stored = localStorage.getItem("lyneflix_active_profile");
      if (stored) setActiveProfile(JSON.parse(stored));
    } catch {}

    // Load CineVeo partner config
    supabase.from("partners").select("show_navbar_icon, icon_url").eq("active", true).order("sort_order").limit(1).then(({ data }) => {
      if (data?.[0]) setCineveoPartner(data[0]);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
    try {
      const stored = localStorage.getItem("lyneflix_active_profile");
      if (stored) setActiveProfile(JSON.parse(stored));
    } catch {}
  }, [location]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      searchMulti(query).then((data) => {
        setResults(data.results.filter(r => r.poster_path).slice(0, 8));
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleResultClick = (item: TMDBMovie) => {
    const type = getMediaType(item);
    const title = getDisplayTitle(item);
    navigate(type === "movie" ? `/filme/${toSlug(title, item.id)}` : `/serie/${toSlug(title, item.id)}`);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <>
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/80 backdrop-blur-2xl border-b border-white/10 shadow-lg shadow-background/50"
          : "bg-gradient-to-b from-background/80 to-transparent"
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-12 flex items-center justify-between h-14 sm:h-16 lg:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-1.5 group">
          <span
            className="font-display font-black text-lg sm:text-xl tracking-tight select-none"
            style={{
              background: "linear-gradient(135deg, hsl(217 91% 70%), hsl(217 91% 50%), hsl(230 80% 45%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 12px hsl(217 91% 60% / 0.3))",
            }}
          >
            LYNEFLIX
          </span>
        </Link>

        {/* Desktop Nav — hidden on mobile (bottom nav handles it) */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                location.pathname === item.path
                  ? "text-foreground bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Categories */}
          <button
            onClick={() => setShowCategories(true)}
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Categorias"
          >
            <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Ao Vivo */}
          <Link
            to="/lynetv"
            className="relative hidden md:flex w-9 h-9 sm:w-10 sm:h-10 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="TV ao Vivo"
          >
            <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          </Link>

          {/* CineVeo Partner Icon */}
          {cineveoPartner?.show_navbar_icon && (
            <button
              onClick={() => setShowCineVeo(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors overflow-hidden"
              title="Parceiro"
            >
              <img src={cineveoIcon} alt="Parceiro" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
            </button>
          )}

          {/* Search */}
          <div ref={searchRef} className="relative">
            <div className={`flex items-center transition-all duration-300 ${searchOpen ? "w-56 sm:w-80" : "w-9 sm:w-10"}`}>
              {searchOpen && (
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar filmes, séries..."
                  autoFocus
                  className="w-full h-9 sm:h-11 pl-9 sm:pl-11 pr-3 sm:pr-4 rounded-2xl bg-white/10 border border-white/15 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 backdrop-blur-xl"
                />
              )}
              <button
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  if (!searchOpen) setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className={`${searchOpen ? "absolute left-0" : ""} w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground transition-colors ${!searchOpen ? "bg-white/5 border border-white/10 hover:bg-white/10" : ""}`}
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Results dropdown */}
            {searchOpen && (query.length >= 2) && (
              <div className="absolute top-full mt-2 right-0 w-[calc(100vw-2rem)] sm:w-96 glass-strong z-50 max-h-[70vh] overflow-y-auto scrollbar-hide">
                {searching ? (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : results.length ? (
                  <div className="p-2">
                    {results.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleResultClick(item)}
                        className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
                      >
                        <img
                          src={posterUrl(item.poster_path, "w92")}
                          alt={getDisplayTitle(item)}
                          className="w-10 h-14 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium line-clamp-1">{getDisplayTitle(item)}</p>
                          <p className="text-xs text-muted-foreground">
                            {getMediaType(item) === "movie" ? "Filme" : "Série"}
                            {item.vote_average > 0 && ` • ★ ${item.vote_average.toFixed(1)}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-6">Nenhum resultado encontrado</p>
                )}
              </div>
            )}
          </div>

          {/* Auth button / Profile avatar */}
          {isLoggedIn ? (
            <button
              onClick={() => navigate("/perfis")}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border-2 border-transparent hover:border-primary/50 transition-all flex-shrink-0"
              title={activeProfile?.name || "Perfil"}
            >
              {activeProfile ? (
              <img
                  src={AVATAR_IMAGES[activeProfile.avatar_index % AVATAR_IMAGES.length]}
                  alt={activeProfile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-white/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </button>
          ) : (
            <Link
              to="/conta"
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-all"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Entrar</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
    {showRequest && <RequestModal onClose={() => setShowRequest(false)} />}
    {showCineVeo && <CineVeoModal onClose={() => setShowCineVeo(false)} />}
    <CategoriesModal
      open={showCategories}
      onClose={() => setShowCategories(false)}
      onSelect={(cat) => {
        if (!cat) {
          navigate("/filmes");
        } else {
          navigate(`/filmes?genre=${cat.id}&genreName=${encodeURIComponent(cat.name)}`);
        }
      }}
      selectedId={null}
      contentType="movie"
    />
    </>
  );
};

export default Navbar;
