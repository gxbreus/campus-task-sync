const COURSE_NAMES: Record<string, string> = {
  GCC128: "Inteligência Artificial",
  GCC220: "Metodologia de Pesquisa",
};

export function courseNameFromCode(code: string): string {
  return COURSE_NAMES[code] ?? code;
}
