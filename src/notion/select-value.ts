/**
 * O Notion rejeita virgulas em nomes de opcoes de select/multi-select.
 * Mantemos o texto legivel usando um separador visual equivalente.
 */
export function notionSelectValue(value: string): string {
  const normalized = value.replace(/\s*,\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
  if (normalized.length <= 100) return normalized;
  let hash = 2_166_136_261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const suffix = (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
  return `${normalized.slice(0, 90).trimEnd()} · ${suffix}`;
}
