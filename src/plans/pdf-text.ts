type TextItem = { str: string; transform: number[]; width: number };

function isTextItem(value: unknown): value is TextItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TextItem>;
  return typeof item.str === "string" && Array.isArray(item.transform);
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // O carregamento tardio evita inicializar o runtime pesado do PDF.js em
  // rotas da Vercel que não precisam ler um plano de ensino.
  // O worker também precisa ser importado explicitamente. Sem isso, o bundle
  // de produção do Next tenta carregar um pdf.worker.mjs que não existe na
  // função serverless e todo PDF falha antes da extração do texto.
  const [{ getDocument }, { WorkerMessageHandler }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  const workerGlobal = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler };
  };
  workerGlobal.pdfjsWorker ??= { WorkerMessageHandler };
  const document = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, Array<{ text: string; x: number }>>();
      for (const value of content.items) {
        if (!isTextItem(value) || !value.str.trim()) continue;
        const x = value.transform[4] ?? 0;
        const y = Math.round((value.transform[5] ?? 0) / 2) * 2;
        const line = lines.get(y) ?? [];
        line.push({ text: value.str, x });
        lines.set(y, line);
      }
      pages.push(
        [...lines.entries()]
          .sort(([left], [right]) => right - left)
          .map(([, items]) => items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "))
          .join("\n"),
      );
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pages.join("\n");
}
