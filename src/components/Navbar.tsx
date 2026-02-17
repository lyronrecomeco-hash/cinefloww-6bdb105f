import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Menu, X, MessageSquare } from "lucide-react";
import { searchMulti, TMDBMovie, posterUrl, getDisplayTitle, getMediaType } from "@/services/tmdb";
import RequestModal from "@/components/RequestModal";

const navItems = [
  { label: "Início", path: "/" },
  { label: "Filmes", path: "/filmes" },
  { label: "Séries", path: "/series" },
];

const Navbar = () => {
  const [showRequest, setShowRequest] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [searching, setSearching] = useState(false);
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
    setMenuOpen(false);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }, [location]);

  // Search debounce
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

  // Close on outside click
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
    navigate(type === "movie" ? `/filme/${item.id}` : `/serie/${item.id}`);
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
      <div className="px-4 sm:px-6 lg:px-12 flex items-center justify-between h-16 lg:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
            <span className="text-primary font-display font-bold text-lg">C</span>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Cine<span className="text-gradient">flow</span>
          </span>
        </Link>

        {/* Desktop Nav */}
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
          {/* Request button */}
          <button
            onClick={() => setShowRequest(true)}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            title="Fazer Pedido"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          {/* Search */}
          <div ref={searchRef} className="relative">
            <div className={`flex items-center transition-all duration-300 ${searchOpen ? "w-64 sm:w-80" : "w-10"}`}>
              {searchOpen && (
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar filmes, séries..."
                  autoFocus
                  className="w-full h-11 pl-11 pr-4 rounded-2xl bg-white/10 border border-white/15 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 backdrop-blur-xl"
                />
              )}
              <button
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  if (!searchOpen) setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className={`${searchOpen ? "absolute left-0" : ""} w-11 h-11 flex items-center justify-center rounded-2xl text-muted-foreground hover:text-foreground transition-colors ${!searchOpen ? "bg-white/5 border border-white/10 hover:bg-white/10" : ""}`}
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            {/* Results dropdown */}
            {searchOpen && (query.length >= 2) && (
              <div className="absolute top-full mt-2 right-0 w-80 sm:w-96 glass-strong z-50 max-h-[70vh] overflow-y-auto scrollbar-hide">
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

          {/* Mobile menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden glass mx-4 mb-4 p-2 animate-scale-in">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                location.pathname === item.path
                  ? "text-foreground bg-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
    {showRequest && <RequestModal onClose={() => setShowRequest(false)} />}
    </>
  );
};

export default Navbar;
