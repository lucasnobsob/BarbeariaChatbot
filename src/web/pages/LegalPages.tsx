import { Link } from 'react-router-dom';
import { Scissors } from 'lucide-react';

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-white">
            <Scissors className="h-5 w-5 text-amber-400" />
            <span>BarberSaaS</span>
          </Link>
          <div className="flex gap-4 text-xs text-slate-400">
            <Link to="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link to="/termos" className="hover:text-white">Termos</Link>
            <Link to="/exclusao-de-dados" className="hover:text-white">Exclusão de Dados</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12 space-y-6">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">{children}</div>
      </main>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalShell title="Política de Privacidade">
      <p>
        Esta Política de Privacidade descreve como a plataforma BarberSaaS e as barbearias
        cadastradas coletam, utilizam e protegem informações fornecidas por proprietários e
        clientes durante agendamentos online e atendimentos via chatbot (WhatsApp Cloud API e
        Telegram Bot API).
      </p>
      <h2 className="text-lg font-semibold text-white">1. Dados coletados</h2>
      <p>
        Coletamos apenas os dados necessários para a prestação do serviço de agendamento e
        atendimento ao cliente: nome, telefone de contato, e-mail (quando informado), histórico de
        agendamentos e mensagens enviadas voluntariamente aos canais oficiais de atendimento.
      </p>
      <h2 className="text-lg font-semibold text-white">2. Uso das informações e isolamento</h2>
      <p>
        Cada estabelecimento possui ambiente isolado (multi-tenant). Os dados dos clientes de uma
        barbearia não são compartilhados com outros estabelecimentos nem vendidos a terceiros.
        Tokens e segredos de integração são armazenados criptografados com AES-GCM.
      </p>
      <h2 className="text-lg font-semibold text-white">3. Segurança e contato</h2>
      <p>
        Utilizamos criptografia em trânsito (HTTPS/TLS) e validação criptográfica de webhooks. Para
        dúvidas ou solicitações relacionadas à LGPD, entre em contato diretamente com o
        estabelecimento ou pelo painel administrativo da plataforma.
      </p>
    </LegalShell>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalShell title="Termos de Serviço">
      <p>
        Ao utilizar a plataforma BarberSaaS, você concorda em usar os recursos de site público,
        agenda online e chatbot apenas para fins lícitos e em conformidade com as políticas das
        APIs oficiais utilizadas (Meta WhatsApp Cloud API e Telegram Bot API).
      </p>
      <h2 className="text-lg font-semibold text-white">1. Responsabilidade pelos dados</h2>
      <p>
        Cada estabelecimento cadastrado é responsável pelas informações comerciais divulgadas,
        preços, horários de funcionamento, serviços e comunicações enviadas aos seus clientes.
      </p>
      <h2 className="text-lg font-semibold text-white">2. Disponibilidade</h2>
      <p>
        Os serviços dependem da disponibilidade da infraestrutura de hospedagem e das APIs
        oficiais de mensageria configuradas pelo proprietário da barbearia.
      </p>
    </LegalShell>
  );
}

export function DataDeletionPage() {
  return (
    <LegalShell title="Exclusão de Dados do Usuário">
      <p>
        Em conformidade com a LGPD e as diretrizes da plataforma Meta, clientes e proprietários
        podem solicitar a remoção de seus dados armazenados no sistema a qualquer momento.
      </p>
      <h2 className="text-lg font-semibold text-white">Como solicitar a exclusão</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Caso seja cliente de uma barbearia: solicite a exclusão diretamente pelo canal de contato
          (telefone, WhatsApp ou e-mail) exibido no rodapé da página da respectiva barbearia,
          informando seu nome e telefone cadastrado.
        </li>
        <li>
          Caso seja proprietário de uma barbearia: acesse o painel administrativo da plataforma e
          remova os registros de clientes, agendamentos ou configurações de integração na respectiva
          seção.
        </li>
      </ol>
    </LegalShell>
  );
}
