import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNewPassword } from './password'
import { generateTempPassword, TEMP_PASSWORD_LENGTH } from './tempPassword'
import { passwordChangeGate, CHANGE_PASSWORD_PATH } from './passwordGate'

// ---------------- contraseña temporal ----------------

test('temporal: longitud por defecto >= 10 y alfabeto sin ambiguos', () => {
  assert.ok(TEMP_PASSWORD_LENGTH >= 10)
  for (let i = 0; i < 200; i++) {
    const pw = generateTempPassword()
    assert.equal(pw.length, TEMP_PASSWORD_LENGTH)
    assert.match(pw, /^[a-km-np-zA-HJ-NP-Z2-9]+$/)
    assert.match(pw, /[a-z]/)
    assert.match(pw, /[A-Z]/)
    assert.match(pw, /[2-9]/)
  }
})

test('temporal: no se repiten', () => {
  const seen = new Set(Array.from({ length: 1000 }, () => generateTempPassword()))
  assert.equal(seen.size, 1000)
})

test('temporal: rechaza menos de 10 caracteres', () => {
  assert.throws(() => generateTempPassword(9))
  assert.equal(generateTempPassword(10).length, 10)
})

// ---------------- validación de la nueva ----------------

test('nueva: mínimo 8', () => {
  assert.equal(validateNewPassword('1234567', '1234567', 'a@b.c'), 'min8')
  assert.equal(validateNewPassword('12345678', '12345678', 'a@b.c'), null)
})

test('nueva: confirmación', () => {
  assert.equal(validateNewPassword('abcdefgh', 'abcdefgH', 'a@b.c'), 'noCoinciden')
})

test('nueva: distinta del correo, sin mayúsculas ni espacios', () => {
  assert.equal(validateNewPassword('Pepe@Fake.local', 'Pepe@Fake.local', 'pepe@fake.local'), 'igualCorreo')
  assert.equal(validateNewPassword('pepe@fake.local2', 'pepe@fake.local2', 'pepe@fake.local'), null)
  assert.equal(validateNewPassword('abcdefgh', 'abcdefgh', null), null)
})

// ---------------- proxy ----------------

const gate = (pathname: string, mustChangePassword = true, isServerAction = false) =>
  passwordChangeGate({ pathname, mustChangePassword, isServerAction })

test('proxy: sin flag no hace nada', () => {
  for (const p of ['/', '/admin', '/lol', CHANGE_PASSWORD_PATH]) {
    assert.equal(gate(p, false), 'pass')
    assert.equal(gate(p, false, true), 'pass')
  }
})

test('proxy: con flag redirige cualquier página de la app', () => {
  for (const p of ['/', '/perfil', '/admin/usuarios', '/lol', '/clasificacion', '/api/export', '/perfil/contrasenas']) {
    assert.equal(gate(p), 'redirect', p)
  }
})

test('proxy: con flag deja la página de cambio, /login y estáticos', () => {
  for (const p of [CHANGE_PASSWORD_PATH, CHANGE_PASSWORD_PATH + '/', '/login', '/_next/static/chunks/a.js',
                   '/favicon.ico', '/manifest.webmanifest', '/robots.txt', '/fonts/x.woff2']) {
    assert.equal(gate(p), 'pass', p)
  }
})

test('proxy: Server Actions con flag solo en la página de cambio', () => {
  assert.equal(gate(CHANGE_PASSWORD_PATH, true, true), 'pass')
  assert.equal(gate('/perfil', true, true), 'block')
  assert.equal(gate('/admin/usuarios', true, true), 'block')
})

test('proxy: /api no se cuela por extensión', () => {
  assert.equal(gate('/api/export/data.json'), 'redirect')
})
