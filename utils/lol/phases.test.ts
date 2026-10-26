import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editionChampionDecided, phaseStatuses, pickActivePhase } from './phases'

const phases = [
  { id: 2, name: 'Swiss Stage', order: 1 },
  { id: 1, name: 'Play-In', order: 0 },
  { id: 3, name: 'Play-offs', order: 2 },
]

test('phaseStatuses: ordena por order y marca empezada/terminada', () => {
  const st = phaseStatuses(phases, [
    { phaseId: 1, status: 'FINISHED' }, { phaseId: 1, status: 'CANCELLED' },
    { phaseId: 2, status: 'FINISHED' }, { phaseId: 2, status: 'PENDING' },
    { phaseId: 3, status: 'PENDING' },
  ])
  assert.deepEqual(st.map(p => [p.name, p.started, p.finished]), [
    ['Play-In', true, true],
    ['Swiss Stage', true, false],
    ['Play-offs', false, false],
  ])
})

test('phaseStatuses: sin series terminadas no hay campeón (solo canceladas o vacía)', () => {
  const st = phaseStatuses(phases, [{ phaseId: 1, status: 'CANCELLED' }])
  assert.deepEqual(st.map(p => p.finished), [false, false, false])
})

test('editionChampionDecided: todas las fases terminadas y end_date alcanzada', () => {
  const done = phaseStatuses(phases.slice(0, 2), [{ phaseId: 1, status: 'FINISHED' }, { phaseId: 2, status: 'FINISHED' }])
  assert.equal(editionChampionDecided(done, '2026-11-10', '2026-11-09'), false, 'falta la fecha de fin')
  assert.equal(editionChampionDecided(done, '2026-11-10', '2026-11-10'), true, 'el mismo día de fin')
  assert.equal(editionChampionDecided(done, null, '2026-10-01'), true, 'sin fecha de fin')
  const open = phaseStatuses(phases, [{ phaseId: 1, status: 'FINISHED' }, { phaseId: 2, status: 'FINISHED' }])
  assert.equal(editionChampionDecided(open, null, '2026-12-31'), false, 'una fase sin terminar')
  assert.equal(editionChampionDecided([], null, '2026-12-31'), false, 'sin fases')
})

test('pickActivePhase: la elegida, Total o la fase actual', () => {
  const st = phaseStatuses(phases, [
    { phaseId: 1, status: 'FINISHED' },
    { phaseId: 2, status: 'FINISHED' }, { phaseId: 2, status: 'PENDING' },
    { phaseId: 3, status: 'PENDING' },
  ])
  assert.equal(pickActivePhase(st, false, undefined)?.name, 'Swiss Stage', 'sin elegir: la última con series terminadas')
  assert.equal(pickActivePhase(st, false, '1')?.name, 'Play-In', 'la elegida')
  assert.equal(pickActivePhase(st, false, '3')?.name, 'Play-offs', 'también una sin empezar')
  assert.equal(pickActivePhase(st, false, 'total'), null, 'Total')
  assert.equal(pickActivePhase(st, false, '99')?.name, 'Swiss Stage', 'id de otra edición: la actual')
  assert.equal(pickActivePhase(st, true, undefined), null, 'edición terminada: Total')
  assert.equal(pickActivePhase(st.slice(0, 1), false, '1'), null, 'una sola fase: Total')
  assert.equal(pickActivePhase(phaseStatuses(phases, []), false, undefined), null, 'sin resultados: Total')
})
