import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flagUrl, parseRole, parseRosterPaste, roleOrder } from './roster'

test('parseRole: alias del Excel', () => {
  assert.equal(parseRole('ADCARRY'), 'ADC')
  assert.equal(parseRole(' jungla '), 'JUNGLE')
  assert.equal(parseRole('JG'), 'JUNGLE')
  assert.equal(parseRole('Head Coach'), 'COACH')
  assert.equal(parseRole('sup'), 'SUPPORT')
  assert.equal(parseRole('Bot'), 'ADC')
  assert.equal(parseRole('mid-laner'), 'MID')
  assert.equal(parseRole('analista'), null)
  assert.equal(parseRole(''), null)
})

test('roleOrder: Top → Coach, desconocidos al final', () => {
  assert.deepEqual(['COACH', 'MID', 'TOP', 'X', 'ADC'].sort((a, b) => roleOrder(a) - roleOrder(b)), ['TOP', 'MID', 'ADC', 'COACH', 'X'])
})

const TAGS = new Set(['NAVI', 'G2', 'MKOI'])

test('parseRosterPaste: tabuladores (copiar del Excel), "|" y ";", cabecera y líneas vacías', () => {
  const rows = parseRosterPaste(
    'Equipo\tRol\tNick\tPaís\nNAVI\tTOP\tMaynter\tua\n\nnavi | ADCARRY | Hans SamD | kr | Steven Le\nG2;COACH;Dylan Falco;CA',
    TAGS,
  )
  assert.deepEqual(rows.map(r => [r.line, r.team, r.role, r.nickname, r.country, r.realName, r.problems.length]), [
    [2, 'NAVI', 'TOP', 'Maynter', 'UA', '', 0],
    [4, 'NAVI', 'ADC', 'Hans SamD', 'KR', 'Steven Le', 0],
    [5, 'G2', 'COACH', 'Dylan Falco', 'CA', '', 0],
  ])
})

test('parseRosterPaste: país opcional', () => {
  assert.equal(parseRosterPaste('G2\tMID\tCaps', TAGS)[0].problems.length, 0)
})

test('parseRosterPaste: errores por línea', () => {
  const rows = parseRosterPaste('XXX\tTOP\tA\tES\nG2\tANALISTA\tB\tES\nG2\tMID\tC\tESP\nG2\tMID\nG2\tTOP\tCaps\nMKOI\tMID\tcaps', TAGS)
  assert.deepEqual(rows.map(r => r.problems.map(p => p.code)), [['team'], ['role'], ['country'], ['columns'], [], ['duplicate']])
  assert.deepEqual(rows[5].problems[0], { code: 'duplicate', line: 5 })
})

test('flagUrl', () => {
  assert.equal(flagUrl('KR'), 'https://flagcdn.com/w40/kr.png')
  assert.equal(flagUrl(null), null)
  assert.equal(flagUrl('KOR'), null)
})
