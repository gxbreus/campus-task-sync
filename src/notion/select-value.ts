/**
 * O Notion rejeita virgulas em nomes de opcoes de select/multi-select.
 * Mantemos o texto legivel usando um separador visual equivalente.
 */
export function notionSelectValue(value: string): string {
  return value.replace(/\s*,\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
}

