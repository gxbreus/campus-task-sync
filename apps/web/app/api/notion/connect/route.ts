import { NextResponse, type NextRequest } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { createOpaqueToken } from "@/lib/server/crypto";
import { createNotionAuthorizationUrl } from "@/lib/server/notion-oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "cts_notion_oauth_state";

function mobileBridge(authorizationUrl: string): string {
  const authorization = new URL(authorizationUrl);
  const escapeHtml = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const fields = [...authorization.searchParams.entries()]
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const copyValue = JSON.stringify(authorizationUrl).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Conectar ao Notion</title>
  </head>
  <body style="font-family:system-ui,sans-serif;padding:32px;color:#102a2d;background:#f7faf8">
    <main style="max-width:520px;margin:auto">
      <h1 style="font-size:1.5rem">Autorize pelo navegador</h1>
      <p>Toque abaixo para abrir a tela em que você escolhe a página do Notion. Este envio evita que o celular trate a autorização como um link comum do aplicativo.</p>
      <form method="get" action="${escapeHtml(`${authorization.origin}${authorization.pathname}`)}">
        ${fields}
        <button type="submit" style="border:0;padding:14px 18px;border-radius:12px;color:white;background:#166b5f;font:inherit;font-weight:700">Continuar no navegador</button>
      </form>
      <hr style="border:0;border-top:1px solid #ccd9d5;margin:28px 0">
      <p><strong>Se o aplicativo ainda abrir na página inicial:</strong> volte aqui, copie a autorização e cole-a diretamente na barra de endereços do navegador.</p>
      <button id="copy" type="button" style="border:1px solid #166b5f;padding:12px 16px;border-radius:12px;color:#166b5f;background:white;font:inherit;font-weight:700">Copiar autorização</button>
      <p id="copied" role="status" style="color:#166b5f;font-weight:700"></p>
    </main>
    <script>
      document.getElementById("copy").addEventListener("click", async function () {
        await navigator.clipboard.writeText(${copyValue});
        document.getElementById("copied").textContent = "Link copiado. Cole na barra de endereços do navegador.";
      });
    </script>
  </body>
</html>`;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const config = loadWebServerConfig();
    const state = createOpaqueToken();
    const authorizationUrl = createNotionAuthorizationUrl(config, state);
    const mobile = /Android|iPhone|iPad|iPod/i.test(request.headers.get("user-agent") ?? "");
    const response = mobile
      ? new NextResponse(mobileBridge(authorizationUrl), {
          status: 200,
          headers: {
            "cache-control": "no-store, max-age=0",
            "content-type": "text/html; charset=utf-8",
          },
        })
      : NextResponse.redirect(authorizationUrl, 307);
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: config.appUrl.startsWith("https://"),
    });
    return response;
  } catch {
    return Response.json(
      { message: "A conexão com o Notion ainda não foi configurada pelo administrador." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
