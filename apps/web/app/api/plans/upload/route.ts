import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { requireSameOrigin, WebRequestError } from "@/lib/server/request-security";
import { installationToken } from "@/lib/server/session";
import { importTeachingPlans } from "@/lib/server/web-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAXIMUM_REQUEST_BYTES = 4_000_000;
const MAXIMUM_FILES = 8;

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAXIMUM_REQUEST_BYTES) {
      throw new WebRequestError("Os arquivos juntos devem ter no máximo 4 MB.", 413);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new WebRequestError("Envie os planos no formato PDF.", 415);
    }
    const token = await installationToken();
    if (!token) throw new WebRequestError("Conecte novamente o Notion.", 401);
    const form = await request.formData();
    const files = form.getAll("plans").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > MAXIMUM_FILES) {
      throw new WebRequestError("Selecione entre 1 e 8 planos de ensino em PDF.");
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAXIMUM_REQUEST_BYTES) {
      throw new WebRequestError("Os arquivos juntos devem ter no máximo 4 MB.", 413);
    }
    const invalid = files.find((file) =>
      file.size === 0 || file.size > MAXIMUM_REQUEST_BYTES ||
      (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf"),
    );
    if (invalid) throw new WebRequestError("Cada plano precisa ser um PDF válido de até 4 MB.");
    const result = await importTeachingPlans(
      loadWebServerConfig(),
      token,
      await Promise.all(files.map(async (file) => ({
        name: file.name.slice(0, 180),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }))),
    );
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const known = error instanceof WebRequestError;
    const noDates = error instanceof Error && /Nenhuma avaliação foi reconhecida/.test(error.message);
    return NextResponse.json(
      {
        message: known || noDates
          ? error.message
          : "Não foi possível processar os planos. Confirme se são PDFs de planos de ensino da UFLA.",
      },
      { status: known ? error.status : noDates ? 422 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
