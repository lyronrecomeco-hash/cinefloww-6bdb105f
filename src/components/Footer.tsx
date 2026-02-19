import { forwardRef } from "react";
import { Link } from "react-router-dom";
import LyneflixLogo from "@/components/LyneflixLogo";

const Footer = forwardRef<HTMLElement>((_, ref) => {
  return (
    <footer ref={ref} className="border-t border-white/5 py-8 sm:py-10 px-4 sm:px-6 lg:px-12">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-5 text-center">
        <LyneflixLogo size="sm" animate={false} />
        
        <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl leading-relaxed">
          AVISO LEGAL: Nós não armazenamos nenhum dos arquivos em nenhum servidor. Todos os conteúdos são fornecidos por terceiros sem qualquer tipo de filiação.
        </p>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link to="/dmca" className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors">
            Política DMCA
          </Link>
          <span className="text-white/10">|</span>
          <Link to="/termos" className="text-muted-foreground hover:text-primary text-xs sm:text-sm transition-colors">
            Termos e Condições
          </Link>
        </div>

        <p className="text-muted-foreground/60 text-[10px] sm:text-xs">
          © 2026 LyneFlix. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;
