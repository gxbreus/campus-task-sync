import "dotenv/config";

import { createInterface } from "node:readline/promises";

import { loadCalendarConfig } from "./config.js";
import {
  requestMoodleToken,
  saveEnvMoodleToken,
  validateMoodleToken,
} from "./moodle/auth.js";

function readSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Este comando precisa ser executado em um terminal interativo.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish();
          reject(new Error("Operacao cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const { calendarUrl } = loadCalendarConfig();
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const username = (await prompt.question("Usuario institucional do Campus: ")).trim();
  prompt.close();
  const password = await readSecret("Senha (nao sera exibida nem salva): ");
  if (!username || !password) throw new Error("Usuario e senha sao obrigatorios.");

  const token = await requestMoodleToken({ calendarUrl, username, password });
  await validateMoodleToken(calendarUrl, token);
  await saveEnvMoodleToken(token);
  console.log("Token do Moodle validado e salvo com seguranca no .env.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});
