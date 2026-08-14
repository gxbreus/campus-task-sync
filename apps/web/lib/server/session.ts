import "server-only";

import { cookies } from "next/headers";

export const INSTALLATION_COOKIE = "cts_installation";

export async function installationToken(): Promise<string | undefined> {
  return (await cookies()).get(INSTALLATION_COOKIE)?.value;
}
