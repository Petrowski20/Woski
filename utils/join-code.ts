// Mismo mecanismo que los códigos de /ligas (app/(main)/ligas/actions.ts):
// 6 caracteres sin ambigüedad visual (sin 0/O, 1/I, 8/B).
const CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXYZ2345679'
const CODE_LENGTH = 6

export function generateJoinCode(length = CODE_LENGTH): string {
  return Array.from(
    { length },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('')
}

/** Normaliza lo que teclea el usuario; null si no puede ser un código válido. */
export function normalizeJoinCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null
}
