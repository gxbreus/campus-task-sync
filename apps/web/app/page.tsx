import { SetupWizard } from "@/components/setup-wizard";
import { isNotionOAuthConfigured } from "@/lib/server/config";

type HomeProps = {
  searchParams: Promise<{ notion?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { notion } = await searchParams;
  return (
    <main>
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">BETA · PROJETO INDEPENDENTE</span>
          <h1>Seu Campus organizado no Notion.</h1>
          <p>
            Faça a configuração uma única vez. Depois, acompanhe atividades,
            prazos e disciplinas pelo Notion — inclusive no celular.
          </p>
          <div className="trust-row">
            <span>Sem conta adicional</span>
            <span>Senha não armazenada</span>
            <span>Você controla os acessos</span>
          </div>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span>🎓</span>
          <strong>Campus</strong>
          <small>Task Sync</small>
        </div>
      </header>
      <SetupWizard
        notionConfigured={isNotionOAuthConfigured()}
        notionConnected={notion === "connected"}
        notionError={notion === "error"}
      />
      <footer className="site-footer">
        <p>Projeto open source e sem vínculo oficial com a UFLA.</p>
        <nav aria-label="Links do projeto e do desenvolvedor">
          <span className="developer-credit">
            Desenvolvido por{" "}
            <a
              href="https://github.com/gxbreus"
              target="_blank"
              rel="noopener noreferrer"
            >
              Gabriel Soares
            </a>
          </span>
          <a
            className="contribute-link"
            href="https://github.com/gxbreus/campus-task-sync"
            target="_blank"
            rel="noopener noreferrer"
          >
            Colabore com o projeto
          </a>
        </nav>
      </footer>
    </main>
  );
}
