import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { checkTeamLogo, teamLogoObjectName, teamTextColor, TEAM_LOGO_MAX_BYTES, TEAM_LOGO_URL_RE } from './teamLogo'

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

// Archivos reales de 1×1.
const PNG_1X1 = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
const WEBP_LOSSLESS_1X1 = b64('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')
const WEBP_LOSSY_1X1 = b64('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA')

/** Cabecera PNG con IHDR de las dimensiones pedidas (el resto da igual para la validación). */
function pngHeader(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

/** WebP extendido (VP8X) con el lienzo pedido. */
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30)
  b.set(new TextEncoder().encode('RIFF'), 0)
  b.set(new TextEncoder().encode('WEBPVP8X'), 8)
  const w = width - 1
  const h = height - 1
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24)
  return b
}

test('logo: PNG real', () => {
  assert.deepEqual(checkTeamLogo(PNG_1X1), { ok: true, format: 'png', contentType: 'image/png', width: 1, height: 1 })
})

test('logo: WebP real sin pérdida (VP8L) y con pérdida (VP8)', () => {
  assert.deepEqual(checkTeamLogo(WEBP_LOSSLESS_1X1), { ok: true, format: 'webp', contentType: 'image/webp', width: 1, height: 1 })
  assert.deepEqual(checkTeamLogo(WEBP_LOSSY_1X1), { ok: true, format: 'webp', contentType: 'image/webp', width: 1, height: 1 })
})

test('logo: WebP extendido (VP8X) lee el lienzo', () => {
  assert.deepEqual(checkTeamLogo(webpVp8x(512, 300)), { ok: true, format: 'webp', contentType: 'image/webp', width: 512, height: 300 })
})

test('logo: SVG fuera aunque se llame .png', () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  assert.deepEqual(checkTeamLogo(svg), { ok: false, code: 'TYPE' })
})

test('logo: JPEG, GIF y texto fuera', () => {
  assert.equal(checkTeamLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])).ok, false)
  assert.equal(checkTeamLogo(new TextEncoder().encode('GIF89a......')).ok, false)
  assert.deepEqual(checkTeamLogo(new TextEncoder().encode('hola, soy un png')), { ok: false, code: 'TYPE' })
})

test('logo: vacío y demasiado grande', () => {
  assert.deepEqual(checkTeamLogo(new Uint8Array()), { ok: false, code: 'EMPTY' })
  const big = new Uint8Array(TEAM_LOGO_MAX_BYTES + 1)
  big.set(pngHeader(10, 10))
  assert.deepEqual(checkTeamLogo(big), { ok: false, code: 'TOO_BIG' })
  const justFits = new Uint8Array(TEAM_LOGO_MAX_BYTES)
  justFits.set(pngHeader(10, 10))
  assert.equal(checkTeamLogo(justFits).ok, true)
})

test('logo: dimensiones máximas de entrada 4096×4096', () => {
  assert.equal(checkTeamLogo(pngHeader(4096, 4096)).ok, true)
  assert.deepEqual(checkTeamLogo(pngHeader(4097, 200)), { ok: false, code: 'DIMENSIONS', width: 4097, height: 200 })
  assert.deepEqual(checkTeamLogo(pngHeader(200, 40000)), { ok: false, code: 'DIMENSIONS', width: 200, height: 40000 })
  assert.deepEqual(checkTeamLogo(webpVp8x(8192, 8192)), { ok: false, code: 'DIMENSIONS', width: 8192, height: 8192 })
})

test('logo: firma buena pero cabecera rota o cortada', () => {
  assert.deepEqual(checkTeamLogo(PNG_1X1.slice(0, 12)), { ok: false, code: 'CORRUPT' })
  assert.deepEqual(checkTeamLogo(pngHeader(0, 10)), { ok: false, code: 'CORRUPT' })
  const riffNoChunk = new Uint8Array(30)
  riffNoChunk.set(new TextEncoder().encode('RIFF\0\0\0\0WEBPXXXX'))
  assert.deepEqual(checkTeamLogo(riffNoChunk), { ok: false, code: 'CORRUPT' })
})

test('logo: nombre = 16 hex del sha256 + extensión, y casa con el CHECK de la BD', () => {
  const hex = createHash('sha256').update(PNG_1X1).digest('hex')
  const name = teamLogoObjectName(hex, 'png')
  assert.match(name, /^[0-9a-f]{16}\.png$/)
  assert.equal(name, `${hex.slice(0, 16)}.png`)
  assert.equal(teamLogoObjectName(hex.toUpperCase(), 'webp'), `${hex.slice(0, 16)}.webp`)
  assert.match(`https://abc.supabase.co/storage/v1/object/public/team-logos/${name}`, TEAM_LOGO_URL_RE)
  assert.doesNotMatch(`https://abc.supabase.co/storage/v1/object/public/otro/${name}`, TEAM_LOGO_URL_RE)
  assert.doesNotMatch('https://abc.supabase.co/storage/v1/object/public/team-logos/x.svg', TEAM_LOGO_URL_RE)
})

test('logo: texto de las siglas legible sobre el color del equipo', () => {
  assert.equal(teamTextColor('#000000'), '#ffffff')
  assert.equal(teamTextColor('#1d4ed8'), '#ffffff')
  assert.equal(teamTextColor('#ffffff'), '#000000')
  assert.equal(teamTextColor('#facc15'), '#000000')
  assert.equal(teamTextColor('rojo'), '#ffffff')
})
