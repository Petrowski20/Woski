import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialScrollBlocked, pickScrollTarget, type InitialScrollEnv } from './scrollTarget'

const s = (id: number, date: string, status: string) => ({ id, date, status })

test('lista vacía: no se desplaza', () => {
  assert.equal(pickScrollTarget([]), null)
})

test('orden cronológico entre fases aunque la lista venga desordenada', () => {
  // Fase 2 primero en la lista, pero la fase 1 tiene una serie más temprana pendiente.
  const items = [
    s(20, '2026-10-20T10:00:00Z', 'PENDING'),   // fase 2
    s(10, '2026-10-10T10:00:00Z', 'FINISHED'),  // fase 1
    s(11, '2026-10-11T10:00:00Z', 'PENDING'),   // fase 1
  ]
  assert.equal(pickScrollTarget(items), 11)
})

test('terminadas y canceladas no cuentan; la siguiente pendiente sí', () => {
  const items = [
    s(1, '2026-10-01T10:00:00Z', 'FINISHED'),
    s(2, '2026-10-01T13:00:00Z', 'CANCELLED'),
    s(3, '2026-10-02T10:00:00Z', 'PENDING'),
  ]
  assert.equal(pickScrollTarget(items), 3)
})

test('una serie en curso es el destino aunque haya pendientes después', () => {
  const items = [
    s(1, '2026-10-01T10:00:00Z', 'FINISHED'),
    s(2, '2026-10-01T13:00:00Z', 'IN_PROGRESS'),
    s(3, '2026-10-01T16:00:00Z', 'PENDING'),
  ]
  assert.equal(pickScrollTarget(items), 2)
})

test('empezada sin resultado (PENDING con hora pasada, resultado nulo) cuenta', () => {
  const items = [
    s(1, '2020-01-01T10:00:00Z', 'FINISHED'),
    { ...s(2, '2020-01-01T13:00:00Z', 'PENDING'), result: null },
  ]
  assert.equal(pickScrollTarget(items), 2)
})

test('empate de hora: el de menor id, como (match_date, id) en la BD', () => {
  const items = [
    s(9, '2026-10-05T10:00:00Z', 'PENDING'),
    s(4, '2026-10-05T10:00:00Z', 'PENDING'),
    s(7, '2026-10-05T12:00:00+02:00', 'PENDING'), // misma hora en otra zona
  ]
  assert.equal(pickScrollTarget(items), 4)
})

test('todas terminadas: la última terminada; con canceladas al final, la última terminada', () => {
  const items = [
    s(1, '2026-10-01T10:00:00Z', 'FINISHED'),
    s(2, '2026-10-03T10:00:00Z', 'FINISHED'),
    s(3, '2026-10-04T10:00:00Z', 'CANCELLED'),
    s(4, '2026-10-02T10:00:00Z', 'FINISHED'),
  ]
  assert.equal(pickScrollTarget(items), 2)
})

test('solo canceladas: no se desplaza', () => {
  assert.equal(pickScrollTarget([s(1, '2026-10-01T10:00:00Z', 'CANCELLED')]), null)
})

const env: InitialScrollEnv = { hash: '', firstLoad: true, navigationType: 'navigate', msSincePopState: Infinity, scrollY: 0 }

test('initialScrollBlocked: carga normal arriba del todo → se desplaza', () => {
  assert.equal(initialScrollBlocked(env), false)
  assert.equal(initialScrollBlocked({ ...env, hash: '#' }), false)
})

test('initialScrollBlocked: hash, atrás/adelante, posición restaurada', () => {
  assert.equal(initialScrollBlocked({ ...env, hash: '#serie-12' }), true)
  assert.equal(initialScrollBlocked({ ...env, navigationType: 'back_forward' }), true)
  assert.equal(initialScrollBlocked({ ...env, navigationType: 'reload', scrollY: 800 }), true)
  assert.equal(initialScrollBlocked({ ...env, firstLoad: false, msSincePopState: 200 }), true)
})

test('initialScrollBlocked: navegación dentro de la app ignora el scroll heredado', () => {
  assert.equal(initialScrollBlocked({ ...env, firstLoad: false, navigationType: 'back_forward', scrollY: 300 }), false)
})
