import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-12 max-w-4xl mx-auto">
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold mb-8">Termos e Condições</h1>
        
        <div className="space-y-6 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e usar a LyneFlix, você concorda em cumprir estes Termos e Condições. 
              Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">2. Descrição do Serviço</h2>
            <p>
              A LyneFlix é uma plataforma de indexação de conteúdo que utiliza APIs de terceiros para exibir informações sobre 
              filmes e séries. Não armazenamos, hospedamos ou distribuímos conteúdo protegido por direitos autorais em nossos servidores.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">3. Uso Aceitável</h2>
            <p>Ao utilizar a LyneFlix, você se compromete a:</p>
            <ul className="list-disc list-inside mt-3 space-y-2 pl-4">
              <li>Não utilizar o serviço para fins ilegais ou não autorizados</li>
              <li>Não tentar acessar ou modificar dados de outros usuários</li>
              <li>Não interferir no funcionamento normal da plataforma</li>
              <li>Não reproduzir, duplicar ou revender qualquer parte do serviço</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">4. Isenção de Garantias</h2>
            <p>
              A LyneFlix é fornecida "como está", sem garantias de qualquer tipo. Não garantimos que o serviço será ininterrupto, 
              seguro ou livre de erros. Todo o conteúdo disponibilizado é de responsabilidade de provedores terceiros.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">5. Limitação de Responsabilidade</h2>
            <p>
              Em nenhuma circunstância a LyneFlix será responsável por danos diretos, indiretos, incidentais ou consequenciais 
              decorrentes do uso ou incapacidade de uso do serviço, incluindo mas não limitado a conteúdo de terceiros.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">6. Propriedade Intelectual</h2>
            <p>
              Todas as marcas, logos e elementos visuais da LyneFlix são de propriedade exclusiva da plataforma. 
              O conteúdo de filmes e séries exibido pertence aos seus respectivos proprietários e detentores de direitos.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground mb-3">7. Alterações nos Termos</h2>
            <p>
              Reservamos o direito de modificar estes termos a qualquer momento. As alterações serão publicadas nesta página 
              e entrarão em vigor imediatamente após a publicação. O uso continuado da plataforma após as alterações constitui aceitação dos novos termos.
            </p>
          </section>

          <p className="text-muted-foreground/60 text-xs pt-4">
            Última atualização: Fevereiro de 2026
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsPage;
