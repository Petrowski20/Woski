import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSeed, isSwissPhase, swissInfo, type SwissSeries } from './swiss'

test('isSwissPhase: por el nombre de la fase', () => {
  for (const n of ['Swiss Stage', 'swiss', 'Fase suiza', 'Suizo', 'Worlds Swiss Stage R1']) assert.equal(isSwissPhase(n), true, n)
  for (const n of ['Play-In', 'Knockout', 'Grupos', 'Switzerland', 'Suizos-like']) assert.equal(isSwissPhase(n), false, n)
})

// Serie terminada: ganador primero.
let next = 1
const won = (home: number, away: number, day: number, homeWins = true): SwissSeries => ({
  id: next++, date: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, status: 'FINISHED', homeId: home, awayId: away,
  result: homeWins ? { home: 1, away: 0 } : { home: 0, away: 1 },
})
const pending = (home: number, away: number, day: number): SwissSeries => ({
  id: next++, date: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, status: 'PENDING', homeId: home, awayId: away, result: null,
})

test('swissInfo: rondas y balance de un suizo de 8 equipos (A gana todo, H pierde todo)', () => {
  next = 1
  // Ronda 1 (0-0): A-B, C-D, E-F, G-H → ganan A, C, E, G
  const r1 = [won(1, 2, 1), won(3, 4, 1), won(5, 6, 1), won(7, 8, 1)]
  // Ronda 2: 1-0: A-C, E-G (ganan A, E) · 0-1: B-D, F-H (ganan B, F)
  const r2 = [won(1, 3, 2), won(5, 7, 2), won(2, 4, 2), won(6, 8, 2)]
  // Ronda 3: 2-0: A-E (A) · 1-1: C-B, G-F · 0-2: D-H (D)
  const r3 = [won(1, 5, 3), won(3, 2, 3), won(7, 6, 3), won(4, 8, 3)]
  // Ronda 4 pendiente: 2-1 E vs C · 1-2 B vs D
  const r4 = [pending(5, 3, 4), pending(2, 4, 4)]
  const info = swissInfo([...r4, ...r3, ...r1, ...r2])  // desordenadas a propósito

  assert.deepEqual(info.get(r1[0].id), { round: 1, record: { wins: 0, losses: 0 }, stakes: null })
  assert.deepEqual(info.get(r2[0].id), { round: 2, record: { wins: 1, losses: 0 }, stakes: null })
  assert.deepEqual(info.get(r2[2].id), { round: 2, record: { wins: 0, losses: 1 }, stakes: null })
  assert.deepEqual(info.get(r3[0].id), { round: 3, record: { wins: 2, losses: 0 }, stakes: 'qualify' })
  assert.deepEqual(info.get(r3[1].id), { round: 3, record: { wins: 1, losses: 1 }, stakes: null })
  assert.deepEqual(info.get(r3[3].id), { round: 3, record: { wins: 0, losses: 2 }, stakes: 'eliminate' })
  assert.deepEqual(info.get(r4[0].id), { round: 4, record: { wins: 2, losses: 1 }, stakes: 'qualify' })
  assert.deepEqual(info.get(r4[1].id), { round: 4, record: { wins: 1, losses: 2 }, stakes: 'eliminate' })
})

test('swissInfo: 2-2 es decisivo', () => {
  next = 100
  // X: gana, pierde, gana, pierde · Y: pierde, gana, pierde, gana (rivales de relleno)
  const s = [won(1, 10, 1), won(2, 11, 1, false), won(12, 1, 2), won(2, 13, 2), won(1, 14, 3), won(15, 2, 3),
             won(16, 1, 4), won(2, 17, 4), pending(1, 2, 5)]
  const info = swissInfo(s)
  assert.deepEqual(info.get(s[8].id), { round: 5, record: { wins: 2, losses: 2 }, stakes: 'decider' })
})

test('swissInfo: falta un resultado anterior → ronda sí, balance no', () => {
  next = 200
  const s = [pending(1, 2, 1), pending(1, 3, 2)]
  const info = swissInfo(s)
  assert.deepEqual(info.get(s[0].id), { round: 1, record: { wins: 0, losses: 0 }, stakes: null })
  assert.deepEqual(info.get(s[1].id), { round: 2, record: null, stakes: null })
})

test('swissInfo: canceladas no cuentan; empate de hora por id', () => {
  next = 300
  const c: SwissSeries = { ...pending(1, 2, 1), status: 'CANCELLED' }
  const a = won(1, 3, 1)
  const b = won(1, 4, 1)  // misma hora que a, id mayor → después
  const info = swissInfo([b, c, a])
  assert.equal(info.has(c.id), false)
  assert.equal(info.get(a.id)?.round, 1)
  assert.deepEqual(info.get(b.id), { round: 2, record: null, stakes: null }, '1-0 contra 0-0: balances distintos')
})

test('formatSeed', () => {
  assert.equal(formatSeed('LCK', 1), 'LCK #1')
  assert.equal(formatSeed(null, 1), null)
  assert.equal(formatSeed('LCK', null), null)
})
