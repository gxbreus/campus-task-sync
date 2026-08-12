import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { google, type drive_v3 } from "googleapis";
import type { DriveAuthClient } from "./auth.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type UploadFile = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  parentId: string;
  sourceId: string;
  courseCode: string;
};

export type UploadResult = "created" | "updated" | "unchanged";

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function safeName(value: string): string {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) || "Sem nome";
}

export class GoogleDriveDestination {
  private readonly drive: drive_v3.Drive;
  private readonly folderCache = new Map<string, string>();

  constructor(auth: DriveAuthClient) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const normalizedName = safeName(name);
    const key = `${parentId ?? "root"}\n${normalizedName}`;
    const cached = this.folderCache.get(key);
    if (cached) return cached;
    const q = [
      `name = '${escapeQuery(normalizedName)}'`,
      `mimeType = '${FOLDER_MIME_TYPE}'`,
      "trashed = false",
      `'${escapeQuery(parentId ?? "root")}' in parents`,
    ].join(" and ");
    const existing = await this.drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
    const existingId = existing.data.files?.[0]?.id;
    if (existingId) {
      this.folderCache.set(key, existingId);
      return existingId;
    }
    const created = await this.drive.files.create({
      requestBody: {
        name: normalizedName,
        mimeType: FOLDER_MIME_TYPE,
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: "id",
    });
    if (!created.data.id) throw new Error(`O Google Drive não retornou o ID da pasta ${normalizedName}.`);
    this.folderCache.set(key, created.data.id);
    return created.data.id;
  }

  async uploadFile(file: UploadFile): Promise<UploadResult> {
    const sourceKey = createHash("sha256").update(file.sourceId).digest("hex");
    const contentHash = createHash("sha256").update(file.bytes).digest("hex");
    const query = `appProperties has { key='campusSource' and value='${sourceKey}' } and trashed = false`;
    const found = await this.drive.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id,appProperties)",
      pageSize: 1,
    });
    const existing = found.data.files?.[0];
    if (existing?.appProperties?.contentHash === contentHash) return "unchanged";
    const media = { mimeType: file.mimeType, body: Readable.from(Buffer.from(file.bytes)) };
    const appProperties = { campusSource: sourceKey, contentHash, courseCode: file.courseCode };
    if (existing?.id) {
      await this.drive.files.update({
        fileId: existing.id,
        requestBody: { name: safeName(file.name), appProperties },
        media,
        fields: "id",
      });
      return "updated";
    }
    await this.drive.files.create({
      requestBody: {
        name: safeName(file.name),
        parents: [file.parentId],
        appProperties,
      },
      media,
      fields: "id",
    });
    return "created";
  }
}
