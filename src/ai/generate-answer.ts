import type { CampusTask } from "../domain/task.js";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

export type AnswerGenerator = (task: CampusTask) => Promise<string>;

type OpenAiAnswerGeneratorOptions = {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function attachmentUrls(task: CampusTask): string[] {
  const text = [task.description, task.sourceUrl].filter(Boolean).join("\n");
  return [...text.matchAll(/https?:\/\/[^\s<>"']+\.(?:pdf|docx?|pptx?|txt)(?:\?[^\s<>"']*)?/gi)]
    .map((match) => match[0])
    .slice(0, 5);
}

function responseText(response: JsonObject): string | undefined {
  if (typeof response.output_text === "string") return response.output_text.trim();
  const texts: string[] = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const message = objectValue(item);
    for (const content of Array.isArray(message?.content) ? message.content : []) {
      const part = objectValue(content);
      if (part?.type === "output_text" && typeof part.text === "string") texts.push(part.text);
    }
  }
  return texts.join("\n").trim() || undefined;
}

const INSTRUCTIONS = `Escreva uma sugestao de resposta academica para o estudante revisar e adaptar antes de entregar.

Perfil do estudante: aluno brasileiro de Sistemas de Informacao, no 7o periodo. Escreva em portugues do Brasil, com uma voz humana, natural e clara. Use menos jargao e menos linguagem excessivamente tecnica. Nao diga que voce e uma IA e nao use frases artificiais ou genericas.

Responda diretamente a tudo o que o enunciado pede. Quando houver varias perguntas, organize a resposta acompanhando a ordem delas. Em pesquisas, use fontes confiaveis e inclua ao final uma pequena lista de referencias com links. Nao invente fatos, leituras, citacoes, anexos ou resultados.

Se o enunciado depender de um anexo que nao foi fornecido ou nao puder ser aberto, nao tente adivinhar o conteudo. Explique de forma objetiva qual arquivo esta faltando e produza apenas a parte que pode ser respondida com seguranca. A resposta deve soar como um bom rascunho feito pelo proprio estudante, e nao como texto promocional ou enciclopedico.`;

export function createOpenAiAnswerGenerator(
  options: OpenAiAnswerGeneratorOptions,
): AnswerGenerator {
  const fetcher = options.fetcher ?? fetch;

  return async (task) => {
    const files = attachmentUrls(task);
    const prompt = [
      `Disciplina: ${task.course ?? "Nao identificada"}`,
      `Atividade: ${task.title}`,
      `Enunciado:\n${task.description ?? "O calendario nao forneceu um enunciado."}`,
      files.length === 0 && /\banexo\b/i.test(task.description ?? "")
        ? "Aviso: o enunciado menciona anexo, mas o calendario nao forneceu o arquivo."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const content: JsonObject[] = [{ type: "input_text", text: prompt }];
    for (const fileUrl of files) content.push({ type: "input_file", file_url: fileUrl });

    const execute = async (parts: JsonObject[]): Promise<JsonObject> => {
      const response = await fetcher(OPENAI_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          instructions: INSTRUCTIONS,
          input: [{ role: "user", content: parts }],
          tools: [{ type: "web_search" }],
          reasoning: { effort: "medium" },
          text: { verbosity: "medium" },
          max_output_tokens: 4000,
          store: false,
          safety_identifier: "campus-task-sync-user",
        }),
      });
      if (!response.ok) {
        const details = (await response.text()).slice(0, 600);
        throw new Error(`Falha ao gerar sugestao com a OpenAI (HTTP ${response.status}): ${details}`);
      }
      return (await response.json()) as JsonObject;
    };

    let result: JsonObject;
    try {
      result = await execute(content);
    } catch (error) {
      if (files.length === 0) throw error;
      result = await execute([
        {
          type: "input_text",
          text: `${prompt}\n\nAviso: os anexos encontrados nao puderam ser abertos. Nao presuma o conteudo deles.`,
        },
      ]);
    }

    const answer = responseText(result);
    if (!answer) throw new Error("A OpenAI nao retornou texto para a sugestao de resposta.");
    return answer;
  };
}
