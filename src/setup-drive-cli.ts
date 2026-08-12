import "dotenv/config";

import { authorizeDrive } from "./drive/auth.js";
import { GoogleDriveDestination } from "./drive/google-drive.js";

async function main(): Promise<void> {
  const auth = await authorizeDrive();
  const destination = new GoogleDriveDestination(auth);
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() ||
    await destination.getOrCreateFolder("Campus Virtual - 2026.2");
  console.log(JSON.stringify({ authorized: true, rootFolderId }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erro desconhecido.");
  process.exitCode = 1;
});

