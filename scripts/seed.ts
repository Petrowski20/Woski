/**
 * Seed script — equipos y jugadores del Mundial 2026
 *
 * Uso (desde la raíz del proyecto):
 *   npm run seed
 *
 * Lee dos fuentes de datos:
 *   scripts/data/teams.json          → actualiza la tabla `teams`
 *   scripts/data/players/<iso>.json  → reemplaza los jugadores de cada equipo
 *
 * El script es re-ejecutable: borra los jugadores previos del equipo
 * antes de cada inserción, por lo que correrlo varias veces no duplica datos.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface PlayerInput {
  squad_number?:     number
  name:              string
  position:          'GK' | 'DF' | 'MF' | 'FW'
  date_of_birth?:    string    // "YYYY-MM-DD"
  height_cm?:        number
  weight_kg?:        number
  club?:             string
  caps?:             number    // partidos internacionales antes del torneo
  intl_goals?:       number    // goles con la selección antes del torneo
  transfermarkt_id?: number
}

interface TeamFile {
  iso_code: string
  players:  PlayerInput[]
}

interface TeamInfo {
  iso_code:        string
  fifa_ranking?:   number
  manager?:        string
  confederation?:  'UEFA' | 'CONMEBOL' | 'CAF' | 'AFC' | 'CONCACAF' | 'OFC'
  world_cups_won?: number
  last_wc_result?: string
  seudonimo?:      string
}

// ── Cliente admin (sin RLS) ────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Helpers ────────────────────────────────────────────────────────────────

const DATA_DIR    = path.resolve(process.cwd(), 'scripts', 'data')
const PLAYERS_DIR = path.join(DATA_DIR, 'players')

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌍  Seed del Mundial 2026\n' + '─'.repeat(40))

  // 1. Construir mapa iso_code → id desde la BD
  const { data: dbTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id, iso_code')

  if (teamsError || !dbTeams) {
    console.error('❌ No se pudieron obtener los equipos:', teamsError?.message)
    process.exit(1)
  }

  const teamMap: Record<string, number> = Object.fromEntries(
    dbTeams.map(t => [t.iso_code, t.id])
  )
  console.log(`\n✓ ${dbTeams.length} equipos en BD`)

  // ── 2. Actualizar info de equipos ─────────────────────────────────────

  const teamsInfoPath = path.join(DATA_DIR, 'teams.json')

  if (fs.existsSync(teamsInfoPath)) {
    const teamsInfo: TeamInfo[] = JSON.parse(fs.readFileSync(teamsInfoPath, 'utf-8'))
    console.log(`\n📋  Actualizando info de equipos (${teamsInfo.length})…`)

    for (const info of teamsInfo) {
      const teamId = teamMap[info.iso_code]
      if (!teamId) {
        console.warn(`   ⚠  ${info.iso_code} — no encontrado en BD`)
        continue
      }

      const { iso_code: _drop, ...fields } = info

      const { error } = await supabase
        .from('teams')
        .update(fields)
        .eq('id', teamId)

      if (error) console.error(`   ✗ ${info.iso_code.padEnd(3)} — ${error.message}`)
      else        console.log (`   ✓ ${info.iso_code}`)
    }
  } else {
    console.log('\n⚠  scripts/data/teams.json no existe — se omite la actualización de equipos')
  }

  // ── 3. Insertar jugadores ─────────────────────────────────────────────

  if (!fs.existsSync(PLAYERS_DIR)) {
    console.log('\n⚠  El directorio scripts/data/players/ no existe. Nada que insertar.')
    return
  }

  // Los archivos que empiezan por "_" son plantillas de ejemplo, se ignoran
  const files = fs.readdirSync(PLAYERS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort()

  if (files.length === 0) {
    console.log('\n⚠  No hay archivos de jugadores en scripts/data/players/')
    return
  }

  console.log(`\n👕  Insertando jugadores (${files.length} selecciones)…`)

  let totalPlayers = 0
  let totalErrors  = 0

  for (const file of files) {
    const filePath = path.join(PLAYERS_DIR, file)
    let raw: TeamFile

    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch (e) {
      console.error(`   ✗ ${file} — JSON inválido: ${(e as Error).message}`)
      totalErrors++
      continue
    }

    const teamId = teamMap[raw.iso_code]
    if (!teamId) {
      console.warn(`   ⚠  ${file} — iso_code "${raw.iso_code}" no encontrado en BD`)
      continue
    }

    // Borrar jugadores previos del equipo (hace el script idempotente)
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('team_id', teamId)

    if (deleteError) {
      console.error(`   ✗ ${raw.iso_code.padEnd(3)} — error al borrar previos: ${deleteError.message}`)
      totalErrors++
      continue
    }

    const rows = raw.players.map(p => {
      const row: Record<string, unknown> = { ...p, team_id: teamId }
      // Campos NOT NULL DEFAULT 0: sustituir null por 0
      if (row.caps       == null) row.caps       = 0
      if (row.intl_goals == null) row.intl_goals = 0
      // Campos opcionales (nullable): eliminar nulls para que la BD use NULL
      return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null))
    })

    const { error: insertError } = await supabase.from('players').insert(rows)

    if (insertError) {
      console.error(`   ✗ ${raw.iso_code.padEnd(3)} — ${insertError.message}`)
      totalErrors++
    } else {
      console.log(`   ✓ ${raw.iso_code.padEnd(3)} — ${rows.length} jugadores`)
      totalPlayers += rows.length
    }
  }

  const icon = totalErrors === 0 ? '✅' : '⚠ '
  console.log(
    `\n${icon} Completado: ${totalPlayers} jugadores` +
    (totalErrors ? `, ${totalErrors} archivo(s) con error` : '')
  )
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err)
  process.exit(1)
})
