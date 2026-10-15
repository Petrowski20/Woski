import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adminHref, parseAdminParams } from './tabs'
import { formatMention, reminderBlock, reminderMessage } from './reminders'
import { lolEditionStatus } from '../lol/editionStatus'

// ---------------- pestañas de /admin ----------------

test('admin: por defecto LoL · Partidos sin redirección', () => {
  assert.deepEqual(parseAdminParams({}), { sport: 'lol', tab: 'partidos', redirect: null })
})

test('admin: deporte y pestaña válidos', () => {
  assert.deepEqual(parseAdminParams({ deporte: 'futbol', tab: 'premios' }), { sport: 'futbol', tab: 'premios', redirect: null })
})

test('admin: Jugadores redirige a Usuarios conservando el deporte', () => {
  assert.equal(parseAdminParams({ deporte: 'futbol', tab: 'jugadores' }).redirect, '/admin?deporte=futbol&tab=usuarios')
  assert.equal(parseAdminParams({ tab: 'jugadores' }).redirect, '/admin?deporte=lol&tab=usuarios')
})

test('admin: la pestaña LoL antigua pasa a Partidos', () => {
  assert.equal(parseAdminParams({ tab: 'lol' }).redirect, '/admin?deporte=lol&tab=partidos')
})

test('admin: valores desconocidos se corrigen y se conservan los demás parámetros', () => {
  const r = parseAdminParams({ deporte: 'tenis', tab: 'predicciones', serie: '12' })
  assert.equal(r.sport, 'lol')
  assert.equal(r.redirect, '/admin?deporte=lol&tab=predicciones&serie=12')
  assert.equal(parseAdminParams({ deporte: 'lol', tab: 'xyz' }).redirect, '/admin?deporte=lol&tab=partidos')
})

test('admin: adminHref omite vacíos', () => {
  assert.equal(adminHref('lol', 'partidos', { edicion: 2, fase: null, estado: '' }), '/admin?deporte=lol&tab=partidos&edicion=2')
})

// ---------------- recordatorios ----------------

test('recordatorio: @nick sin espacios o nick tal cual', () => {
  assert.equal(formatMention('Ana Pérez', true), '@AnaPérez')
  assert.equal(formatMention('Ana Pérez', false), 'Ana Pérez')
})

test('recordatorio: bloque de una serie', () => {
  const s = { title: 'G2 vs FNC', when: 'mié, 15 oct, 14:30', missing: ['ana', 'bea'] }
  assert.equal(reminderBlock(s, true), '⚔️ Falta tu voto en G2 vs FNC (mié, 15 oct, 14:30):\n@ana\n@bea')
})

test('recordatorio: mensaje con varias series omite las completas', () => {
  const msg = reminderMessage([
    { title: 'A vs B', when: 'x', missing: ['ana'] },
    { title: 'C vs D', when: 'y', missing: [] },
    { title: 'E vs F', when: 'z', missing: ['bea'] },
  ], false)
  assert.equal(msg, '⚔️ Falta tu voto en A vs B (x):\nana\n\n⚔️ Falta tu voto en E vs F (z):\nbea')
})

// ---------------- estado de una edición (perfil) ----------------

const NOW = Date.parse('2026-10-15T12:00:00Z')
const TODAY = '2026-10-15'

test('edición: activa entre sus fechas', () => {
  assert.equal(lolEditionStatus({ startDate: '2026-10-05', endDate: '2026-11-14' }, [], TODAY, NOW), 'active')
})

test('edición: finalizada si su fecha de fin ya pasó', () => {
  assert.equal(lolEditionStatus({ startDate: '2026-01-10', endDate: '2026-03-01' }, [], TODAY, NOW), 'finished')
})

test('edición: empieza pronto si no ha llegado su inicio ni ha empezado ninguna serie', () => {
  const later = [{ date: '2026-10-25T15:00:00Z', status: 'PENDING' as const }]
  assert.equal(lolEditionStatus({ startDate: '2026-10-20', endDate: '2026-11-30' }, later, TODAY, NOW), 'upcoming')
})

test('edición: activa si una serie ya empezó aunque la fecha de inicio sea posterior', () => {
  const early = [{ date: '2026-10-15T10:00:00Z', status: 'PENDING' as const }]
  assert.equal(lolEditionStatus({ startDate: '2026-10-20', endDate: null }, early, TODAY, NOW), 'active')
})

test('edición: sin fecha de fin, finalizada cuando todas sus series están cerradas', () => {
  const done = [
    { date: '2026-09-01T10:00:00Z', status: 'FINISHED' as const },
    { date: '2026-09-02T10:00:00Z', status: 'CANCELLED' as const },
  ]
  assert.equal(lolEditionStatus({ startDate: '2026-09-01', endDate: null }, done, TODAY, NOW), 'finished')
})

test('edición: sin fechas ni series, empieza pronto', () => {
  assert.equal(lolEditionStatus({ startDate: null, endDate: null }, [], TODAY, NOW), 'upcoming')
})
