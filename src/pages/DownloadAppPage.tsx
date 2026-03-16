import { useEffect, useState, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Download, Shield, Zap, Wifi, MonitorSmartphone, Star, Play, Layers, Globe, Cpu } from "lucide-react";
import appLogo from "@/assets/lyneflix-L-logo.png";
import { TMDBMovie, getTrending, backdropUrl, getDisplayTitle, getPopularMovies, getPopularSeries } from "@/services/tmdb";
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

/* ─── Catalog auto-scroll row ─── */
const AutoScrollRow = ({ items, title }: { items: TMDBMovie[]; title: string }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;
    let paused = false;
    let animId: number;

    const step = () => {
      if (el && !paused) {
        const max = el.scrollWidth - el.clientWidth;
        if (max > 0) {
          el.scrollLeft += 0.4;
          if (el.scrollLeft >= max) el.scrollLeft = 0;
        }
      }
      animId = requestAnimationFrame(step);
    };

    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchstart", onEnter, { passive: true });
    el.addEventListener("touchend", onLeave);
    animId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchstart", onEnter);
      el.removeEventListener("touchend", onLeave);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section className="mx-3 sm:mx-6 lg:mx-12 mb-5">
      <h2 className="font-display text-base sm:text-lg font-bold mb-2.5">{title}</h2>
      <div ref={ref} className="flex gap-2.5 overflow-x-hidden pb-2">
        {[...items, ...items].map((m, idx) => (
          <div key={`${m.id}-${idx}`} className="flex-shrink-0 w-[100px] sm:w-[120px]">
            <div className="aspect-[2/3] rounded-xl overflow-hidden border border-border/30 bg-card/30 mb-1">
              <img
                src={`https://image.tmdb.org/t/p/w300${m.poster_path}`}
                alt={getDisplayTitle(m)}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1 font-medium">{getDisplayTitle(m)}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

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
  const [catalogAnimes, setCatalogAnimes] = useState<TMDBMovie[]>([]);

  useEffect(() => {
    getTrending().then(d => setTrending(d.results.filter((m: TMDBMovie) => m.backdrop_path).slice(0, 8))).catch(() => {});

    Promise.all([
      getPopularMovies().then(d => setCatalogMovies(d.results.filter((m: TMDBMovie) => m.poster_path).slice(0, 20))),
      getPopularSeries().then(d => setCatalogSeries(d.results.filter((m: TMDBMovie) => m.poster_path).slice(0, 20))),
      // Animes (genre 16, Japanese)
      fetch(`https://api.themoviedb.org/3/discover/tv?language=pt-BR&with_genres=16&with_original_language=ja&sort_by=popularity.desc`, {
        headers: { Authorization: `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw` },
      }).then(r => r.json()).then(d => setCatalogAnimes((d.results || []).filter((m: TMDBMovie) => m.poster_path).slice(0, 20))),
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

  const goTo = (index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrent(index);
    setTimeout(() => setIsTransitioning(false), 700);
  };
  const next = () => { if (trending.length > 0) goTo((current + 1) % trending.length); };

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

        {/* ── Hero Slider (no buttons) ── */}
        {trending.length > 0 && movie && (
          <section className="relative h-[44vh] sm:h-[50vh] lg:h-[60vh] min-h-[280px] max-h-[520px] w-full overflow-hidden">
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
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-background via-transparent to-transparent" />

            <div className="relative z-30 h-full flex items-end pb-10 px-4 sm:px-6 lg:px-10">
              <div className="max-w-lg w-full">
                <div className={`transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold uppercase tracking-wider border border-primary/30 mb-1.5 inline-block">
                    Disponível no App
                  </span>
                  <h2 className="font-display text-lg sm:text-2xl lg:text-3xl font-bold mb-1 leading-tight line-clamp-2">
                    {getDisplayTitle(movie)}
                  </h2>
                  {movie.overview && (
                    <p className="text-muted-foreground text-[11px] sm:text-sm leading-relaxed line-clamp-2 max-w-md">
                      {movie.overview}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Dots only */}
            <div className="absolute bottom-3 left-0 right-0 z-30 flex items-center justify-center gap-1">
              {trending.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`h-1 rounded-full transition-all duration-300 ${i === current ? "w-5 bg-primary" : "w-1.5 bg-foreground/20"}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── App Info Card ── */}
        <section className="mx-3 sm:mx-6 lg:mx-12 -mt-8 relative z-40 mb-6">
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-5 sm:p-7 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-60 h-60 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img src={appLogo} alt="LyneFlix" className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-lg border border-border flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold mb-0.5">LyneFlix App</h1>
                <p className="text-xs text-muted-foreground mb-1.5">O melhor app de streaming gratuito para Android.</p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(n => <Star key={n} className="w-3 h-3 fill-primary text-primary" />)}
                    <span className="text-[10px] text-muted-foreground ml-0.5">5.0</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-semibold border border-primary/20">Android</span>
                  <span className="text-[10px] text-muted-foreground">v{appVersion} • {appSize}</span>
                </div>
              </div>
              <a
                href={apkUrl}
                download
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25 flex-shrink-0 w-full sm:w-auto justify-center"
              >
                <Download className="w-4 h-4" /> Baixar APK
              </a>
            </div>
          </div>
        </section>

        {/* ── Catalog Rows ── */}
        <AutoScrollRow items={catalogMovies} title="🎬 Filmes no App" />
        <AutoScrollRow items={catalogSeries} title="📺 Séries no App" />
        <AutoScrollRow items={catalogAnimes} title="⚡ Animes no App" />

        {/* ── Screenshots ── */}
        {screenshots.length > 0 && (
          <section className="mx-3 sm:mx-6 lg:mx-12 mb-6">
            <h2 className="font-display text-base sm:text-lg font-bold mb-3">📱 Screenshots</h2>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {screenshots.map((url, n) => (
                <div key={n} className="flex-shrink-0 w-[130px] sm:w-[160px] rounded-2xl border border-border overflow-hidden bg-card/30">
                  <div className="aspect-[9/16]">
                    <img src={url} alt={`Screenshot ${n + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Features ── */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-6">
          <h2 className="font-display text-base sm:text-lg font-bold mb-3">🚀 Por que usar o app?</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {features.map((f, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/30 p-3.5 hover:bg-card/50 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-xs mb-0.5">{f.title}</h3>
                <p className="text-[10px] text-muted-foreground leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How to install ── */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-6">
          <h2 className="font-display text-base sm:text-lg font-bold mb-3">📲 Como instalar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {steps.map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/30 p-4 flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">{s.step}</div>
                <div>
                  <h3 className="font-semibold text-xs mb-0.5">{s.title}</h3>
                  <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8">
          <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card/30 to-primary/5 p-6 sm:p-8 text-center">
            <h2 className="font-display text-lg sm:text-xl font-bold mb-1.5">Pronto para começar?</h2>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">Baixe agora e tenha acesso a todo o catálogo na palma da mão.</p>
            <a
              href={apkUrl}
              download
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
            >
              <Download className="w-4 h-4" /> Baixar LyneFlix App
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default DownloadAppPage;
