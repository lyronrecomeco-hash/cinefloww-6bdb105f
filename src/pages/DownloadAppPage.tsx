import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Download, Smartphone, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import banner from "@/assets/lyneflix-welcome-banner.jpg";
import appLogo from "@/assets/lyneflix-L-logo.png";
import appShot from "@/assets/auth-bg.jpg";

const slides = [banner, appShot, banner];

const DownloadAppPage = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20 space-y-8 sm:space-y-10">
        <section className="relative rounded-2xl border border-white/10 overflow-hidden">
          <img src={slides[current]} alt="Baixe o app LyneFlix" className="w-full h-[220px] sm:h-[340px] lg:h-[420px] object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
          <div className="absolute inset-0 p-5 sm:p-8 lg:p-12 flex flex-col justify-end gap-4">
            <div className="flex items-center gap-3">
              <img src={appLogo} alt="LyneFlix App" className="w-10 h-10 rounded-xl" />
              <span className="text-xs sm:text-sm text-muted-foreground">App oficial</span>
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold max-w-2xl">Baixe o LyneFlix no seu dispositivo</h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">Assista com estabilidade, acesso rápido e experiência otimizada para celular e TV.</p>
            <div className="flex flex-wrap gap-2">
              <a href="#download" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Download className="w-4 h-4" /> Baixar agora
              </a>
            </div>
          </div>
          <div className="absolute top-3 right-3 flex gap-1.5">
            <button onClick={() => setCurrent((prev) => (prev - 1 + slides.length) % slides.length)} className="w-8 h-8 rounded-lg bg-background/60 border border-white/10 flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrent((prev) => (prev + 1) % slides.length)} className="w-8 h-8 rounded-lg bg-background/60 border border-white/10 flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-2xl border border-white/10 overflow-hidden bg-card/40">
              <div className="aspect-[9/16] bg-muted/30 flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <div className="p-3">
                <p className="text-sm font-medium">Screenshot {n}</p>
                <p className="text-xs text-muted-foreground">Substitua com imagens reais do app.</p>
              </div>
            </div>
          ))}
        </section>

        <section id="download" className="rounded-2xl border border-white/10 bg-card/30 p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold">Download do aplicativo</h2>
            <p className="text-sm text-muted-foreground mt-1">APK otimizado para Android, com suporte total ao player.</p>
          </div>
          <a href="#" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Smartphone className="w-4 h-4" /> Baixar APK
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default DownloadAppPage;
