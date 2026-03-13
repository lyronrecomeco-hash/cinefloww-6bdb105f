import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Download, Smartphone, Shield, Zap, Wifi, ChevronLeft, ChevronRight, Play, Star, MonitorSmartphone } from "lucide-react";
import banner from "@/assets/lyneflix-welcome-banner.jpg";
import appLogo from "@/assets/lyneflix-L-logo.png";
import appShot from "@/assets/auth-bg.jpg";

const slides = [
  { img: banner, title: "LyneFlix App", subtitle: "Toda a experiência na palma da mão" },
  { img: appShot, title: "Player Integrado", subtitle: "Assista em alta qualidade sem interrupções" },
  { img: banner, title: "Catálogo Completo", subtitle: "Filmes, séries, animes e doramas" },
];

const features = [
  { icon: Zap, title: "Ultra Rápido", desc: "Player otimizado com carregamento instantâneo" },
  { icon: Shield, title: "Seguro", desc: "Sem anúncios invasivos ou redirecionamentos" },
  { icon: Wifi, title: "Leve", desc: "Funciona bem mesmo em conexões lentas" },
  { icon: MonitorSmartphone, title: "Adaptável", desc: "Interface otimizada para celular e tablet" },
];

const DownloadAppPage = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrent((prev) => (prev + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 sm:pt-24 lg:pt-28 pb-20">
        {/* Hero Slider */}
        <section className="relative mx-3 sm:mx-6 lg:mx-12 rounded-2xl border border-white/10 overflow-hidden">
          <div className="relative">
            {slides.map((slide, i) => (
              <div
                key={i}
                className={`transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0 absolute inset-0"}`}
              >
                <img src={slide.img} alt={slide.title} className="w-full h-[280px] sm:h-[380px] lg:h-[460px] object-cover" />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />
          <div className="absolute inset-0 p-5 sm:p-8 lg:p-14 flex flex-col justify-end gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <img src={appLogo} alt="LyneFlix" className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-lg border border-white/10" />
              <div>
                <span className="text-xs text-muted-foreground font-medium">Aplicativo oficial</span>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => <Star key={n} className="w-3 h-3 fill-primary text-primary" />)}
                  <span className="text-xs text-muted-foreground ml-1">5.0</span>
                </div>
              </div>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold max-w-2xl leading-tight">
              {slides[current].title}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg">{slides[current].subtitle}</p>
            <div className="flex flex-wrap gap-3 mt-1">
              <a
                href="#download"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
              >
                <Download className="w-4 h-4" /> Baixar APK
              </a>
              <a
                href="#screenshots"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl glass glass-hover text-sm font-semibold"
              >
                <Play className="w-4 h-4" /> Ver mais
              </a>
            </div>
          </div>
          {/* Slider dots */}
          <div className="absolute bottom-4 right-4 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? "bg-primary w-6" : "bg-white/30"}`}
              />
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mt-8 sm:mt-12">
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-5">Por que usar o app?</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {features.map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-card/30 p-4 sm:p-5 hover:bg-card/50 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm sm:text-base mb-1">{f.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screenshots */}
        <section id="screenshots" className="mx-3 sm:mx-6 lg:mx-12 mt-8 sm:mt-12">
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-5">Screenshots</h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-2xl border border-white/10 overflow-hidden bg-card/30 group hover:border-primary/30 transition-colors">
                <div className="aspect-[9/16] bg-muted/20 flex items-center justify-center">
                  <div className="text-center">
                    <Smartphone className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/40">Screenshot {n}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-3 text-center">Imagens reais do aplicativo serão adicionadas em breve.</p>
        </section>

        {/* Download CTA */}
        <section id="download" className="mx-3 sm:mx-6 lg:mx-12 mt-8 sm:mt-12">
          <div className="rounded-2xl border border-white/10 bg-card/30 p-6 sm:p-8 lg:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <img src={appLogo} alt="LyneFlix" className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-lg border border-white/10 flex-shrink-0" />
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold">Baixe o LyneFlix</h2>
                  <p className="text-sm text-muted-foreground mt-1">APK otimizado para Android com suporte total ao player e notificações.</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold border border-primary/20">Android</span>
                    <span className="text-xs text-muted-foreground">v2.0 • 12 MB</span>
                  </div>
                </div>
              </div>
              <a
                href="#"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/25 flex-shrink-0"
              >
                <Download className="w-5 h-5" /> Baixar APK
              </a>
            </div>
          </div>
        </section>

        {/* Instructions */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mt-8 sm:mt-12">
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-5">Como instalar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { step: "1", title: "Baixe o APK", desc: "Clique no botão acima para baixar o arquivo." },
              { step: "2", title: "Permita instalação", desc: "Vá em Configurações > Segurança e habilite 'Fontes desconhecidas'." },
              { step: "3", title: "Instale e aproveite", desc: "Abra o arquivo baixado e siga as instruções." },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-card/30 p-5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center mb-3 text-primary font-bold text-sm">{s.step}</div>
                <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
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
