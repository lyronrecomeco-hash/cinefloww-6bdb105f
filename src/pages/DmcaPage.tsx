import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LyneflixLogo from "@/components/LyneflixLogo";

const DmcaPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <LyneflixLogo size="md" animate className="mb-8" />
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold mb-6 text-center">Política DMCA</h1>
          
          <div className="space-y-5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">1. Introdução</h2>
              <p>
                A LyneFlix respeita os direitos de propriedade intelectual de terceiros e espera que seus usuários façam o mesmo. 
                Em conformidade com o Digital Millennium Copyright Act (DMCA), respondemos prontamente a notificações de supostas infrações de direitos autorais.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">2. Isenção de Responsabilidade</h2>
              <p>
                A LyneFlix não armazena nenhum arquivo de mídia em seus servidores. Todo o conteúdo exibido na plataforma é fornecido 
                por terceiros e indexado através de APIs públicas. Não possuímos, hospedamos, transmitimos ou distribuímos qualquer conteúdo protegido por direitos autorais.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">3. Notificação de Violação</h2>
              <p>
                Se você acredita que seu trabalho protegido por direitos autorais foi utilizado de forma que constitui uma violação, 
                por favor entre em contato conosco com as seguintes informações:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Identificação da obra protegida por direitos autorais</li>
                <li>Identificação do material que supostamente viola os direitos autorais</li>
                <li>Suas informações de contato (nome, endereço, telefone e e-mail)</li>
                <li>Declaração de boa-fé de que o uso do material não é autorizado</li>
                <li>Declaração de que as informações são precisas, sob pena de perjúrio</li>
                <li>Assinatura física ou eletrônica do titular dos direitos autorais</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">4. Remoção de Conteúdo</h2>
              <p>
                Ao receber uma notificação válida de DMCA, removeremos ou desativaremos o acesso ao material infrator de forma ágil. 
                Também tomaremos medidas razoáveis para notificar o provedor do conteúdo sobre a remoção.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">5. Reincidência</h2>
              <p>
                A LyneFlix se reserva o direito de remover permanentemente qualquer conteúdo que viole repetidamente 
                os direitos autorais de terceiros, em conformidade com a política de reincidência prevista no DMCA.
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

export default DmcaPage;
