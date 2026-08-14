"use client";

import { FormEvent, useMemo, useState } from "react";

type State = "idle" | "loading" | "success" | "error";

const CAMPUS_CALENDAR_URL = "https://campusvirtual.ufla.br/presencial/calendar/export.php";
const MOODLE_TOKEN_URL = "https://campusvirtual.ufla.br/presencial/login/token.php";

export function SetupWizard() {
  const [calendar, setCalendar] = useState("");
  const [calendarState, setCalendarState] = useState<State>("idle");
  const [calendarMessage, setCalendarMessage] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [moodleState, setMoodleState] = useState<State>("idle");
  const [moodleMessage, setMoodleMessage] = useState("");
  const [moodleTokenReady, setMoodleTokenReady] = useState(false);

  const completed = useMemo(
    () => Number(calendarState === "success") + Number(moodleState === "success"),
    [calendarState, moodleState],
  );

  async function validateCalendar(event: FormEvent) {
    event.preventDefault();
    setCalendarState("loading");
    setCalendarMessage("");
    try {
      const response = await fetch("/api/calendar/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: calendar }),
      });
      const result = (await response.json()) as { valid: boolean; events?: number; message?: string };
      if (!response.ok || !result.valid) throw new Error(result.message ?? "URL inválida.");
      setCalendar("");
      setCalendarState("success");
      setCalendarMessage(
        result.events === 1 ? "Calendário válido · 1 evento encontrado" : `Calendário válido · ${result.events ?? 0} eventos encontrados`,
      );
    } catch (error) {
      setCalendarState("error");
      setCalendarMessage(error instanceof Error ? error.message : "Não foi possível validar.");
    }
  }

  async function obtainMoodleToken(event: FormEvent) {
    event.preventDefault();
    setMoodleState("loading");
    setMoodleMessage("");
    try {
      const response = await fetch(MOODLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: username.trim(),
          password,
          service: "moodle_mobile_app",
        }),
      });
      const result = (await response.json()) as { token?: string; error?: string; errorcode?: string };
      if (!response.ok || !result.token) {
        throw new Error(result.error ?? "O Campus não emitiu o token. Confira usuário e senha.");
      }
      setMoodleTokenReady(true);
      setUsername("");
      setPassword("");
      setMoodleState("success");
      setMoodleMessage("Token validado diretamente com o Campus e descartado por este beta.");
    } catch (error) {
      setPassword("");
      setMoodleState("error");
      setMoodleMessage(error instanceof Error ? error.message : "Não foi possível obter o token.");
    }
  }

  return (
    <section className="wizard" aria-label="Configuração do Campus Task Sync">
      <div className="wizard-heading">
        <div>
          <span className="eyebrow">CONFIGURAÇÃO GUIADA</span>
          <h2>Vamos preparar seu painel</h2>
          <p>Nenhum comando no terminal. Conclua cada etapa pelos botões abaixo.</p>
        </div>
        <div className="progress" aria-label={`${completed} de 3 etapas técnicas concluídas`}>
          <strong>{completed}/3</strong>
          <span>etapas prontas</span>
        </div>
      </div>

      <article className="step current">
        <div className="step-number">1</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Conecte seu Notion</h3><p>Autorize somente a página onde o painel será criado.</p></div>
            <span className="status waiting">Em preparação</span>
          </div>
          <button className="button primary" type="button" disabled>
            Conectar ao Notion
          </button>
          <p className="hint">O botão será ativado quando cadastrarmos a integração pública do beta.</p>
        </div>
      </article>

      <article className={`step ${calendarState === "success" ? "done" : ""}`}>
        <div className="step-number">2</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Cole o calendário do Campus</h3><p>Use a URL dinâmica, não o arquivo de backup.</p></div>
            {calendarState === "success" && <span className="status success">Conectado</span>}
          </div>
          <a className="text-link" href={CAMPUS_CALENDAR_URL} target="_blank" rel="noreferrer">
            Abrir exportação do calendário ↗
          </a>
          <form onSubmit={validateCalendar} className="form-row">
            <label>
              <span>URL dinâmica do calendário</span>
              <input
                type="url"
                value={calendar}
                onChange={(event) => setCalendar(event.target.value)}
                placeholder="https://campusvirtual.ufla.br/..."
                required
                autoComplete="off"
              />
            </label>
            <button className="button secondary" disabled={calendarState === "loading"}>
              {calendarState === "loading" ? "Validando..." : "Validar calendário"}
            </button>
          </form>
          {calendarMessage && <p className={`feedback ${calendarState}`}>{calendarMessage}</p>}
        </div>
      </article>

      <article className={`step ${moodleState === "success" ? "done" : ""}`}>
        <div className="step-number">3</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Obtenha os detalhes das atividades</h3><p>O token permite consultar abertura, enunciados e materiais.</p></div>
            {moodleState === "success" && <span className="status success">Token obtido</span>}
          </div>
          <div className="security-note">
            <strong>Sua senha não passa pelo Campus Task Sync.</strong>
            <span>O navegador a envia diretamente ao Campus Virtual por HTTPS. Este beta não usa banco, cookies nem armazenamento local para guardar seus dados.</span>
          </div>
          <form onSubmit={obtainMoodleToken} className="credentials-form">
            <label>
              <span>Usuário institucional</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
            </label>
            <label>
              <span>Senha do Campus</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
            </label>
            <button className="button secondary" disabled={moodleState === "loading"}>
              {moodleState === "loading" ? "Conectando..." : "Obter token com segurança"}
            </button>
          </form>
          {moodleMessage && <p className={`feedback ${moodleState}`}>{moodleMessage}</p>}
          {moodleTokenReady && <p className="token-ready">A senha, o usuário e o token foram removidos da página após a validação.</p>}
        </div>
      </article>

      <article className="step locked">
        <div className="step-number">4</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Crie e sincronize seus painéis</h3><p>Tarefas, faltas e datas importantes em poucos cliques.</p></div>
            <span className="status waiting">Aguardando etapas</span>
          </div>
          <div className="action-grid">
            <button className="action-card" disabled><span>✓</span><strong>Criar painel de tarefas</strong><small>Substitui setup:notion</small></button>
            <button className="action-card" disabled><span>▦</span><strong>Criar controle de faltas</strong><small>Substitui setup:attendance</small></button>
            <button className="action-card" disabled><span>↻</span><strong>Sincronizar agora</strong><small>Substitui npm run sync</small></button>
          </div>
        </div>
      </article>
    </section>
  );
}
