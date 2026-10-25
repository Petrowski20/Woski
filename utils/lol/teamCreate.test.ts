import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanNewTeam, newTeamProblems, parseTeamBatch, teamSlug, type ExistingTeam } from './teamCreate'

const EXISTING: ExistingTeam[] = [
  { name: 'G2 Esports', tag: 'G2', slug: 'lol-g2' },
  // Cambió de siglas y conserva el slug (como Shifters, lol-bds).
  { name: 'Shifters', tag: 'SHFT', slug: 'lol-bds' },
]
const ok = { name: 'Movistar KOI', tag: 'MKOI', region: 'EMEA', country: 'ES', color: '#aabbcc' }
const codes = (p: { code: string }[]) => p.map(x => x.code)

test('teamSlug: lol- + siglas en minúscula (como la BD)', () => {
  assert.equal(teamSlug(' MKOI '), 'lol-mkoi')
})

test('cleanNewTeam: trim, siglas/región/país en mayúsculas y color en minúsculas', () => {
  assert.deepEqual(cleanNewTeam({ name: '  KOI ', tag: ' mk2 ', region: 'emea', country: 'es', color: '#AABBCC' }),
    { name: 'KOI', tag: 'MK2', region: 'EMEA', country: 'ES', color: '#aabbcc' })
})

test('newTeamProblems: un equipo válido no tiene problemas', () => {
  assert.deepEqual(newTeamProblems(ok, EXISTING), [])
  assert.deepEqual(newTeamProblems({ ...ok, country: '', color: '' }, EXISTING), [], 'país y color opcionales')
})

test('newTeamProblems: formato de cada campo', () => {
  assert.deepEqual(codes(newTeamProblems({ ...ok, name: ' ' }, EXISTING)), ['nameLength'])
  for (const tag of ['A', 'ABCDEF', 'G-2', 'G 2', 'ÑU']) {
    assert.deepEqual(codes(newTeamProblems({ ...ok, tag }, EXISTING)), ['tagFormatNew'], tag)
  }
  assert.deepEqual(codes(newTeamProblems({ ...ok, region: '' }, EXISTING)), ['regionRequired'])
  assert.deepEqual(codes(newTeamProblems({ ...ok, region: 'EU' }, EXISTING)), ['regionRequired'])
  assert.deepEqual(codes(newTeamProblems({ ...ok, country: 'ESP' }, EXISTING)), ['countryFormat'])
  assert.deepEqual(codes(newTeamProblems({ ...ok, color: '#fff' }, EXISTING)), ['colorFormat'])
})

test('newTeamProblems: siglas y slug ocupados', () => {
  assert.deepEqual(newTeamProblems({ ...ok, tag: 'g2' }, EXISTING), [{ code: 'tagTaken', tag: 'G2', name: 'G2 Esports' }])
  assert.deepEqual(newTeamProblems({ ...ok, tag: 'BDS' }, EXISTING),
    [{ code: 'slugTaken', slug: 'lol-bds', name: 'Shifters (SHFT)' }])
})

test('parseTeamBatch: "Nombre - SIGLAS", guiones en el nombre y líneas vacías', () => {
  const rows = parseTeamBatch('Fnatic - FNC\n\n  Ici-Japon Corp. - ijc  \r\nT1 – T1\nKT Rolster — KT', EXISTING)
  assert.deepEqual(rows.map(r => [r.line, r.name, r.tag, r.problems.length]),
    [[1, 'Fnatic', 'FNC', 0], [3, 'Ici-Japon Corp.', 'IJC', 0], [4, 'T1', 'T1', 0], [5, 'KT Rolster', 'KT', 0]])
})

test('parseTeamBatch: errores por línea', () => {
  const rows = parseTeamBatch('Sin siglas\nG2 nuevo - G2\nUno - DUP\nOtro - dup\nLargo - ABCDEF\nX - XX', EXISTING)
  assert.deepEqual(rows.map(r => codes(r.problems)), [
    ['lineFormat'], ['tagTaken'], [], ['dupInBatch'], ['tagFormatNew'], ['nameLength'],
  ])
  assert.deepEqual(rows[3].problems[0], { code: 'dupInBatch', line: 3 })
})
