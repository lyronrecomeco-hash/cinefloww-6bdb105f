import { QRCodeSVG } from "qrcode.react";
import { Film, Tv, Sparkles, Popcorn, Zap } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";
import qrxpBg from "@/assets/qrxp-bg.jpg";

const SITE_URL = "https://lyneflix.online/";

const QrxpPage = () => {
  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center">
      {/* Ultra clean cinema background */}
      <img
        src={qrxpBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover scale-105"
        loading="eager"
      />
      <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background/90" />

      {/* Ambient glow */}
      <div className="absolute top-[-20%] left-[10%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[5%] w-[350px] h-[350px] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-5 sm:gap-6 px-6 max-w-md w-full text-center">
        {/* Logo */}
        <LyneflixLogo size="lg" animate={false} />

        {/* Headline — Toguro style */}
        <div className="space-y-3">
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-black text-foreground leading-tight">
            Assista filmes e séries
            <br />
            <span className="text-primary">de graça.</span>{" "}
            <span className="text-foreground/60 text-lg sm:text-xl">Sim, de graça.</span>
          </h1>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mx-auto">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-black text-primary tracking-wide">SaboOr Preço</span>
          </div>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xs mx-auto font-medium">
            Sem plano, sem assinatura, sem cartão.
            <br />
            <span className="text-foreground/90 font-bold">Só aperta o play e assiste.</span>
          </p>
          <p className="text-xs text-muted-foreground/60 italic">
            "Netflix cobra R$55… Lyneflix cobra nada." 🔥
          </p>
        </div>

        {/* Categories */}
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {[
            { icon: Film, label: "Filmes" },
            { icon: Tv, label: "Séries" },
            { icon: Sparkles, label: "Animes" },
            { icon: Popcorn, label: "Doramas" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</span>
            </div>
          ))}
        </div>

        {/* QR Code */}
        <div className="bg-card/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-primary/5 w-full max-w-[260px]">
          <div className="bg-white rounded-2xl p-3 mx-auto w-fit shadow-lg">
            <QRCodeSVG
              value={SITE_URL}
              size={170}
              level="H"
              bgColor="#ffffff"
              fgColor="#0a0f1a"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 font-bold uppercase tracking-wider">
            Aponta e acessa 📱
          </p>
        </div>

        {/* Link */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground/60">Ou acesse direto:</p>
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
          >
            lyneflix.online
          </a>
        </div>

        {/* Bottom tagline */}
        <p className="text-[9px] text-muted-foreground/40 tracking-[0.2em] uppercase font-semibold">
          O streaming do povo • 100% gratuito
        </p>
      </div>
    </div>
  );
};

export default QrxpPage;
