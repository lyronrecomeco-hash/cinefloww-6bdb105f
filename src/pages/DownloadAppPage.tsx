import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContentRow from "@/components/ContentRow";
import { Download, Smartphone, Shield, Zap, Wifi, MonitorSmartphone, Star, ChevronRight } from "lucide-react";
import appLogo from "@/assets/lyneflix-L-logo.png";
import { TMDBMovie, getTrending } from "@/services/tmdb";

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

  useEffect(() => {
    getTrending().then(d => setTrending(d.results.filter(m => m.poster_path).slice(0, 20))).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 sm:pt-24 lg:pt-28 pb-20">
        {/* Trending slider */}
        {trending.length > 0 && (
          <div className="mb-6">
            <ContentRow title="Disponível no App" movies={trending} />
          </div>
        )}

        {/* Hero CTA */}
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12">
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
                  <span className="text-xs text-muted-foreground">v2.0 • 12 MB</span>
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
        <section className="mx-3 sm:mx-6 lg:mx-12 mb-8 sm:mb-12">
          <h2 className="font-display text-lg sm:text-xl font-bold mb-4">Screenshots</h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-transparent pb-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex-shrink-0 w-[140px] sm:w-[180px] rounded-2xl border border-white/10 overflow-hidden bg-card/30">
                <div className="aspect-[9/16] bg-muted/20 flex items-center justify-center">
                  <div className="text-center">
                    <Smartphone className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground/40">Screenshot {n}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2">Imagens reais serão adicionadas em breve.</p>
        </section>

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
