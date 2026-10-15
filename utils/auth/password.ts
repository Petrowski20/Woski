import { randomInt } from 'node:crypto'

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALL = LOWER + UPPER + DIGITS

export const TEMP_PASSWORD_LENGTH = 14
export const MIN_PASSWORD_LENGTH = 8

/** Contraseña temporal con aleatoriedad criptográfica (crypto.randomInt). */
export function generateTempPassword(length = TEMP_PASSWORD_LENGTH): string {
  if (length < 10) throw new Error('La contraseña temporal debe tener al menos 10 caracteres')

  // Al menos una minúscula, una mayúscula y un dígito; el resto de todo el alfabeto.
  const chars = [
    LOWER[randomInt(LOWER.length)],
    UPPER[randomInt(UPPER.length)],
    DIGITS[randomInt(DIGITS.length)],
  ]
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)])

  // Fisher-Yates para que las tres obligatorias no queden siempre al principio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export type PasswordError = 'min8' | 'noCoinciden' | 'igualCorreo'

/**
 * Reglas propias de la app para la contraseña nueva. Que sea distinta de
 * la actual lo comprueba Supabase Auth (error same_password).
 */
export function validateNewPassword(
  password: string,
  confirm: string,
  email: string | null | undefined,
): PasswordError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'min8'
  if (password !== confirm) return 'noCoinciden'
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'igualCorreo'
  return null
}
