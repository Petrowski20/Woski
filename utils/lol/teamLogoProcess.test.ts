import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { processTeamLogo, TEAM_LOGO_INNER } from './teamLogoProcess'
import { checkTeamLogo, TEAM_LOGO_MAX_BYTES, TEAM_LOGO_SIZE } from './teamLogo'

// Imágenes de prueba generadas al vuelo: un SVG rasterizado por sharp y
// guardado como PNG/WebP real (el SVG nunca llega a processTeamLogo).

/** Lienzo w×h transparente con un círculo blanco opaco en (cx, cy) de radio r. */
async function circle(w: number, h: number, cx: number, cy: number, r: number, format: 'png' | 'webp' = 'png') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/></svg>`
  const img = sharp(Buffer.from(svg))
  return new Uint8Array(await (format === 'png' ? img.png() : img.webp({ lossless: true })).toBuffer())
}

/** Rectángulo opaco de w×h (sin transparencia). */
async function solid(w: number, h: number, color = '#ff0000') {
  return new Uint8Array(await sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer())
}

/** Caja del contenido visible (alfa > 8) del PNG de salida. */
async function visibleBox(png: Uint8Array) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width, top = info.height, right = -1, bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1, canvas: { w: info.width, h: info.height } }
}

async function ok(input: Uint8Array) {
  const res = await processTeamLogo(input)
  assert.ok(res.ok, `se esperaba ok y llegó ${JSON.stringify(res)}`)
  return res
}

const near = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} no está a ±${tol} de ${b}`)

test('procesado: salida PNG cuadrada de 256×256 y válida para el bucket', async () => {
  const res = await ok(await circle(300, 300, 150, 150, 100))
  const meta = await sharp(res.bytes).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.width, TEAM_LOGO_SIZE)
  assert.equal(meta.height, TEAM_LOGO_SIZE)
  assert.equal(meta.hasAlpha, true)
  // La salida pasa la misma validación que la entrada.
  assert.equal(checkTeamLogo(res.bytes).ok, true)
  // Holgada por debajo del límite del bucket (512 KB).
  assert.ok(res.bytes.length < 512 * 1024)
})

test('procesado: mucho margen → se recorta y ocupa el lado útil, centrado', async () => {
  const res = await ok(await circle(1000, 1000, 500, 500, 100))
  assert.deepEqual(res.source, { width: 1000, height: 1000 })
  near(res.trimmed.width, 200, 2, 'recorte')
  const box = await visibleBox(res.bytes)
  near(box.width, TEAM_LOGO_INNER, 2, 'ancho')
  near(box.height, TEAM_LOGO_INNER, 2, 'alto')
  const margin = (TEAM_LOGO_SIZE - TEAM_LOGO_INNER) / 2
  near(box.left, margin, 2, 'margen izquierdo')
  near(box.top, margin, 2, 'margen superior')
})

test('procesado: sin margen → se reduce al lado útil', async () => {
  const res = await ok(await circle(600, 600, 300, 300, 300))
  const box = await visibleBox(res.bytes)
  near(box.width, TEAM_LOGO_INNER, 2)
  near(box.height, TEAM_LOGO_INNER, 2)
})

test('procesado: dos logos con márgenes distintos quedan con un tamaño visual parecido', async () => {
  const lots = await visibleBox((await ok(await circle(800, 800, 400, 400, 80))).bytes)
  const none = await visibleBox((await ok(await circle(200, 200, 100, 100, 100))).bytes)
  const offCenter = await visibleBox((await ok(await circle(500, 300, 90, 210, 60))).bytes)
  for (const b of [none, offCenter]) {
    near(b.width, lots.width, 3, 'ancho')
    near(b.height, lots.height, 3, 'alto')
    near(b.left, lots.left, 2, 'x')
    near(b.top, lots.top, 2, 'y')
  }
})

test('procesado: no cuadrada → sin deformar, el lado largo al lado útil y centrada', async () => {
  const res = await ok(await solid(400, 100))
  const box = await visibleBox(res.bytes)
  assert.deepEqual(box.canvas, { w: TEAM_LOGO_SIZE, h: TEAM_LOGO_SIZE })
  near(box.width, TEAM_LOGO_INNER, 1, 'ancho')
  near(box.height, Math.round(TEAM_LOGO_INNER / 4), 1, 'alto (proporción 4:1)')
  near(box.top, (TEAM_LOGO_SIZE - box.height) / 2, 1, 'centrado vertical')
})

test('procesado: imagen opaca sin transparencia no se recorta', async () => {
  const res = await ok(await solid(300, 200, '#ffffff'))
  assert.deepEqual(res.trimmed, { width: 300, height: 200 })
  const box = await visibleBox(res.bytes)
  near(box.width, TEAM_LOGO_INNER, 1)
  near(box.height, Math.round(TEAM_LOGO_INNER * 2 / 3), 1)
})

test('procesado: muy pequeña (8×8) → se amplía al lado útil', async () => {
  const res = await ok(await solid(8, 8))
  const box = await visibleBox(res.bytes)
  near(box.width, TEAM_LOGO_INNER, 1)
  near(box.height, TEAM_LOGO_INNER, 1)
})

test('procesado: WebP de entrada → PNG de salida', async () => {
  const input = await circle(400, 400, 200, 200, 150, 'webp')
  assert.equal(checkTeamLogo(input).ok && checkTeamLogo(input).format, 'webp')
  const res = await ok(input)
  assert.equal((await sharp(res.bytes).metadata()).format, 'png')
  near((await visibleBox(res.bytes)).width, TEAM_LOGO_INNER, 2)
})

test('procesado: sin metadatos (EXIF, ICC, XMP)', async () => {
  const input = new Uint8Array(await sharp(await circle(300, 300, 150, 150, 120))
    .withExif({ IFD0: { Copyright: 'secreto', Artist: 'nadie' } })
    .withIccProfile('p3')
    .png()
    .toBuffer())
  const inMeta = await sharp(input).metadata()
  assert.ok(inMeta.exif && inMeta.icc, 'la entrada de prueba debe llevar EXIF e ICC')
  const meta = await sharp((await ok(input)).bytes).metadata()
  assert.equal(meta.exif, undefined)
  assert.equal(meta.icc, undefined)
  assert.equal(meta.xmp, undefined)
})

test('procesado: misma entrada → mismos bytes (el nombre por hash es estable)', async () => {
  const input = await circle(500, 300, 250, 150, 120)
  const a = await ok(input)
  const b = await ok(input)
  assert.deepEqual(Buffer.from(a.bytes), Buffer.from(b.bytes))
})

test('procesado: SVG renombrado a .png → TYPE', async () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
  assert.deepEqual(await processTeamLogo(svg), { ok: false, code: 'TYPE' })
})

test('procesado: archivo corrupto (cabecera PNG válida, datos basura) → CORRUPT', async () => {
  const good = await circle(64, 64, 32, 32, 20)
  const broken = new Uint8Array(good.length)
  broken.set(good.slice(0, 33)) // firma + IHDR intactos
  broken.fill(0xab, 33)
  assert.deepEqual(await processTeamLogo(broken), { ok: false, code: 'CORRUPT' })
  // Truncado a la mitad.
  assert.deepEqual(await processTeamLogo(good.slice(0, Math.floor(good.length / 2))), { ok: false, code: 'CORRUPT' })
})

test('procesado: imagen enorme → DIMENSIONS sin decodificarla', async () => {
  // PNG real de 5000×1 (pocos bytes, muchos píxeles a lo ancho).
  const wide = await solid(5000, 1)
  assert.deepEqual(await processTeamLogo(wide), { ok: false, code: 'DIMENSIONS', width: 5000, height: 1 })
  // Solo la cabecera de un 20000×20000: se rechaza antes de llegar a libvips.
  const header = new Uint8Array(await solid(1, 1))
  new DataView(header.buffer).setUint32(16, 20000)
  new DataView(header.buffer).setUint32(20, 20000)
  assert.deepEqual(await processTeamLogo(header), { ok: false, code: 'DIMENSIONS', width: 20000, height: 20000 })
})

test('procesado: más de 2 MB → TOO_BIG', async () => {
  const big = new Uint8Array(TEAM_LOGO_MAX_BYTES + 1)
  big.set(await solid(1, 1))
  assert.deepEqual(await processTeamLogo(big), { ok: false, code: 'TOO_BIG' })
})

test('procesado: totalmente transparente → BLANK', async () => {
  const blank = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer())
  assert.deepEqual(await processTeamLogo(blank), { ok: false, code: 'BLANK' })
})
