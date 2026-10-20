import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  originHref,
  parseId,
  parseProfileFrom,
  pickProfileEdition,
  pickProfilePhase,
  profileHref,
  resolveProfileSport,
} from './profileContext'

test('parseProfileFrom: solo la lista cerrada', () => {
  assert.deepEqual(parseProfileFrom('lol-clasificacion'),
    { key: 'lol-clasificacion', href: '/lol/clasificacion', label: 'Clasificación', sport: 'lol' })
  assert.equal(parseProfileFrom('clasificacion')?.sport, 'futbol')
  assert.equal(parseProfileFrom('premios')?.href, '/premios')
  assert.equal(parseProfileFrom(['lol-inicio', 'premios'])?.href, '/', 'si se repite, vale el primero')
})

test('parseProfileFrom: nada de URLs ni rutas libres (sin redirección abierta)', () => {
  for (const bad of ['https://evil.com', '//evil.com', '/lol/clasificacion', 'javascript:alert(1)', '../admin',
                     'lol-clasificacion?x=1', 'LOL-CLASIFICACION', '', 'constructor', '__proto__', 'toString']) {
    assert.equal(parseProfileFrom(bad), null, bad)
  }
  assert.equal(parseProfileFrom(undefined), null)
  assert.equal(parseProfileFrom(42), null)
})

test('parseProfileFrom: club-<id> numérico', () => {
  assert.deepEqual(parseProfileFrom('club-12'), { key: 'club-12', href: '/clubes/12', label: 'Club', sport: 'lol' })
  for (const bad of ['club-0', 'club-012', 'club-', 'club-1a', 'club-12/../../x', 'club-1234567890']) {
    assert.equal(parseProfileFrom(bad), null, bad)
  }
})

test('originHref: la clasificación de LoL conserva la edición', () => {
  assert.equal(originHref(parseProfileFrom('lol-clasificacion')!, 3), '/lol/clasificacion?edicion=3')
  assert.equal(originHref(parseProfileFrom('lol-clasificacion')!, null), '/lol/clasificacion')
  assert.equal(originHref(parseProfileFrom('clasificacion')!, 3), '/clasificacion')
})

test('resolveProfileSport: ?deporte, luego el origen, luego LoL', () => {
  assert.equal(resolveProfileSport('futbol', parseProfileFrom('lol-clasificacion')), 'futbol')
  assert.equal(resolveProfileSport(undefined, parseProfileFrom('clasificacion')), 'futbol')
  assert.equal(resolveProfileSport(undefined, parseProfileFrom('club-3')), 'lol')
  assert.equal(resolveProfileSport('tenis', null), 'lol')
  assert.equal(resolveProfileSport(undefined, null), 'lol')
})

test('parseId: enteros positivos', () => {
  assert.equal(parseId('3'), 3)
  assert.equal(parseId(['7']), 7)
  for (const bad of ['0', '-1', '1.5', 'abc', '', undefined, '01', '9999999999']) assert.equal(parseId(bad), null, String(bad))
})

test('profileHref: perfil con origen y edición', () => {
  assert.equal(profileHref('abc', 'lol-clasificacion', 3), '/jugador/abc?from=lol-clasificacion&edicion=3')
  assert.equal(profileHref('abc', 'clasificacion'), '/jugador/abc?from=clasificacion')
})

test('pickProfileEdition: pedida si la jugó, si no la activa más reciente, si no la más reciente', () => {
  const eds = [
    { id: 1, startDate: '2026-05-01', active: false },
    { id: 3, startDate: '2026-09-20', active: true },
    { id: 2, startDate: '2026-08-01', active: true },
  ]
  assert.equal(pickProfileEdition(eds, 1), 1)
  assert.equal(pickProfileEdition(eds, 9), 3, 'una edición que no jugó no vale')
  assert.equal(pickProfileEdition(eds, null), 3)
  assert.equal(pickProfileEdition(eds.map(e => ({ ...e, active: false })), null), 3)
  assert.equal(pickProfileEdition([{ id: 5, startDate: null, active: false }], null), 5)
  assert.equal(pickProfileEdition([], 1), null)
})

test('pickProfilePhase: solo fases de la lista', () => {
  assert.equal(pickProfilePhase([10, 11], 11), 11)
  assert.equal(pickProfilePhase([10, 11], 12), null)
  assert.equal(pickProfilePhase([10, 11], null), null)
})
