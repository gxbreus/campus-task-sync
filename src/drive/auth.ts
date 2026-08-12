import { randomUUID } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import { google } from "googleapis";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export type DriveAuthClient = InstanceType<typeof google.auth.OAuth2>;

type DriveAuthOptions = {
  credentialsPath?: string;
  tokenPath?: string;
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
};

function paths(options: DriveAuthOptions): { credentialsPath: string; tokenPath: string } {
  const env = options.env ?? process.env;
  return {
    credentialsPath: options.credentialsPath ?? (env.GOOGLE_DRIVE_CREDENTIALS_PATH?.trim() || ".google-drive-credentials.json"),
    tokenPath: options.tokenPath ?? (env.GOOGLE_DRIVE_TOKEN_PATH?.trim() || ".google-drive-token.json"),
  };
}

async function loadSavedToken(tokenPath: string): Promise<DriveAuthClient | undefined> {
  try {
    const credentials = JSON.parse(await readFile(tokenPath, "utf8")) as Record<string, unknown>;
    return google.auth.fromJSON(credentials) as unknown as DriveAuthClient;
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

function authFromEnvironment(env: NodeJS.ProcessEnv): DriveAuthClient | undefined {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return undefined;
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function saveToken(client: DriveAuthClient, credentialsPath: string, tokenPath: string): Promise<void> {
  const source = JSON.parse(await readFile(credentialsPath, "utf8")) as {
    installed?: { client_id?: string; client_secret?: string };
    web?: { client_id?: string; client_secret?: string };
  };
  const keys = source.installed ?? source.web;
  const refreshToken = client.credentials.refresh_token;
  if (!keys?.client_id || !keys.client_secret || !refreshToken) {
    throw new Error("O Google não retornou credenciais permanentes. Remova o token anterior e autorize novamente.");
  }
  await writeFile(tokenPath, JSON.stringify({
    type: "authorized_user",
    client_id: keys.client_id,
    client_secret: keys.client_secret,
    refresh_token: refreshToken,
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  await chmod(tokenPath, 0o600);
}

async function interactiveAuthorization(credentialsPath: string): Promise<DriveAuthClient> {
  const source = JSON.parse(await readFile(credentialsPath, "utf8")) as {
    installed?: { client_id?: string; client_secret?: string };
    web?: { client_id?: string; client_secret?: string };
  };
  const keys = source.installed ?? source.web;
  if (!keys?.client_id || !keys.client_secret) {
    throw new Error("O JSON não contém um cliente OAuth válido.");
  }
  const state = randomUUID();
  return await new Promise<DriveAuthClient>((resolve, reject) => {
    const server = createServer();
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("A autorização do Google expirou. Execute npm run setup:drive novamente."));
    }, 5 * 60 * 1000);
    server.on("request", async (request, response) => {
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Servidor OAuth indisponível.");
        const callbackUrl = `http://127.0.0.1:${address.port}/oauth2callback`;
        const url = new URL(request.url ?? "/", callbackUrl);
        if (url.pathname !== "/oauth2callback") {
          response.writeHead(404).end("Não encontrado.");
          return;
        }
        if (url.searchParams.get("state") !== state) throw new Error("Estado OAuth inválido.");
        const code = url.searchParams.get("code");
        if (!code) throw new Error(url.searchParams.get("error") ?? "O Google não retornou o código OAuth.");
        const client = new google.auth.OAuth2(keys.client_id, keys.client_secret, callbackUrl);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<h1>Google Drive autorizado</h1><p>Você já pode fechar esta aba e voltar ao terminal.</p>");
        clearTimeout(timeout);
        server.close();
        resolve(client);
      } catch (error) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end(error instanceof Error ? error.message : "Falha na autorização.");
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timeout);
        server.close();
        reject(new Error("Não foi possível iniciar o retorno local do OAuth."));
        return;
      }
      const callbackUrl = `http://127.0.0.1:${address.port}/oauth2callback`;
      const client = new google.auth.OAuth2(keys.client_id, keys.client_secret, callbackUrl);
      const authorizationUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [DRIVE_SCOPE],
        state,
      });
      console.log(`Abra esta URL se o navegador não iniciar automaticamente:\n${authorizationUrl}`);
      const browser = spawn("xdg-open", [authorizationUrl], { detached: true, stdio: "ignore" });
      browser.on("error", () => undefined);
      browser.unref();
    });
  });
}

export async function authorizeDrive(options: DriveAuthOptions = {}): Promise<DriveAuthClient> {
  const env = options.env ?? process.env;
  const environmentClient = authFromEnvironment(env);
  if (environmentClient) return environmentClient;
  const { credentialsPath, tokenPath } = paths(options);
  const saved = await loadSavedToken(tokenPath);
  if (saved) return saved;
  if (options.interactive === false) {
    throw new Error("Google Drive ainda não foi autorizado. Execute npm run setup:drive.");
  }
  let client: DriveAuthClient;
  try {
    client = await interactiveAuthorization(credentialsPath);
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      throw new Error(`Credencial do Google não encontrada em ${credentialsPath}. Baixe o JSON do cliente OAuth para esse caminho.`);
    }
    throw error;
  }
  await saveToken(client, credentialsPath, tokenPath);
  return client;
}
