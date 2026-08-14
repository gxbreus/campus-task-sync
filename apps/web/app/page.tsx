import { SetupWizard } from "@/components/setup-wizard";
import { isNotionOAuthConfigured, loadWebServerConfig } from "@/lib/server/config";
import { findInstallation } from "@/lib/server/installations";
import { installationToken } from "@/lib/server/session";

type HomeProps = {
  searchParams: Promise<{ notion?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { notion } = await searchParams;
  let savedInstallation:
    | Awaited<ReturnType<typeof findInstallation>>
    | undefined;
  if (isNotionOAuthConfigured()) {
    const token = await installationToken();
    if (token) {
      try {
        savedInstallation = await findInstallation(loadWebServerConfig(), token);
      } catch {
        savedInstallation = undefined;
      }
    }
  }
  const notionConnected = Boolean(savedInstallation) || notion === "connected";
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
        notionConnected={notionConnected}
        notionError={notion === "error"}
        calendarConnected={Boolean(savedInstallation?.calendarUrlEncrypted)}
        moodleConnected={Boolean(savedInstallation?.moodleTokenEncrypted)}
        taskPanelCreated={Boolean(savedInstallation?.notionDataSourceId)}
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
