"use client";

import { FormEvent, useMemo, useState } from "react";

type State = "idle" | "loading" | "success" | "error";

const CAMPUS_CALENDAR_URL = "https://campusvirtual.ufla.br/presencial/calendar/export.php";
const MOODLE_TOKEN_URL = "https://campusvirtual.ufla.br/presencial/login/token.php";

type SetupWizardProps = {
  calendarConnected: boolean;
  moodleConnected: boolean;
  notionConfigured: boolean;
  notionConnected: boolean;
  notionError: boolean;
  taskPanelCreated: boolean;
};

type ActionName = "structure" | "sync";

export function SetupWizard({
  calendarConnected,
  moodleConnected,
  notionConfigured,
  notionConnected,
  notionError,
  taskPanelCreated,
}: SetupWizardProps) {
  const [calendar, setCalendar] = useState("");
  const [calendarState, setCalendarState] = useState<State>(calendarConnected ? "success" : "idle");
  const [calendarMessage, setCalendarMessage] = useState(calendarConnected ? "Calendário protegido e pronto para sincronizar." : "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [moodleState, setMoodleState] = useState<State>(moodleConnected ? "success" : "idle");
  const [moodleMessage, setMoodleMessage] = useState(moodleConnected ? "Token protegido e pronto para sincronizar." : "");
  const [moodleTokenReady, setMoodleTokenReady] = useState(moodleConnected);
  const [panelReady, setPanelReady] = useState(taskPanelCreated);
  const [actionLoading, setActionLoading] = useState<ActionName>();
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);

  const completed = useMemo(
    () => Number(notionConnected) + Number(calendarState === "success") + Number(moodleState === "success"),
    [notionConnected, calendarState, moodleState],
  );

  async function validateCalendar(event: FormEvent) {
    event.preventDefault();
    setCalendarState("loading");
    setCalendarMessage("");
    try {
      const response = await fetch("/api/onboarding/calendar", {
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
      const saveResponse = await fetch("/api/onboarding/moodle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: result.token }),
      });
      const saved = (await saveResponse.json()) as { saved?: boolean; message?: string };
      if (!saveResponse.ok || !saved.saved) {
        throw new Error(saved.message ?? "Não foi possível proteger o token do Campus.");
      }
      setMoodleTokenReady(true);
      setUsername("");
      setPassword("");
      setMoodleState("success");
      setMoodleMessage("Token validado e protegido para as próximas sincronizações.");
    } catch (error) {
      setPassword("");
      setMoodleState("error");
      setMoodleMessage(error instanceof Error ? error.message : "Não foi possível obter o token.");
    }
  }

  async function executeAction(action: ActionName, endpoint: string) {
    setActionLoading(action);
    setActionMessage("");
    setActionError(false);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const result = (await response.json()) as {
        calendarTasks?: number;
        importantDates?: { dates?: number; plansParsed?: number };
        message?: string;
        tasksPanel?: { tasksFound?: number };
      };
      if (!response.ok) throw new Error(result.message ?? "Não foi possível concluir esta ação.");
      if (action === "structure") {
        setPanelReady(true);
        setActionMessage(
          `Notion estruturado: ${result.tasksPanel?.tasksFound ?? 0} atividades e ` +
          `${result.importantDates?.dates ?? 0} datas de planos encontradas.`,
        );
      } else {
        setActionMessage(
          `Sincronização concluída com ${result.calendarTasks ?? 0} atividades e ` +
          `${result.importantDates?.dates ?? 0} datas importantes.`,
        );
      }
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Não foi possível concluir esta ação.");
    } finally {
      setActionLoading(undefined);
    }
  }

  const technicalStepsReady = notionConnected && calendarState === "success" && moodleState === "success";

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

      <article className={`step current ${notionConnected ? "done" : ""}`}>
        <div className="step-number">1</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Conecte seu Notion</h3><p>Autorize somente a página onde o painel será criado.</p></div>
            {notionConnected ? (
              <span className="status success">Conectado</span>
            ) : (
              <span className="status waiting">Aguardando conexão</span>
            )}
          </div>
          <a
            className={`button primary notion-button ${notionConfigured ? "" : "disabled"}`}
            href={notionConfigured ? "/api/notion/connect" : undefined}
            aria-disabled={!notionConfigured}
          >
            {notionConnected ? "Reconectar ao Notion" : "Conectar ao Notion"}
          </a>
          {!notionConfigured && <p className="hint">A integração pública ainda precisa ser configurada na Vercel.</p>}
          {notionConfigured && !notionConnected && (
            <p className="hint">
              Após autorizar a página, você voltará automaticamente para continuar a configuração.
            </p>
          )}
          {notionError && <p className="feedback error">A autorização não foi concluída. Tente novamente e escolha uma página do Notion.</p>}
          {notionConnected && <p className="feedback success">Workspace autorizado e token protegido com criptografia.</p>}
        </div>
      </article>

      <article className={`step ${calendarState === "success" ? "done" : ""}`}>
        <div className="step-number">2</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Cole o calendário do Campus</h3><p>Use a URL dinâmica, não o arquivo de backup.</p></div>
            {calendarState === "success" && <span className="status success">Conectado</span>}
          </div>
          <a className="campus-calendar-button" href={CAMPUS_CALENDAR_URL} target="_blank" rel="noreferrer">
            <span aria-hidden="true">↗</span>
            Abrir o Campus e obter o link do calendário
          </a>
          <div className="calendar-guide" aria-label="Opções para exportar o calendário">
            <strong>Na tela do Campus, selecione:</strong>
            <ol>
              <li>
                <span>Eventos a exportar</span>
                <b>Todos os eventos</b>
              </li>
              <li>
                <span>Período</span>
                <b>Intervalo personalizado</b>
                <small>Confira se as datas cobrem todo o semestre.</small>
              </li>
              <li>
                <span>Para finalizar</span>
                <b>Obter URL do calendário</b>
                <small>Não clique em “Exportar”: esse botão gera apenas um arquivo sem atualização automática.</small>
              </li>
            </ol>
          </div>
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
                disabled={!notionConnected || calendarState === "success"}
              />
            </label>
            <button className="button secondary" disabled={!notionConnected || calendarState === "loading" || calendarState === "success"}>
              {calendarState === "loading"
                ? "Validando..."
                : calendarState === "success"
                  ? "Calendário validado"
                  : "Validar calendário"}
            </button>
          </form>
          {!notionConnected && <p className="hint">Conecte o Notion para liberar esta etapa.</p>}
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
            <span>O navegador envia a senha diretamente ao Campus Virtual por HTTPS. A senha nunca é salva; somente o token emitido pelo Campus é enviado ao servidor e protegido com criptografia.</span>
          </div>
          <form onSubmit={obtainMoodleToken} className="credentials-form">
            <label>
              <span>Usuário institucional</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                autoComplete="username"
                disabled={calendarState !== "success" || moodleState === "success"}
              />
            </label>
            <label>
              <span>Senha do Campus</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                disabled={calendarState !== "success" || moodleState === "success"}
              />
            </label>
            <button className="button secondary" disabled={calendarState !== "success" || moodleState === "loading" || moodleState === "success"}>
              {moodleState === "loading"
                ? "Conectando..."
                : moodleState === "success"
                  ? "Token obtido"
                  : "Obter token com segurança"}
            </button>
          </form>
          {calendarState !== "success" && <p className="hint">Valide o calendário para liberar esta etapa.</p>}
          {moodleMessage && <p className={`feedback ${moodleState}`}>{moodleMessage}</p>}
          {moodleTokenReady && <p className="token-ready">A senha e o usuário foram removidos da página. O token cifrado permite sincronizar sem pedir login novamente.</p>}
        </div>
      </article>

      <article className={`step ${technicalStepsReady ? "current" : "locked"}`}>
        <div className="step-number">4</div>
        <div className="step-content">
          <div className="step-title">
            <div><h3>Crie e sincronize seus painéis</h3><p>Tarefas, faltas e datas importantes em poucos cliques.</p></div>
            <span className={`status ${technicalStepsReady ? "success" : "waiting"}`}>
              {technicalStepsReady ? "Pronto para criar" : "Aguardando etapas"}
            </span>
          </div>
          <div className="action-grid">
            <button
              className="action-card"
              disabled={!technicalStepsReady || Boolean(actionLoading)}
              onClick={() => executeAction("structure", "/api/panels/structure")}
            ><span>▦</span><strong>{actionLoading === "structure" ? "Estruturando o Notion..." : panelReady ? "Atualizar estrutura do Notion" : "Estruturar Notion"}</strong><small>Cria tarefas, controle de faltas e datas dos planos de ensino</small></button>
            <button
              className="action-card"
              disabled={!technicalStepsReady || !panelReady || Boolean(actionLoading)}
              onClick={() => executeAction("sync", "/api/sync")}
            ><span>↻</span><strong>{actionLoading === "sync" ? "Sincronizando..." : "Sincronizar agora"}</strong><small>{panelReady ? "Atualiza as pendências do Campus" : "Crie primeiro o painel de tarefas"}</small></button>
          </div>
          {actionMessage && <p className={`feedback ${actionError ? "error" : "success"}`}>{actionMessage}</p>}
        </div>
      </article>
    </section>
  );
}
