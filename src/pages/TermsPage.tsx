import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LyneflixLogo from "@/components/LyneflixLogo";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <LyneflixLogo size="md" animate className="mb-8" />
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold mb-6 text-center">Termos e Condições</h1>
          
          <div className="space-y-5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">1. Aceitação dos Termos</h2>
              <p>
                Ao acessar, criar uma conta ou usar a LyneFlix, você concorda em cumprir estes Termos e Condições. 
                Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">2. Descrição do Serviço</h2>
              <p>
                A LyneFlix é uma plataforma de indexação de conteúdo que utiliza APIs de terceiros para exibir informações sobre 
                filmes e séries. Não armazenamos, hospedamos ou distribuímos conteúdo protegido por direitos autorais em nossos servidores.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">3. Conta de Usuário</h2>
              <p>Para acessar determinadas funcionalidades (como listas pessoais, perfis e progresso de visualização), é necessário criar uma conta. Ao se cadastrar, você:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Deve fornecer um e-mail válido e criar uma senha segura</li>
                <li>É responsável por manter a confidencialidade da sua conta</li>
                <li>Pode criar até 5 perfis dentro de uma mesma conta</li>
                <li>Concorda que não compartilhará suas credenciais com terceiros</li>
                <li>Pode solicitar a exclusão da sua conta a qualquer momento</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">4. Privacidade e Dados</h2>
              <p>Ao criar uma conta, coletamos e armazenamos:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Endereço de e-mail para autenticação</li>
                <li>Preferências de perfil (nome e avatar)</li>
                <li>Progresso de visualização e listas pessoais</li>
                <li>Dados de uso para melhorar a experiência</li>
              </ul>
              <p className="mt-2">Não vendemos, compartilhamos ou cedemos seus dados pessoais a terceiros. Seus dados são protegidos por criptografia e armazenados de forma segura.</p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">5. Uso Aceitável</h2>
              <p>Ao utilizar a LyneFlix, você se compromete a:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Não utilizar o serviço para fins ilegais ou não autorizados</li>
                <li>Não tentar acessar ou modificar dados de outros usuários</li>
                <li>Não criar contas falsas ou automatizadas</li>
                <li>Não interferir no funcionamento normal da plataforma</li>
                <li>Não reproduzir, duplicar ou revender qualquer parte do serviço</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">6. Anúncios</h2>
              <p>
                A LyneFlix pode exibir anúncios de parceiros para manter a gratuidade do serviço. Os anúncios são exibidos de forma 
                não intrusiva e nunca coletam dados pessoais sem consentimento. Ao utilizar a plataforma, você concorda com a exibição 
                ocasional de conteúdo publicitário.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">7. Isenção de Garantias</h2>
              <p>
                A LyneFlix é fornecida "como está", sem garantias de qualquer tipo. Não garantimos que o serviço será ininterrupto, 
                seguro ou livre de erros. Todo o conteúdo disponibilizado é de responsabilidade de provedores terceiros.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">8. Limitação de Responsabilidade</h2>
              <p>
                Em nenhuma circunstância a LyneFlix será responsável por danos diretos, indiretos, incidentais ou consequenciais 
                decorrentes do uso ou incapacidade de uso do serviço, incluindo mas não limitado a conteúdo de terceiros.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">9. Propriedade Intelectual</h2>
              <p>
                Todas as marcas, logos e elementos visuais da LyneFlix são de propriedade exclusiva da plataforma. 
                O conteúdo de filmes e séries exibido pertence aos seus respectivos proprietários e detentores de direitos.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">10. Encerramento de Conta</h2>
              <p>
                Reservamos o direito de suspender ou encerrar contas que violem estes termos, incluindo uso abusivo, 
                criação de múltiplas contas fraudulentas ou tentativa de comprometer a segurança da plataforma.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">11. Alterações nos Termos</h2>
              <p>
                Reservamos o direito de modificar estes termos a qualquer momento. As alterações serão publicadas nesta página 
                e entrarão em vigor imediatamente após a publicação. O uso continuado da plataforma após as alterações constitui aceitação dos novos termos.
              </p>
            </section>

            <p className="text-muted-foreground/60 text-[10px] sm:text-xs pt-3">
              Última atualização: Fevereiro de 2026
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsPage;
