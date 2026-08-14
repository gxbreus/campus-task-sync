import { SetupWizard } from "@/components/setup-wizard";

export default function Home() {
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
      <SetupWizard />
      <footer className="site-footer">
        <p>Projeto open source e sem vínculo oficial com a UFLA.</p>
        <nav aria-label="Links do desenvolvedor">
          <span>Desenvolvido por @gxbreus</span>
          <a
            href="https://github.com/gxbreus"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/gabreus/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
        </nav>
      </footer>
    </main>
  );
}
