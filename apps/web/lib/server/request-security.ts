import "server-only";

export class WebRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function safeActionError(
  error: unknown,
  fallback: string,
): { message: string; status: number } {
  if (error instanceof WebRequestError) return { message: error.message, status: error.status };
  if (error instanceof Error && /Nenhuma página foi compartilhada|HTTP (401|403|404)|object_not_found/i.test(error.message)) {
    return {
      message: "O Notion não encontrou a página ou painel autorizado. Reconecte o Notion e escolha a página novamente.",
      status: 409,
    };
  }
  return { message: fallback, status: 500 };
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      throw new WebRequestError("Origem da solicitação não autorizada.", 403);
    }
  } catch (error) {
    if (error instanceof WebRequestError) throw error;
    throw new WebRequestError("Origem da solicitação não autorizada.", 403);
  }
}

export async function smallJson<T>(request: Request, maximumBytes = 8_192): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new WebRequestError("Envie os dados no formato JSON.", 415);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new WebRequestError("A solicitação ultrapassou o tamanho permitido.", 413);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new WebRequestError("O conteúdo enviado não é um JSON válido.");
  }
}
