import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY precisa conter exatamente 32 bytes em base64.");
  }
  return key;
}

export function encryptSecret(value: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeEncryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string, encodedKey: string): string {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("O segredo armazenado possui formato inválido.");
  }
  const [encodedIv, encodedTag, encodedCiphertext] = parts as [string, string, string];
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeEncryptionKey(encodedKey),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
