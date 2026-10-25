// Validación de logos de equipo (bucket team-logos). Lee la firma real del
// archivo (magic bytes) y las dimensiones de la cabecera: no se fía de la
// extensión ni del content-type. Sin dependencias de Node ni de Next: la usa
// el servidor antes de subir y el navegador para avisar antes de enviar.

export const TEAM_LOGO_BUCKET = 'team-logos'
export const TEAM_LOGO_MAX_BYTES = 512 * 1024
export const TEAM_LOGO_MAX_SIDE = 512

export type TeamLogoFormat = 'png' | 'webp'
export type TeamLogoErrorCode = 'EMPTY' | 'TOO_BIG' | 'TYPE' | 'CORRUPT' | 'DIMENSIONS'

export type TeamLogoCheck =
  | { ok: true; format: TeamLogoFormat; contentType: `image/${TeamLogoFormat}`; width: number; height: number }
  | { ok: false; code: TeamLogoErrorCode; width?: number; height?: number }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = ''
  for (let i = at; i < at + len && i < b.length; i++) s += String.fromCharCode(b[i])
  return s
}

const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8)
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v)
}

function isWebp(b: Uint8Array): boolean {
  return b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP'
}

/** Ancho y alto de la cabecera IHDR (primer chunk obligatorio). */
function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

/** Ancho y alto del primer chunk de WebP: VP8 (con pérdida), VP8L (sin pérdida) o VP8X (extendido). */
function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null
  const chunk = ascii(b, 12, 4)
  const data = 20
  if (chunk === 'VP8 ') {
    if (b[data + 3] !== 0x9d || b[data + 4] !== 0x01 || b[data + 5] !== 0x2a) return null
    return { width: u16le(b, data + 6) & 0x3fff, height: u16le(b, data + 8) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (b[data] !== 0x2f) return null
    const bits = u32le(b, data + 1)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    return { width: u24le(b, data + 4) + 1, height: u24le(b, data + 7) + 1 }
  }
  return null
}

/** Comprueba tamaño, tipo real (PNG o WebP; SVG y el resto fuera) y dimensiones. */
export function checkTeamLogo(bytes: Uint8Array): TeamLogoCheck {
  if (bytes.length === 0) return { ok: false, code: 'EMPTY' }
  if (bytes.length > TEAM_LOGO_MAX_BYTES) return { ok: false, code: 'TOO_BIG' }

  const format: TeamLogoFormat | null = isPng(bytes) ? 'png' : isWebp(bytes) ? 'webp' : null
  if (!format) return { ok: false, code: 'TYPE' }

  const size = format === 'png' ? pngSize(bytes) : webpSize(bytes)
  if (!size || size.width < 1 || size.height < 1) return { ok: false, code: 'CORRUPT' }
  if (size.width > TEAM_LOGO_MAX_SIDE || size.height > TEAM_LOGO_MAX_SIDE) {
    return { ok: false, code: 'DIMENSIONS', ...size }
  }
  return { ok: true, format, contentType: `image/${format}`, ...size }
}

/** Nombre del archivo en el bucket: 16 hex del sha256 del contenido + extensión. */
export function teamLogoObjectName(sha256Hex: string, format: TeamLogoFormat): string {
  return `${sha256Hex.slice(0, 16).toLowerCase()}.${format}`
}

/** Mismo patrón que el CHECK de teams.logo_url. */
export const TEAM_LOGO_URL_RE = /^https?:\/\/[^/?#]+\/storage\/v1\/object\/public\/team-logos\/[0-9a-f]{16}\.(png|webp)$/

/** Color de texto legible sobre el color del equipo ('#rrggbb'): negro o blanco según la luminancia (WCAG). */
export function teamTextColor(hex: string): '#000000' | '#ffffff' {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = m.slice(1).map(h => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contraste con blanco (1.05 / (L + 0.05)) frente a con negro ((L + 0.05) / 0.05).
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#000000'
}

/**
 * Cómo se pinta el logo (teams.logo_mode):
 * - color: la imagen tal cual.
 * - mono: una sola tinta sobre transparente; se usa su alfa como máscara y
 *   se pinta con el color de texto del tema.
 * - plate: sobre una placa oscura fija (logos blancos con algún detalle de
 *   color, que en modo claro no se verían).
 */
export type TeamLogoMode = 'color' | 'mono' | 'plate'
export const TEAM_LOGO_MODES: readonly TeamLogoMode[] = ['color', 'mono', 'plate']

export const isTeamLogoMode = (v: unknown): v is TeamLogoMode =>
  typeof v === 'string' && (TEAM_LOGO_MODES as readonly string[]).includes(v)

/**
 * Propone el modo a partir de los píxeles RGBA (getImageData). Solo cuentan
 * los casi opacos (alfa ≥ 200); los bordes suavizados no deciden nada.
 * - mono: < 3 % de píxeles con color (max−min de RGB > 40) y luminancia
 *   casi uniforme (desviación < 30). Así un logo blanco y negro (G2, EDG)
 *   no pasa por monocromo: con máscara quedaría como una mancha.
 * - plate: al menos la mitad de píxeles blancos y < 10 % oscuros: sin un
 *   contorno oscuro, en modo claro se pierde.
 * Umbrales ajustados con 251 logos de equipos y ligas.
 */
export function suggestTeamLogoMode(rgba: ArrayLike<number>): TeamLogoMode {
  let n = 0, chroma = 0, white = 0, dark = 0, sum = 0, sum2 = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 200) continue
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const c = Math.max(r, g, b) - Math.min(r, g, b)
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    n++
    sum += l
    sum2 += l * l
    if (c > 40) chroma++
    else if (l >= 215) white++
    if (l < 60) dark++
  }
  if (n === 0) return 'color'
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean))
  if (chroma / n < 0.03 && sd < 30) return 'mono'
  if (white / n >= 0.5 && dark / n < 0.1) return 'plate'
  return 'color'
}
