import { QRCodeSVG } from "qrcode.react";
import { Sparkles, Film, Tv, Popcorn } from "lucide-react";

const SITE_URL = "https://lyneflix.online";

const QrxpPage = () => {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden flex items-center justify-center">
      {/* Ambient glow effects */}
      <div className="absolute top-[-30%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/8 blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 px-6 max-w-md w-full text-center">
        {/* Logo */}
        <div className="flex items-center gap-1.5">
          <span className="font-display text-2xl sm:text-3xl font-black tracking-tight">
            <span className="text-primary">LYNE</span>
            <span className="text-foreground">FLIX</span>
          </span>
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black text-foreground leading-tight">
            Seu cinema em casa.
            <br />
            <span className="text-primary">100% grátis.</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Filmes, séries, doramas e animes em um só lugar. Sem anúncios chatos, sem cadastro obrigatório.
          </p>
        </div>

        {/* Features row */}
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          {[
            { icon: Film, label: "Filmes" },
            { icon: Tv, label: "Séries" },
            { icon: Sparkles, label: "Animes" },
            { icon: Popcorn, label: "Doramas" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* QR Code card */}
        <div className="bg-card/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl w-full max-w-[280px]">
          <div className="bg-white rounded-2xl p-3 mx-auto w-fit">
            <QRCodeSVG
              value={SITE_URL}
              size={180}
              level="H"
              bgColor="#ffffff"
              fgColor="#0a0f1a"
              imageSettings={{
                src: "",
                height: 0,
                width: 0,
                excavate: false,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-4 font-medium">
            Escaneie e acesse agora
          </p>
        </div>

        {/* Link fallback */}
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Ou acesse pelo link:</p>
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            lyneflix.online
          </a>
        </div>

        {/* Tagline */}
        <p className="text-[10px] text-muted-foreground/50 tracking-wider uppercase font-medium">
          Assista o que quiser • Quando quiser
        </p>
      </div>
    </div>
  );
};

export default QrxpPage;
