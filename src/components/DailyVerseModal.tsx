import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, BookOpen, Sun, Sunset, Moon } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const VERSES = [
  { verse: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", ref: "João 3:16", explanation: "Este versículo nos mostra a profundidade do amor de Deus. Ele entregou o que tinha de mais precioso para que nós pudéssemos ter esperança e vida. É um convite a confiar nesse amor." },
  { verse: "O Senhor é o meu pastor; nada me faltará.", ref: "Salmos 23:1", explanation: "Quando reconhecemos Deus como nosso pastor, entendemos que Ele cuida de cada detalhe da nossa vida. Mesmo nas dificuldades, Ele provê tudo o que precisamos." },
  { verse: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13", explanation: "Não se trata de força própria, mas da força que vem de Deus. Com Ele ao nosso lado, somos capazes de superar qualquer desafio que a vida nos apresentar." },
  { verse: "Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.", ref: "Provérbios 3:5", explanation: "Muitas vezes queremos controlar tudo, mas esse versículo nos ensina a soltar o controle e confiar que Deus tem um plano maior e melhor para nós." },
  { verse: "Porque eu bem sei os pensamentos que penso de vós, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.", ref: "Jeremias 29:11", explanation: "Deus tem planos de esperança para cada um de nós. Mesmo quando tudo parece incerto, podemos descansar sabendo que Ele está no controle." },
  { verse: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.", ref: "Isaías 41:10", explanation: "O medo é natural, mas Deus nos convida a não nos deixar dominar por ele. Sua presença é nossa maior segurança em qualquer situação." },
  { verse: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", ref: "Salmos 37:5", explanation: "Entregar nossos caminhos a Deus significa desistir de fazer tudo sozinho. Quando confiamos, Ele age e abre portas que nem imaginávamos." },
  { verse: "E conhecereis a verdade, e a verdade vos libertará.", ref: "João 8:32", explanation: "A verdade de Deus nos liberta de medos, mentiras e inseguranças. Conhecer Sua palavra é o caminho para uma vida plena e livre." },
  { verse: "Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias.", ref: "Isaías 40:31", explanation: "Esperar em Deus não é passividade — é confiança ativa. Ele renova nossas forças para enfrentarmos cada dia com coragem e determinação." },
  { verse: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.", ref: "1 Pedro 5:7", explanation: "A ansiedade não precisa nos dominar. Deus nos convida a entregar nossas preocupações a Ele, pois Ele cuida de nós com amor." },
  { verse: "O Senhor é a minha luz e a minha salvação; a quem temerei?", ref: "Salmos 27:1", explanation: "Com Deus como nossa luz, não precisamos temer a escuridão. Ele ilumina nosso caminho e nos protege de todo mal." },
  { verse: "Eu sou o caminho, a verdade e a vida.", ref: "João 14:6", explanation: "Jesus se apresenta como o único caminho seguro. Seguir Seus ensinamentos nos leva a uma vida de propósito e significado." },
  { verse: "Sede fortes e corajosos. Não temais, nem vos espanteis, porque o Senhor, vosso Deus, é convosco.", ref: "Josué 1:9", explanation: "A coragem verdadeira vem de saber que não estamos sozinhos. Deus caminha conosco em cada passo da jornada." },
  { verse: "Alegrai-vos sempre no Senhor; outra vez digo: alegrai-vos!", ref: "Filipenses 4:4", explanation: "A alegria em Deus não depende das circunstâncias. É uma alegria profunda que nasce da certeza do Seu amor constante." },
  { verse: "O amor é paciente, o amor é bondoso.", ref: "1 Coríntios 13:4", explanation: "O verdadeiro amor se manifesta na paciência e na bondade. Este versículo nos desafia a amar como Deus nos ama." },
  { verse: "Pois onde estiver o vosso tesouro, aí estará também o vosso coração.", ref: "Mateus 6:21", explanation: "Aquilo que valorizamos define quem somos. Investir em coisas eternas traz paz e propósito verdadeiro à nossa vida." },
  { verse: "Bem-aventurados os pacificadores, porque eles serão chamados filhos de Deus.", ref: "Mateus 5:9", explanation: "Promover a paz é uma das maiores virtudes. Quando buscamos reconciliação e harmonia, refletimos o caráter de Deus." },
  { verse: "Deem graças ao Senhor porque ele é bom; o seu amor dura para sempre.", ref: "Salmos 136:1", explanation: "A gratidão transforma nossa perspectiva. Reconhecer a bondade de Deus em cada momento nos enche de esperança." },
  { verse: "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.", ref: "Mateus 11:28", explanation: "Jesus oferece descanso para os corações cansados. Não precisamos carregar o peso sozinhos — Ele nos convida a descansar Nele." },
  { verse: "A palavra de Deus é viva, e eficaz, e mais penetrante do que qualquer espada de dois gumes.", ref: "Hebreus 4:12", explanation: "A Bíblia não é apenas um livro — é a palavra viva de Deus que transforma corações e ilumina mentes." },
  { verse: "Busquem o Reino de Deus em primeiro lugar, e todas essas coisas vos serão acrescentadas.", ref: "Mateus 6:33", explanation: "Quando priorizamos Deus, Ele cuida de tudo mais. Buscar Seu reino é a chave para uma vida equilibrada e abençoada." },
  { verse: "Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque tu estás comigo.", ref: "Salmos 23:4", explanation: "Nos momentos mais difíceis, a presença de Deus é nosso consolo. Ele nunca nos abandona, mesmo nas horas mais escuras." },
  { verse: "Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.", ref: "Salmos 46:1", explanation: "Quando a angústia bate à porta, Deus é nosso abrigo seguro. Podemos correr para Ele a qualquer momento." },
  { verse: "Porque pela graça sois salvos, por meio da fé; e isto não vem de vós; é dom de Deus.", ref: "Efésios 2:8", explanation: "A salvação é um presente de Deus, não algo que conquistamos por mérito. É pela fé que recebemos essa graça maravilhosa." },
  { verse: "De sorte que as coisas que se veem são temporais, e as que não se veem são eternas.", ref: "2 Coríntios 4:18", explanation: "Os problemas passam, mas o amor de Deus é eterno. Manter o foco no que é eterno nos dá perspectiva e paz." },
  { verse: "Se Deus é por nós, quem será contra nós?", ref: "Romanos 8:31", explanation: "Com Deus ao nosso lado, nenhum obstáculo é grande demais. Esta certeza nos dá coragem para enfrentar qualquer situação." },
  { verse: "Tenham bom ânimo! Eu venci o mundo.", ref: "João 16:33", explanation: "Jesus já venceu tudo aquilo que nos assusta. Podemos ter paz mesmo em meio às tribulações, pois a vitória já é nossa." },
  { verse: "O fruto do Espírito é: amor, alegria, paz, paciência, amabilidade, bondade, fidelidade.", ref: "Gálatas 5:22", explanation: "Quando permitimos que o Espírito de Deus guie nossa vida, esses frutos se manifestam naturalmente em nós." },
  { verse: "Instruirei e te ensinarei o caminho que deves seguir; guiar-te-ei com os meus olhos.", ref: "Salmos 32:8", explanation: "Deus promete nos guiar pessoalmente. Ele não nos deixa perdidos — Ele mostra o caminho com carinho e sabedoria." },
  { verse: "Não se turbe o vosso coração; credes em Deus, crede também em mim.", ref: "João 14:1", explanation: "Jesus nos convida a não deixar a preocupação dominar nosso coração. A fé Nele é o antídoto para a turbulência da vida." },
  { verse: "Grandes coisas fez o Senhor por nós, e por isso estamos alegres.", ref: "Salmos 126:3", explanation: "Olhar para trás e reconhecer o que Deus já fez por nós enche nosso coração de gratidão e alegria genuína." },
];

const PERMANENT_KEY = "lyneflix_verse_permanent_dismiss";
const DISMISS_KEY = "lyneflix_verse_dismissed_";

function getTimeWindow(): "morning" | "afternoon" | "night" {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "night";
}

function getGreeting(window: "morning" | "afternoon" | "night") {
  switch (window) {
    case "morning": return { text: "Bom dia!", icon: Sun, sub: "A LyneFlix lhe deseja um ótimo dia! ☀️" };
    case "afternoon": return { text: "Boa tarde!", icon: Sunset, sub: "A LyneFlix lhe deseja uma ótima tarde! 🌤️" };
    case "night": return { text: "Boa noite!", icon: Moon, sub: "A LyneFlix lhe deseja uma ótima noite! 🌙" };
  }
}

function getTodayVerse() {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return VERSES[dayOfYear % VERSES.length];
}

const DailyVerseModal = () => {
  const [visible, setVisible] = useState(false);
  const [neverShow, setNeverShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(PERMANENT_KEY) === "true") return;

    const window = getTimeWindow();
    const today = new Date().toISOString().split("T")[0];
    const key = DISMISS_KEY + today + "_" + window;

    if (localStorage.getItem(key)) return;

    // Small delay so it doesn't clash with other modals
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    const window = getTimeWindow();
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(DISMISS_KEY + today + "_" + window, "1");

    if (neverShow) {
      localStorage.setItem(PERMANENT_KEY, "true");
    }
    setVisible(false);
  };

  if (!visible) return null;

  const window = getTimeWindow();
  const greeting = getGreeting(window);
  const verse = getTodayVerse();
  const GreetingIcon = greeting.icon;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          {/* Greeting */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <GreetingIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-foreground">{greeting.text}</h2>
              <p className="text-xs text-muted-foreground">{greeting.sub}</p>
            </div>
          </div>

          <LyneflixLogo size="sm" animate={false} className="py-2" />

          {/* Verse title */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Versículo do Dia</span>
          </div>

          {/* Verse content */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <p className="text-sm text-foreground leading-relaxed italic">
              "{verse.verse}"
            </p>
            <p className="text-xs font-semibold text-primary text-right">
              — {verse.ref}
            </p>
          </div>

          {/* Explanation */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reflexão</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {verse.explanation}
            </p>
          </div>

          {/* Permanent dismiss */}
          <label className="flex items-center gap-2 pt-1 cursor-pointer group">
            <input
              type="checkbox"
              checked={neverShow}
              onChange={(e) => setNeverShow(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50 accent-primary"
            />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              Não desejo mais receber este aviso
            </span>
          </label>

          {/* Button */}
          <button
            onClick={handleDismiss}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Amém! 🙏
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DailyVerseModal;
