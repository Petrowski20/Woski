'use client'

import { useState, useMemo, useRef } from 'react'
import { Check, RotateCcw, ArrowLeft, Download } from 'lucide-react'
import bracketData from '@/scripts/data/bracket.json'
import annexCRaw from '@/scripts/data/annex_c.json'
import { getFlagUrl } from '@/utils/getFlagUrl'
import { useLang } from '@/contexts/LangContext'

const annexC = annexCRaw as Record<string, Record<string, string>>

// ── Tipos de datos ────────────────────────────────────────────────────────────

interface TeamStanding {
  id: number; name: string; flag: string | null; isoCode: string
  pts: number; pj: number; pg: number; pe: number; pp: number
  gf: number; gc: number; dg: number
}
export type ThirdPlace = TeamStanding & { groupLetter: string }
export interface GroupStanding { letter: string; standings: TeamStanding[] }

interface RawPositionSlot { type: 'first' | 'second'; group: string }
interface RawThirdSlot    { type: 'third'; possible_groups: string[] }
type RawSlot = RawPositionSlot | RawThirdSlot
interface RawMatch {
  id: number; side: 'left' | 'right'; quadrant: number
  home: RawSlot; away: RawSlot; next_match_id: number
}

export interface ResolvedTeam { name: string; isoCode: string; flag: string | null }
type R16Slots = Record<number, { home: ResolvedTeam | null; away: ResolvedTeam | null }>

// ── Metadata estática del bracket ─────────────────────────────────────────────

type Round = 'r16' | 'r8' | 'qf' | 'sf' | 'final' | 'third'
interface MatchMeta {
  round: Round
  side: 'left' | 'right' | 'center'
  next_match_id: number
  home_feeder?: number
  away_feeder?: number
}

const MATCH_META: Record<number, MatchMeta> = {
  // R16 — Izquierda
  74: { round: 'r16', side: 'left',   next_match_id: 89 },
  77: { round: 'r16', side: 'left',   next_match_id: 89 },
  73: { round: 'r16', side: 'left',   next_match_id: 90 },
  75: { round: 'r16', side: 'left',   next_match_id: 90 },
  83: { round: 'r16', side: 'left',   next_match_id: 91 },
  84: { round: 'r16', side: 'left',   next_match_id: 91 },
  81: { round: 'r16', side: 'left',   next_match_id: 92 },
  82: { round: 'r16', side: 'left',   next_match_id: 92 },
  // R16 — Derecha
  76: { round: 'r16', side: 'right',  next_match_id: 93 },
  78: { round: 'r16', side: 'right',  next_match_id: 93 },
  79: { round: 'r16', side: 'right',  next_match_id: 94 },
  80: { round: 'r16', side: 'right',  next_match_id: 94 },
  86: { round: 'r16', side: 'right',  next_match_id: 95 },
  88: { round: 'r16', side: 'right',  next_match_id: 95 },
  85: { round: 'r16', side: 'right',  next_match_id: 96 },
  87: { round: 'r16', side: 'right',  next_match_id: 96 },
  // Octavos — Izquierda
  89: { round: 'r8', side: 'left',  next_match_id: 97,  home_feeder: 74,  away_feeder: 77 },
  90: { round: 'r8', side: 'left',  next_match_id: 97,  home_feeder: 73,  away_feeder: 75 },
  91: { round: 'r8', side: 'left',  next_match_id: 98,  home_feeder: 83,  away_feeder: 84 },
  92: { round: 'r8', side: 'left',  next_match_id: 98,  home_feeder: 81,  away_feeder: 82 },
  // Octavos — Derecha
  93: { round: 'r8', side: 'right', next_match_id: 99,  home_feeder: 76,  away_feeder: 78 },
  94: { round: 'r8', side: 'right', next_match_id: 99,  home_feeder: 79,  away_feeder: 80 },
  95: { round: 'r8', side: 'right', next_match_id: 100, home_feeder: 86,  away_feeder: 88 },
  96: { round: 'r8', side: 'right', next_match_id: 100, home_feeder: 85,  away_feeder: 87 },
  // Cuartos — Izquierda
  97: { round: 'qf', side: 'left',  next_match_id: 101, home_feeder: 89,  away_feeder: 90 },
  98: { round: 'qf', side: 'left',  next_match_id: 101, home_feeder: 91,  away_feeder: 92 },
  // Cuartos — Derecha
  99:  { round: 'qf', side: 'right', next_match_id: 102, home_feeder: 93,  away_feeder: 94 },
  100: { round: 'qf', side: 'right', next_match_id: 102, home_feeder: 95,  away_feeder: 96 },
  // Semis
  101: { round: 'sf', side: 'left',   next_match_id: 103, home_feeder: 97,  away_feeder: 98 },
  102: { round: 'sf', side: 'right',  next_match_id: 103, home_feeder: 99,  away_feeder: 100 },
  // Final
  103: { round: 'final', side: 'center', next_match_id: 0, home_feeder: 101, away_feeder: 102 },
  // 3er y 4º Puesto — perdedores de semis
  104: { round: 'third', side: 'center', next_match_id: 0 },
}

// Orden visual de cada columna (de arriba a abajo)
const COLUMNS: { ids: number[]; label: string; isCenter?: boolean }[] = [
  { ids: [74, 77, 73, 75, 83, 84, 81, 82], label: '16avos'  },
  { ids: [89, 90, 91, 92],                  label: 'Octavos' },
  { ids: [97, 98],                           label: 'Cuartos' },
  { ids: [101],                              label: 'Semis'   },
  { ids: [103, 104],                         label: 'Final / 3°', isCenter: true },
  { ids: [102],                              label: 'Semis'   },
  { ids: [99, 100],                          label: 'Cuartos' },
  { ids: [93, 94, 95, 96],                   label: 'Octavos' },
  { ids: [76, 78, 79, 80, 86, 88, 85, 87],  label: '16avos'  },
]

// ── FlagCell ──────────────────────────────────────────────────────────────────

function FlagCell({ flag, name, isoCode, size = 7 }: {
  flag: string | null; name: string; isoCode?: string; size?: 5 | 7
}) {
  const url = getFlagUrl(flag ?? '', isoCode)
  const cls = size === 5
    ? 'w-5 h-5 rounded-full object-cover shrink-0 border border-gray-200/60 dark:border-slate-700'
    : 'w-7 h-7 rounded-full object-cover shrink-0 border border-gray-200/60 dark:border-slate-700'
  const spanCls = size === 5 ? 'text-sm shrink-0' : 'w-7 h-7 flex items-center justify-center text-base shrink-0 select-none'
  if (!url) return <span className={spanCls} title={name}>{flag ?? '🏳'}</span>
  return <img src={url} alt={name} title={name} className={cls} />
}

// ── Props del componente ──────────────────────────────────────────────────────

interface Props {
  groups: GroupStanding[]
  allThirds: ThirdPlace[]
  predCount: number
  totalGroupMatches: number
}

// ═════════════════════════════════════════════════════════════════════════════
// SimuladorClient — Componente principal
// ═════════════════════════════════════════════════════════════════════════════

export default function SimuladorClient({ groups, allThirds, predCount, totalGroupMatches }: Props) {
  const { t } = useLang()

  const [activeTab, setActiveTab] = useState<'grupos' | 'eliminatorias'>('grupos')
  const [r16Teams, setR16Teams]   = useState<R16Slots>({})
  const [winners,  setWinners]    = useState<Record<number, ResolvedTeam>>({})

  const best8          = useMemo(() => allThirds.slice(0, 8), [allThirds])
  const bestThirdsIds  = useMemo(() => new Set(best8.map(x => x.id)), [best8])
  const champion       = winners[103] ?? null
  const thirdPlace     = winners[104] ?? null

  // ── Resolución del bracket ──────────────────────────────────────────────────

  function generateBracket() {
    const gMap = new Map<string, TeamStanding[]>(groups.map(g => [g.letter, g.standings]))
    const raw  = bracketData as RawMatch[]

    const lookupKey = best8.map(t => t.groupLetter).sort().join('')
    const thirdAssignments = annexC[lookupKey]
    if (!thirdAssignments) throw new Error(`No annex_c entry for key: ${lookupKey}`)

    function resolve(slot: RawSlot, matchId: number, isAway: boolean): ResolvedTeam | null {
      if (slot.type === 'first') {
        const team = gMap.get((slot as RawPositionSlot).group)?.[0]
        return team ? { name: team.name, isoCode: team.isoCode, flag: team.flag } : null
      }
      if (slot.type === 'second') {
        const team = gMap.get((slot as RawPositionSlot).group)?.[1]
        return team ? { name: team.name, isoCode: team.isoCode, flag: team.flag } : null
      }
      if (isAway) {
        const targetGroup = thirdAssignments[matchId.toString()]
        const team = best8.find(t => t.groupLetter === targetGroup)
        return team ? { name: team.name, isoCode: team.isoCode, flag: team.flag } : null
      }
      return null
    }

    const slots: R16Slots = {}
    for (const m of raw) {
      slots[m.id] = { home: resolve(m.home, m.id, false), away: resolve(m.away, m.id, true) }
    }

    setR16Teams(slots)
    setWinners({})
    setActiveTab('eliminatorias')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Derivar equipos de cada partido ────────────────────────────────────────

  function getHome(matchId: number): ResolvedTeam | null {
    if (matchId === 104) {
      // Perdedor de Semi 1 (101)
      const w = winners[101]
      if (!w) return null
      const h = getHome(101)
      const a = getAway(101)
      return (h && w.isoCode !== h.isoCode) ? h : (a && w.isoCode !== a.isoCode ? a : null)
    }
    const meta = MATCH_META[matchId]
    if (!meta) return null
    if (meta.round === 'r16') return r16Teams[matchId]?.home ?? null
    return winners[meta.home_feeder!] ?? null
  }

  function getAway(matchId: number): ResolvedTeam | null {
    if (matchId === 104) {
      // Perdedor de Semi 2 (102)
      const w = winners[102]
      if (!w) return null
      const h = getHome(102)
      const a = getAway(102)
      return (h && w.isoCode !== h.isoCode) ? h : (a && w.isoCode !== a.isoCode ? a : null)
    }
    const meta = MATCH_META[matchId]
    if (!meta) return null
    if (meta.round === 'r16') return r16Teams[matchId]?.away ?? null
    return winners[meta.away_feeder!] ?? null
  }

  // ── Avanzar equipo (con cascade invalidation) ───────────────────────────────

  function advanceTeam(matchId: number, team: ResolvedTeam) {
    setWinners(prev => {
      const next = { ...prev }
      const prevWinner = prev[matchId]
      next[matchId] = team

      // Cascade: si el ganador anterior estaba propagado, limpiar la cadena
      if (prevWinner && prevWinner.isoCode !== team.isoCode) {
        let chainId: number = MATCH_META[matchId]?.next_match_id ?? 0
        let tracking: ResolvedTeam = prevWinner
        while (chainId && MATCH_META[chainId]) {
          const desc = next[chainId]
          if (desc && desc.isoCode === tracking.isoCode) {
            tracking = desc
            delete next[chainId]
            chainId = MATCH_META[chainId]?.next_match_id ?? 0
          } else break
        }

        // Cuando cambia un semi, el perdedor en el 3er puesto también cambia
        if (matchId === 101 || matchId === 102) {
          delete next[104]
        }
      }
      return next
    })
  }

  // ── MatchNode — tarjeta de partido ─────────────────────────────────────────

  function MatchNode({ matchId, isFinal = false }: { matchId: number; isFinal?: boolean }) {
    const home   = getHome(matchId)
    const away   = getAway(matchId)
    const winner = winners[matchId]
    const isHomeWinner = !!(winner && home && winner.isoCode === home.isoCode)
    const isAwayWinner = !!(winner && away && winner.isoCode === away.isoCode)

    function TeamBtn({ team, isWinner }: { team: ResolvedTeam | null; isWinner: boolean }) {
      const canClick = !!team
      return (
        <button
          onClick={() => canClick && advanceTeam(matchId, team)}
          disabled={!canClick}
          className={[
            'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-150',
            isWinner
              ? 'bg-emerald-900/30 text-emerald-300'
              : canClick
                ? 'text-slate-300 hover:bg-slate-700/60 cursor-pointer'
                : 'text-slate-600 cursor-default',
          ].join(' ')}
        >
          {team ? (
            <>
              <FlagCell flag={team.flag} name={team.isoCode} isoCode={team.isoCode} size={5} />
              <span className={`font-mono text-[11px] font-bold tracking-wide shrink-0 ${isWinner ? 'text-emerald-300' : 'text-slate-300'}`}>
                {team.isoCode}
              </span>
              <span className={`text-[11px] truncate flex-1 ${isWinner ? 'text-emerald-400/80' : 'text-slate-500'}`}>
                {team.name}
              </span>
              {isWinner && <Check className="w-3 h-3 text-emerald-400 shrink-0 ml-auto" />}
            </>
          ) : (
            <span className="text-[11px] text-slate-600 italic">TBD</span>
          )}
        </button>
      )
    }

    return (
      <div className={[
        'bg-slate-800 border rounded-md overflow-hidden flex flex-col shrink-0 shadow-sm',
        isFinal
          ? 'w-48 border-slate-700/50'
          : 'w-44 border-slate-700/50',
      ].join(' ')}>
        <TeamBtn team={home} isWinner={isHomeWinner} />
        <div className="border-t border-slate-700/50" />
        <TeamBtn team={away} isWinner={isAwayWinner} />
      </div>
    )
  }

  const hasBracket = Object.keys(r16Teams).length > 0
  const bracketRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    if (!bracketRef.current) return
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(bracketRef.current, { pixelRatio: 2, skipFonts: true, backgroundColor: '#0f172a' })
    const link = document.createElement('a')
    link.download = 'mi-prediccion.png'
    link.href = dataUrl
    link.click()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full">

      {/* Encabezado */}
      <div className="max-w-6xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('supuestos.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('supuestos.subtitle')}</p>
      </div>


      {/* ══════════════════════════════════════════════════════════════════════
          VISTA: FASE DE GRUPOS
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'grupos' && (
        <div className="max-w-6xl mx-auto">
          {/* Banner */}
          <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 p-4 rounded-xl mb-6 border border-[#FFD6D1] dark:border-slate-800">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{t('supuestos.basado', { n: predCount, total: totalGroupMatches })}</span>
              <span>• {t('supuestos.sinPrediccion0')}</span>
              <span>• <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800 mr-1 align-middle" />{t('supuestos.clasificacionDirecta')}</span>
              <span>• <span className="inline-block w-2.5 h-2.5 rounded-sm bg-lime-200 dark:bg-lime-800/60 mr-1 align-middle" />{t('supuestos.mejorTercero')}</span>
            </div>
          </div>

          {/* Grid de grupos */}
          {groups.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-12">{t('supuestos.noPartidos')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {groups.map(({ letter, standings }) => (
                <div key={letter} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-hidden">
                  <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 px-4 py-3 border-b border-[#FFD6D1] dark:border-slate-800">
                    <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      {t('supuestos.grupo', { letter })}
                    </h2>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-slate-800/80 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        <th className="px-3 py-2 text-left">{t('supuestos.cols.equipo')}</th>
                        <th className="px-1.5 py-2 text-center w-7">PJ</th>
                        <th className="px-1.5 py-2 text-center w-7">PG</th>
                        <th className="px-1.5 py-2 text-center w-7">PE</th>
                        <th className="px-1.5 py-2 text-center w-7">PP</th>
                        <th className="px-1.5 py-2 text-center w-7">GF</th>
                        <th className="px-1.5 py-2 text-center w-7">GC</th>
                        <th className="px-1.5 py-2 text-center w-9">DG</th>
                        <th className="px-2 py-2 text-center w-10 font-bold text-gray-600 dark:text-gray-300">{t('supuestos.cols.pts')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team, idx) => {
                        const isBestThird = idx === 2 && bestThirdsIds.has(team.id)
                        const rowClass = idx < 2
                          ? 'bg-green-50/60 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/20'
                          : isBestThird
                            ? 'bg-lime-50/70 dark:bg-lime-900/15 hover:bg-lime-50 dark:hover:bg-lime-900/25'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800/30'
                        return (
                          <tr key={team.id} className={`border-b border-gray-50 dark:border-slate-800/50 last:border-0 transition-colors ${rowClass}`}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <FlagCell flag={team.flag} name={team.name} isoCode={team.isoCode} />
                                <span className="font-mono text-[11px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{team.isoCode}</span>
                              </div>
                            </td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pj}</td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pg}</td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pe}</td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.pp}</td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.gf}</td>
                            <td className="px-1.5 py-2.5 w-7 shrink-0 text-center text-gray-500 dark:text-gray-400">{team.gc}</td>
                            <td className="px-1.5 py-2.5 w-9 shrink-0 text-center text-gray-500 dark:text-gray-400">
                              {team.dg > 0 ? `+${team.dg}` : team.dg}
                            </td>
                            <td className="px-2 py-2.5 w-10 shrink-0 text-center font-bold text-blue-600 dark:text-blue-400">{team.pts}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Mejores Terceros */}
          {allThirds.length > 0 && (
            <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-[#FFD6D1] dark:border-slate-800 overflow-hidden">
              <div className="bg-[#FFD6D1]/30 dark:bg-slate-800/50 px-4 py-3 border-b border-[#FFD6D1] dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {t('supuestos.mejoresTercerosTitle')}
                </h2>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800" />
                    {t('supuestos.mejorTerceroPass')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-200 dark:bg-red-900/60" />
                    {t('supuestos.mejorTerceroOut')}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800/80 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-center w-8">G</th>
                      <th className="px-3 py-2 text-left">{t('supuestos.cols.equipo')}</th>
                      <th className="px-1.5 py-2 text-center w-7">PJ</th><th className="px-1.5 py-2 text-center w-7">PG</th>
                      <th className="px-1.5 py-2 text-center w-7">PE</th><th className="px-1.5 py-2 text-center w-7">PP</th>
                      <th className="px-1.5 py-2 text-center w-7">GF</th><th className="px-1.5 py-2 text-center w-7">GC</th>
                      <th className="px-1.5 py-2 text-center w-9">DG</th>
                      <th className="px-2 py-2 text-center w-10 font-bold text-gray-600 dark:text-gray-300">{t('supuestos.cols.pts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allThirds.map((team, idx) => {
                      const passes = idx < 8
                      const rowClass = passes
                        ? 'bg-green-50/70 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/20'
                        : 'bg-red-50/60 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                      return (
                        <tr key={team.id} className={`border-b border-gray-50 dark:border-slate-800/50 last:border-0 transition-colors ${rowClass}`}>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-bold text-gray-500 dark:text-gray-400">{team.groupLetter}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <FlagCell flag={team.flag} name={team.name} isoCode={team.isoCode} />
                              <span className="font-mono text-[11px] font-bold text-gray-600 dark:text-gray-300 tracking-wide">{team.isoCode}</span>
                            </div>
                          </td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.pj}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.pg}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.pe}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.pp}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.gf}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">{team.gc}</td>
                          <td className="px-1.5 py-2.5 text-center text-gray-500 dark:text-gray-400">
                            {team.dg > 0 ? `+${team.dg}` : team.dg}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-blue-600 dark:text-blue-400">{team.pts}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botón Generar */}
          {groups.length > 0 && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={generateBracket}
                className="inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-base font-bold transition-colors shadow-md hover:shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Generar Eliminatorias
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL FULL-SCREEN: Eliminatorias
          ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'eliminatorias' && hasBracket && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 w-screen h-screen flex flex-col overflow-hidden">

          {/* Barra cabecera sticky */}
          <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 shadow-sm shrink-0">
            <button
              onClick={() => setActiveTab('grupos')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Grupos
            </button>
            <h2 className="flex-1 text-center text-base font-bold text-gray-900 dark:text-gray-100">Tu Predicción</h2>
            <button
              onClick={() => setWinners({})}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shrink-0"
            >
              <Download className="w-4 h-4" />
              Descargar Imagen
            </button>
          </div>

          {/* Área de contenido scrollable en todas las direcciones */}
          <div className="flex-1 overflow-auto p-4 md:p-8">

            {/* ── Lienzo del póster ── */}
            <div
              ref={bracketRef}
              className="min-w-max flex flex-col items-center relative overflow-hidden p-10"
              style={{ background: 'radial-gradient(ellipse at center, #1e293b 0%, #020617 100%)' }}
            >
              {/* Cabecera de branding */}
              <div className="w-full text-center mb-10">
                <p className="text-3xl font-black tracking-widest text-slate-200">MI PREDICCIÓN — MUNDIAL 2026</p>
              </div>

              {/* Etiquetas de columnas */}
              <div className="flex gap-6 min-w-max mb-2">
                {COLUMNS.map((col, ci) => (
                  <div
                    key={ci}
                    className={`text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 ${
                      col.isCenter ? 'w-48' : 'w-44'
                    }`}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Árbol del bracket — 9 columnas */}
              <div
                className="flex gap-6 min-w-max items-stretch"
                style={{ minHeight: '720px' }}
              >
                {COLUMNS.map((col, ci) => (
                  <div
                    key={ci}
                    className={`flex flex-col justify-around ${col.isCenter ? 'w-48' : 'w-44'}`}
                  >
                    {col.ids.map(matchId => {
                      if (col.isCenter) {
                        if (matchId === 103) {
                          return (
                            <div key={matchId} className="flex flex-col items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                                Final
                              </span>
                              <MatchNode matchId={matchId} isFinal />
                              {champion && (
                                <div className="flex flex-col items-center gap-2 w-48 px-3 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                  <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">
                                    🏆 Campeón
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <FlagCell flag={champion.flag} name={champion.isoCode} isoCode={champion.isoCode} size={5} />
                                    <span className="font-mono text-sm font-bold text-yellow-300">{champion.isoCode}</span>
                                  </div>
                                  <span className="text-[11px] text-yellow-200/70 text-center truncate w-full">{champion.name}</span>
                                </div>
                              )}
                            </div>
                          )
                        }
                        if (matchId === 104) {
                          return (
                            <div key={matchId} className="flex flex-col items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                3er Puesto
                              </span>
                              <MatchNode matchId={matchId} />
                              {thirdPlace && (
                                <div className="flex flex-col items-center gap-2 w-44 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                                    🥉 3er Lugar
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <FlagCell flag={thirdPlace.flag} name={thirdPlace.isoCode} isoCode={thirdPlace.isoCode} size={5} />
                                    <span className="font-mono text-sm font-bold text-amber-300">{thirdPlace.isoCode}</span>
                                  </div>
                                  <span className="text-[11px] text-amber-200/70 text-center truncate w-full">{thirdPlace.name}</span>
                                </div>
                              )}
                            </div>
                          )
                        }
                      }
                      return <MatchNode key={matchId} matchId={matchId} />
                    })}
                  </div>
                ))}
              </div>

              {/* Pie de página de branding */}
              <div className="w-full text-center mt-10 text-slate-500 text-sm font-medium tracking-widest">
                CREADO EN WOSKI.GG
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
