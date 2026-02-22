import { createPortal } from "react-dom";
import { X, LogIn, BookmarkPlus, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LoginRequiredModalProps {
  onClose: () => void;
}

const LoginRequiredModal = ({ onClose }: LoginRequiredModalProps) => {
  const navigate = useNavigate();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-strong rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300 p-6">
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <BookmarkPlus className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Faça login para salvar</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Crie sua conta gratuita para salvar filmes e séries na sua lista e nunca perder o que quer assistir!
            </p>
          </div>
          <div className="space-y-2.5 pt-2">
            <button onClick={() => { onClose(); navigate("/conta"); }} className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-blue-600 text-white hover:opacity-90 transition-all">
              <LogIn className="w-4 h-4" />
              Entrar / Criar conta
            </button>
            <button onClick={onClose} className="w-full h-10 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              Agora não
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-1">
            <Shield className="w-3 h-3 text-primary/50" />
            <span className="text-[10px] text-muted-foreground/50">Seus dados ficam sempre seguros</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LoginRequiredModal;
