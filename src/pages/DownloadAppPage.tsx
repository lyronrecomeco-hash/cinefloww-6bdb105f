import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Download, Smartphone, Shield, Zap, Wifi, MonitorSmartphone, Star, ChevronLeft, ChevronRight, Play, Info } from "lucide-react";
import appLogo from "@/assets/lyneflix-L-logo.png";
import { TMDBMovie, getTrending, backdropUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const features = [
  { icon: Zap, title: "Ultra Rápido", desc: "Player otimizado com carregamento instantâneo" },
  { icon: Shield, title: "Seguro", desc: "Sem anúncios invasivos ou redirecionamentos" },
  { icon: Wifi, title: "Leve", desc: "Funciona bem mesmo em conexões lentas" },
  { icon: MonitorSmartphone, title: "Adaptável", desc: "Interface otimizada para celular e tablet" },
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

  useEffect(() => {
    getTrending().then(d => setTrending(d.results.filter(m => m.backdrop_path).slice(0, 8))).catch(() => {});

    // Load download page config from site_settings
    supabase.from("site_settings").select("value").eq("key", "download_page_config").maybeSingle().then(({ data }) => {
      if (data?.value) {
        const cfg = data.value as any;
        if (cfg.apk_url) setApkUrl(cfg.apk_url);
        if (cfg.screenshots?.length) setScreenshots(cfg.screenshots);
        if (cfg.app_version) setAppVersion(cfg.app_version);
        if (cfg.app_size) setAppSize(cfg.app_size);
      }
    });
    // Also check app_update for APK url fallback
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
        {/* Hero Banner Slider */}
        {trending.length > 0 && movie && (
          <section className="relative h-[50vh] sm:h-[60vh] lg:h-[70vh] min-h-[320px] max-h-[700px] w-full overflow-hidden">
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

            <div className="relative z-30 h-full flex items-end pb-20 sm:pb-16 lg:pb-24 px-3 sm:px-6 lg:px-12">
              <div className="max-w-xl sm:max-w-2xl w-full">
                <div className={`transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] sm:text-xs font-semibold uppercase tracking-wider border border-primary/30 mb-2 inline-block">
                    Disponível no App
                  </span>
                  <h2 className="font-display text-xl sm:text-3xl lg:text-5xl font-bold mb-1.5 sm:mb-3 leading-tight line-clamp-2">
                    {getDisplayTitle(movie)}
                  </h2>
                  {movie.overview && (
                    <p className="text-secondary-foreground/80 text-[11px] sm:text-sm leading-relaxed mb-3 sm:mb-5 line-clamp-2 max-w-lg">
                      {movie.overview}
                    </p>
                  )}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <a
                      href={apkUrl}
                      download
                      className="flex items-center gap-1.5 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
                    >
                      <Download className="w-4 h-4 sm:w-5 sm:h-5" /> Baixar App
                    </a>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="absolute bottom-6 sm:bottom-16 lg:bottom-24 left-3 right-3 sm:left-auto sm:right-6 lg:right-12 flex items-center justify-center sm:justify-end gap-2 sm:gap-3">
                <button onClick={prev} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {trending.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goTo(i)}
                      className={`h-1 sm:h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-5 sm:w-8 bg-primary" : "w-1 sm:w-1.5 bg-white/30 hover:bg-white/50"}`}
                    />
                  ))}
                </div>
                <button onClick={next} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Hero CTA */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12 -mt-4">
          <div className="rounded-2xl border border-white/10 bg-card/30 p-6 sm:p-8 lg:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />
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

        {/* Features */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12">
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
          <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12">
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
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12">
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
      </main>
      <Footer />
    </div>
  );
};

export default DownloadAppPage;
