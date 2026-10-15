import sharp from 'sharp'
import {
  checkTeamLogo,
  TEAM_LOGO_MARGIN,
  TEAM_LOGO_MAX_SIDE,
  TEAM_LOGO_SIZE,
  type TeamLogoErrorCode,
} from './teamLogo'

// Procesado de logos de equipo en el servidor (sharp/libvips). Nunca se
// guarda el archivo que sube el admin: se valida la firma (checkTeamLogo),
// se recortan los bordes transparentes, se escala sin deformar para que
// quepa en TEAM_LOGO_SIZE con un margen uniforme y se centra en un lienzo
// cuadrado transparente. La salida es un PNG nuevo, sin metadatos (sharp no
// copia EXIF/ICC/XMP salvo que se pida), así que logos con márgenes
// distintos acaban con un tamaño visual parecido.
//
// Solo servidor: importa sharp (binario nativo). No usar en componentes.

/** Alfa hasta este valor (de 255) cuenta como transparente al recortar. */
const ALPHA_THRESHOLD = 8

/** Lado útil dentro del lienzo: 256 − 2 × 6 % ≈ 225 px. */
export const TEAM_LOGO_INNER = Math.round(TEAM_LOGO_SIZE * (1 - 2 * TEAM_LOGO_MARGIN))

export type ProcessedTeamLogo =
  | {
      ok: true
      bytes: Uint8Array
      format: 'png'
      contentType: 'image/png'
      /** Dimensiones del archivo original. */
      source: { width: number; height: number }
      /** Caja del logo tras recortar los bordes transparentes (en el original). */
      trimmed: { width: number; height: number }
    }
  | { ok: false; code: TeamLogoErrorCode; width?: number; height?: number }

const decodeOptions = {
  // Segunda barrera contra bombas de descompresión (la primera es la cabecera).
  limitInputPixels: TEAM_LOGO_MAX_SIDE * TEAM_LOGO_MAX_SIDE,
  // Solo el primer fotograma de un WebP animado.
  pages: 1,
} as const

/** Caja mínima con alfa > umbral, o null si toda la imagen es transparente. */
function alphaBox(rgba: Buffer, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return null
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

export async function processTeamLogo(input: Uint8Array): Promise<ProcessedTeamLogo> {
  const check = checkTeamLogo(input)
  if (!check.ok) return check

  let raw: { data: Buffer; info: sharp.OutputInfo }
  try {
    raw = await sharp(input, decodeOptions).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  } catch (e) {
    // La cabecera puede mentir: libvips vuelve a comprobar los píxeles reales.
    if (e instanceof Error && /pixel limit/i.test(e.message)) {
      return { ok: false, code: 'DIMENSIONS', width: check.width, height: check.height }
    }
    return { ok: false, code: 'CORRUPT' }
  }

  const { data, info } = raw
  if (info.channels !== 4) return { ok: false, code: 'CORRUPT' }
  const box = alphaBox(data, info.width, info.height)
  if (!box) return { ok: false, code: 'BLANK' }

  const scale = Math.min(TEAM_LOGO_INNER / box.width, TEAM_LOGO_INNER / box.height)
  const width = Math.max(1, Math.round(box.width * scale))
  const height = Math.max(1, Math.round(box.height * scale))

  const logo = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer()

  const out = await sharp({
    create: { width: TEAM_LOGO_SIZE, height: TEAM_LOGO_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: logo,
      left: Math.floor((TEAM_LOGO_SIZE - width) / 2),
      top: Math.floor((TEAM_LOGO_SIZE - height) / 2),
    }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()

  return {
    ok: true,
    bytes: new Uint8Array(out),
    format: 'png',
    contentType: 'image/png',
    source: { width: info.width, height: info.height },
    trimmed: { width: box.width, height: box.height },
  }
}
