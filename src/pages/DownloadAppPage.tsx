import { useEffect, useState, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Download, Smartphone, Shield, Zap, Wifi, MonitorSmartphone, Star, ChevronLeft, ChevronRight, Play, Layers, Globe, Cpu } from "lucide-react";
import appLogo from "@/assets/lyneflix-L-logo.png";
import { TMDBMovie, getTrending, backdropUrl, getDisplayTitle, getYear, getMediaType, getPopularMovies, getPopularSeries } from "@/services/tmdb";
import { supabase } from "@/integrations/supabase/client";

const features = [
  { icon: Zap, title: "Ultra Rápido", desc: "Player nativo otimizado com carregamento instantâneo" },
  { icon: Shield, title: "Seguro", desc: "Sem anúncios invasivos ou redirecionamentos" },
  { icon: Wifi, title: "Leve", desc: "Funciona bem mesmo em conexões lentas" },
  { icon: MonitorSmartphone, title: "Adaptável", desc: "Interface otimizada para celular e tablet" },
  { icon: Play, title: "Player Próprio", desc: "Motor de vídeo nativo com suporte a múltiplas fontes" },
  { icon: Layers, title: "Catálogo Completo", desc: "Filmes, séries, animes e doramas em um só lugar" },
  { icon: Globe, title: "Multi-Áudio", desc: "Dublado e legendado com seleção inteligente" },
  { icon: Cpu, title: "Baixo Consumo", desc: "Otimizado para poupar bateria e dados" },
];

const steps = [
  { step: "1", title: "Baixe o APK", desc: "Clique no botão abaixo para baixar o arquivo." },
  { step: "2", title: "Permita instalação", desc: "Vá em Configurações > Segurança e habilite 'Fontes desconhecidas'." },
  { step: "3", title: "Instale e aproveite", desc: "Abra o arquivo baixado e siga as instruções na tela." },
];

const DownloadAppPage = () => {
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [apkUrl, setApkUrl] = useState("#");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [appVersion, setAppVersion] = useState("2.0");
  const [appSize, setAppSize] = useState("12 MB");
  const [catalogMovies, setCatalogMovies] = useState<TMDBMovie[]>([]);
  const [catalogSeries, setCatalogSeries] = useState<TMDBMovie[]>([]);
  const catalogMoviesRef = useRef<HTMLDivElement>(null);
  const catalogSeriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTrending().then(d => setTrending(d.results.filter((m: TMDBMovie) => m.backdrop_path).slice(0, 8))).catch(() => {});

    Promise.all([
      getPopularMovies().then(d => setCatalogMovies(d.results.filter((m: TMDBMovie) => m.poster_path).slice(0, 20))),
      getPopularSeries().then(d => setCatalogSeries(d.results.filter((m: TMDBMovie) => m.poster_path).slice(0, 20))),
    ]).catch(() => {});

    supabase.from("site_settings").select("value").eq("key", "download_page_config").maybeSingle().then(({ data }) => {
      if (data?.value) {
        const cfg = data.value as any;
        if (cfg.apk_url) setApkUrl(cfg.apk_url);
        if (cfg.screenshots?.length) setScreenshots(cfg.screenshots);
        if (cfg.app_version) setAppVersion(cfg.app_version);
        if (cfg.app_size) setAppSize(cfg.app_size);
      }
    });
    supabase.from("site_settings").select("value").eq("key", "app_update").maybeSingle().then(({ data }) => {
      if (data?.value) {
        const cfg = data.value as any;
        if (cfg.apk_url) setApkUrl(prev => prev === "#" ? cfg.apk_url : prev);
        if (cfg.current_version) setAppVersion(prev => prev === "2.0" ? cfg.current_version : prev);
      }
    });
  }, []);

  // Smooth continuous auto-scroll using requestAnimationFrame
  useEffect(() => {
    const refs = [catalogMoviesRef, catalogSeriesRef];
    let animIds: number[] = [];
    const speeds = [0.5, 0.5]; // pixels per frame

    refs.forEach((ref, idx) => {
      let paused = false;

      const step = () => {
        const el = ref.current;
        if (el && !paused) {
          const maxScroll = el.scrollWidth - el.clientWidth;
          if (maxScroll > 0) {
            el.scrollLeft += speeds[idx];
            if (el.scrollLeft >= maxScroll) {
              el.scrollLeft = 0;
            }
          }
        }
        animIds[idx] = requestAnimationFrame(step);
      };

      // Pause on hover/touch
      const onEnter = () => { paused = true; };
      const onLeave = () => { paused = false; };
      const el = ref.current;
      if (el) {
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
        el.addEventListener("touchstart", onEnter, { passive: true });
        el.addEventListener("touchend", onLeave);
      }

      animIds[idx] = requestAnimationFrame(step);
    });

    return () => {
      animIds.forEach(id => cancelAnimationFrame(id));
      refs.forEach(ref => {
        const el = ref.current;
        if (el) {
          el.removeEventListener("mouseenter", () => {});
          el.removeEventListener("mouseleave", () => {});
        }
      });
    };
  }, [catalogMovies, catalogSeries]);

  const goTo = (index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrent(index);
    setTimeout(() => setIsTransitioning(false), 700);
  };
  const next = () => goTo((current + 1) % trending.length);
  const prev = () => goTo((current - 1 + trending.length) % trending.length);

  useEffect(() => {
    if (trending.length === 0) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [current, trending.length]);

  const movie = trending[current];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-0 pb-20">

        {/* Hero Banner Slider — TOP */}
        {trending.length > 0 && movie && (
          <section className="relative h-[50vh] sm:h-[55vh] lg:h-[65vh] min-h-[320px] max-h-[600px] w-full overflow-hidden">
            {trending.map((item, i) => (
              <div
                key={item.id}
                className={`absolute inset-0 transition-opacity duration-700 ${i === current ? "opacity-100 z-10" : "opacity-0 z-0"}`}
              >
                <img
                  src={backdropUrl(item.backdrop_path, "w1280")}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  alt={getDisplayTitle(item)}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}

            <div className="absolute inset-0 z-20 bg-gradient-to-r from-background via-background/70 to-transparent" />
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-background via-background/20 to-transparent" />

            <div className="relative z-30 h-full flex items-end pb-14 sm:pb-12 px-4 sm:px-6 lg:px-10">
              <div className="max-w-xl w-full">
                <div className={`transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] sm:text-xs font-semibold uppercase tracking-wider border border-primary/30 mb-2 inline-block">
                    Disponível no App
                  </span>
                  <h2 className="font-display text-lg sm:text-2xl lg:text-4xl font-bold mb-1 sm:mb-2 leading-tight line-clamp-2">
                    {getDisplayTitle(movie)}
                  </h2>
                  {movie.overview && (
                    <p className="text-secondary-foreground/80 text-[11px] sm:text-sm leading-relaxed line-clamp-2 max-w-md">
                      {movie.overview}
                    </p>
                  )}
                </div>
              </div>

              {/* Navigation dots */}
              <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-6 flex items-center justify-center sm:justify-end gap-2">
                <button onClick={prev} className="w-8 h-8 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {trending.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goTo(i)}
                      className={`h-1 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-primary" : "w-1 bg-white/30 hover:bg-white/50"}`}
                    />
                  ))}
                </div>
                <button onClick={next} className="w-8 h-8 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* App Info Card */}
        <section className="mx-3 sm:mx-6 lg:mx-12 -mt-10 relative z-40 mb-6">
          <div className="rounded-2xl border border-white/10 bg-card/80 backdrop-blur-xl p-5 sm:p-8 lg:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <img src={appLogo} alt="LyneFlix" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-lg border border-white/10 flex-shrink-0" />
              <div className="flex-1">
                <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold mb-1">LyneFlix App</h1>
                <p className="text-sm text-muted-foreground mb-2">O melhor app de streaming gratuito para Android.</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(n => <Star key={n} className="w-3.5 h-3.5 fill-primary text-primary" />)}
                    <span className="text-xs text-muted-foreground ml-1">5.0</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold border border-primary/20">Android</span>
                  <span className="text-xs text-muted-foreground">v{appVersion} • {appSize}</span>
                </div>
              </div>
              <a
                href={apkUrl}
                download
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25 flex-shrink-0"
              >
                <Download className="w-5 h-5" /> Baixar APK
              </a>
            </div>
          </div>
        </section>

        {/* Catalog Preview - Movies (continuous smooth scroll) */}
        {catalogMovies.length > 0 && (
          <section className="mx-3 sm:mx-6 lg:mx-12 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg sm:text-xl font-bold">Filmes no App</h2>
            </div>
            <div
              ref={catalogMoviesRef}
              className="flex gap-2.5 overflow-x-hidden pb-2"
            >
              {/* Duplicate items for seamless loop */}
              {[...catalogMovies, ...catalogMovies].map((m, idx) => (
                <div key={`${m.id}-${idx}`} className="flex-shrink-0 w-[110px] sm:w-[130px] group cursor-default">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-card/30 mb-1.5">
                    <img
                      src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                      alt={getDisplayTitle(m)}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[11px] text-foreground/80 leading-tight line-clamp-1 font-medium">{getDisplayTitle(m)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Catalog Preview - Series (continuous smooth scroll) */}
        {catalogSeries.length > 0 && (
          <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg sm:text-xl font-bold">Séries no App</h2>
            </div>
            <div
              ref={catalogSeriesRef}
              className="flex gap-2.5 overflow-x-hidden pb-2"
            >
              {[...catalogSeries, ...catalogSeries].map((m, idx) => (
                <div key={`${m.id}-${idx}`} className="flex-shrink-0 w-[110px] sm:w-[130px] group cursor-default">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-card/30 mb-1.5">
                    <img
                      src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                      alt={getDisplayTitle(m)}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[11px] text-foreground/80 leading-tight line-clamp-1 font-medium">{getDisplayTitle(m)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Features */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
          <h2 className="font-display text-lg sm:text-xl font-bold mb-4">Por que usar o app?</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {features.map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-card/30 p-4 hover:bg-card/50 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
            <h2 className="font-display text-lg sm:text-xl font-bold mb-4">Screenshots</h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-transparent pb-2">
              {screenshots.map((url, n) => (
                <div key={n} className="flex-shrink-0 w-[140px] sm:w-[180px] rounded-2xl border border-white/10 overflow-hidden bg-card/30">
                  <div className="aspect-[9/16]">
                    <img src={url} alt={`Screenshot ${n + 1}`} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How to install */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
          <h2 className="font-display text-lg sm:text-xl font-bold mb-4">Como instalar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-card/30 p-5 flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">{s.step}</div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5">{s.title}</h3>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-primary/10 via-card/30 to-primary/5 p-6 sm:p-8 text-center">
            <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Pronto para começar?</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Baixe agora e tenha acesso a todo o catálogo na palma da mão.</p>
            <a
              href={apkUrl}
              download
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
            >
              <Download className="w-5 h-5" /> Baixar LyneFlix App
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default DownloadAppPage;
