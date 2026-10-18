import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLolRules, signedPoints, streakBonusFor } from './rules'

// Config del Play-In de Worlds (supabase/seeds/worlds_2026_playin_v2.sql, bloque 1A).
const block = {
  tiers: [{ min_share: 50, points: 2 }, { min_share: 25, points: 3 }, { min_share: 0, points: 4 }],
  sole_voter_points: 6, min_voters_percent: 1, min_voters_override: 3, fallback_points: 2,
}
const PLAYIN = {
  version: 2,
  scoring_type: 'series',
  default_best_of: 5,
  prediction_cutoff_minutes: 0,
  winner_points: block,
  exact_score_points: block,
  streak_bonus: { scope: 'phase', tiers: [{ from: 3, bonus: 1 }, { from: 7, bonus: 2 }, { from: 12, bonus: 3 }, { from: 18, bonus: 4 }] },
  perfect_day: { positive: 0, negative: -2 },
  featured_match_bonus: 2,
}

test('v2: el pleno negativo sale del config (−2), no de un número fijo', () => {
  const r = parseLolRules(PLAYIN)
  assert.equal(r.version, 2)
  assert.deepEqual(r.perfectDay, { positive: 0, negative: -2 })
  assert.equal(r.cutoffMinutes, 0)
  assert.equal(r.featuredBonus, 2)
  assert.equal(r.winner?.minVotersOverride, 3)
  assert.deepEqual(r.winner?.tiers.map(t => t.minShare), [50, 25, 0])
})

test('count_exact_score: por defecto false, true solo si el config lo dice', () => {
  assert.equal(parseLolRules(PLAYIN).countExactScore, false)
  const on = { ...PLAYIN, streak_bonus: { ...PLAYIN.streak_bonus, count_exact_score: true } }
  assert.equal(parseLolRules(on).countExactScore, true)
  const str = { ...PLAYIN, streak_bonus: { ...PLAYIN.streak_bonus, count_exact_score: 'true' } }
  assert.equal(parseLolRules(str).countExactScore, false)
})

test('v1 (sin version): pleno negativo −1 como lol_standings_at', () => {
  const r = parseLolRules({ scoring_type: 'series', correct_winner_points: 2, exact_score_points: 5 })
  assert.equal(r.version, 1)
  assert.deepEqual(r.perfectDay, { positive: 0, negative: -1 })
  assert.deepEqual(r.v1, { winner: 2, exact: 5 })
  assert.equal(r.countExactScore, false)
})

test('config vacío o nulo no rompe', () => {
  assert.equal(parseLolRules(null).version, 1)
  assert.equal(parseLolRules({ version: 2 }).perfectDay.negative, 0)
})

test('streakBonusFor: tramo con mayor from <= racha (como lol_streak_bonus)', () => {
  const tiers = parseLolRules(PLAYIN).streakTiers
  assert.deepEqual([1, 2, 3, 4, 7, 11, 12, 18, 30].map(n => streakBonusFor(tiers, n)), [0, 0, 1, 1, 2, 2, 3, 4, 4])
})

test('signedPoints', () => {
  assert.equal(signedPoints(-2), '−2')
  assert.equal(signedPoints(3), '+3')
  assert.equal(signedPoints(0), '0')
})
