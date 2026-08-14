import { NextResponse } from "next/server";

import { MoodleClient } from "@campus/moodle/client";

import { loadWebServerConfig } from "@/lib/server/config";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { findInstallation, updateInstallation } from "@/lib/server/installations";
import { requireSameOrigin, smallJson, WebRequestError } from "@/lib/server/request-security";
import { installationToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const token = await installationToken();
    if (!token) throw new WebRequestError("Conecte primeiro o Notion.", 401);
    const body = await smallJson<{ token?: unknown }>(request, 2_048);
    if (typeof body.token !== "string" || !/^[a-zA-Z0-9]{20,256}$/.test(body.token)) {
      throw new WebRequestError("O Campus não retornou um token válido.");
    }
    const config = loadWebServerConfig();
    const installation = await findInstallation(config, token);
    if (!installation?.calendarUrlEncrypted) {
      throw new WebRequestError("Valide primeiro o calendário.", 409);
    }
    const calendarUrl = decryptSecret(installation.calendarUrlEncrypted, config.encryptionKey);
    const moodle = new MoodleClient({ calendarUrl, token: body.token });
    const courses = await moodle.getCurrentSemesterCourses();
    await updateInstallation(config, token, {
      moodleTokenEncrypted: encryptSecret(body.token, config.encryptionKey),
    });
    return NextResponse.json(
      { saved: true, courses: courses.length },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const known = error instanceof WebRequestError;
    return NextResponse.json(
      {
        saved: false,
        message: known ? error.message : "Não foi possível validar e proteger o token do Campus.",
      },
      {
        status: known ? error.status : 502,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  }
}
