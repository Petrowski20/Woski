'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLang } from '@/contexts/LangContext'
import {
  createLolTeamAction,
  createLolTeamsAction,
  importLolRosterAction,
  removeLolRosterEntryAction,
  removeLolTeamLogoAction,
  setLolRosterPicksAction,
  setLolTeamSeedAction,
  updateLolTeamAction,
  uploadLolTeamLogoAction,
} from '@/app/(main)/admin/lol/teamActions'
import { checkTeamLogo, TEAM_LOGO_MAX_BYTES } from '@/utils/lol/teamLogo'
import {
  cleanNewTeam,
  LOL_REGIONS,
  NEW_TAG_RE,
  newTeamProblems,
  parseTeamBatch,
  teamSlug,
  type BatchProblem,
  type BatchRow,
} from '@/utils/lol/teamCreate'
import TeamLogo from './TeamLogo'
import type { AdminRosterEntry, AdminTeamRow, SeedEditionOption, TeamActionResult, TeamAuditRow } from './adminTeamsTypes'
import { ROLE_LABEL, parseRosterPaste, type LolRole, type RosterProblem } from '@/utils/lol/roster'
import type { Champion } from '@/utils/lol/champions'

// Pestaña Equipos de /admin (LoL). Valida en el navegador para avisar antes
// de enviar (mismas reglas que el servidor y la BD, que vuelven a validar) y
// guarda con teamActions.ts: alta (uno o en lote), datos y logo.

const fieldClass = 'text-sm bg-bg-muted border border-border rounded-md px-2 py-1.5 text-text-primary min-w-0 w-full'
const btn = 'px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50 shrink-0'
const btnPrimary = `${btn} bg-accent bg-accent-gradient text-on-accent shadow-glow-accent disabled:shadow-none`
const btnPlain = `${btn} border border-border text-text-primary hover:border-accent/50 hover:text-accent`
const btnDanger = `${btn} border border-danger/40 text-danger hover:bg-danger/10`

const TAG_RE = /^[A-Z0-9]{2,6}$/
const COLOR_RE = /^#[0-9a-f]{6}$/

const DATE_LOCALE: Record<string, string> = { es: 'es-ES', en: 'en-GB', ro: 'ro-RO' }
const timeFmt = (lang: string) => new Intl.DateTimeFormat(DATE_LOCALE[lang] ?? 'es-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
})

type T = (key: string, vars?: Record<string, string | number>) => string

function errorText(t: T, lang: string, res: Extract<TeamActionResult, { error: string }>, fileSize?: number): string {
  const key = `adminTeams.errors.${res.error}`
  if (res.error === 'TOO_BIG') return t(key, { kb: Math.ceil((fileSize ?? TEAM_LOGO_MAX_BYTES + 1) / 1024) })
  if (res.error === 'DIMENSIONS') return t(key, { w: res.width ?? '?', h: res.height ?? '?' })
  // Los mensajes de validación de la BD están en castellano.
  if ((res.error === 'INVALID' || res.error === 'DUPLICATE_TAG') && res.detail && lang === 'es') return res.detail
  return t(key)
}

/** Color opcional: casilla, selector y campo #rrggbb. */
function ColorField({ useColor, setUseColor, color, setColor, disabled, t }: {
  useColor: boolean
  setUseColor: (v: boolean) => void
  color: string
  setColor: (v: string) => void
  disabled: boolean
  t: T
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs text-text-muted">{t('adminTeams.color')}</span>
      <label className="inline-flex items-center gap-1.5 text-xs text-text-primary">
        <input type="checkbox" checked={useColor} onChange={e => setUseColor(e.target.checked)} disabled={disabled} />
        {t('adminTeams.useColor')}
      </label>
      {useColor ? (
        <span className="inline-flex items-center gap-2">
          <input
            type="color"
            aria-label={t('adminTeams.color')}
            value={COLOR_RE.test(color.toLowerCase()) ? color.toLowerCase() : '#000000'}
            onChange={e => setColor(e.target.value)}
            disabled={disabled}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-muted p-0.5"
          />
          <input
            className={`${fieldClass} !w-24 font-mono`}
            value={color}
            onChange={e => setColor(e.target.value.trim())}
            maxLength={7}
            aria-label={`${t('adminTeams.color')} (#rrggbb)`}
            disabled={disabled}
            spellCheck={false}
          />
        </span>
      ) : (
        <span className="text-xs text-text-muted">{t('adminTeams.noColor')}</span>
      )}
    </div>
  )
}

/** Archivo de logo elegido y validado en el navegador (PNG/WebP, ≤512 KB, ≤512×512, por su firma real). */
function useLogoPick(t: T, lang: string) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dims, setDims] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDims(null)
    setProblem(null)
    setInputKey(k => k + 1)
  }

  const pick = async (f: File | null) => {
    reset()
    if (!f) return
    if (f.size > TEAM_LOGO_MAX_BYTES) {
      setProblem(errorText(t, lang, { error: 'TOO_BIG' }, f.size))
      return
    }
    const check = checkTeamLogo(new Uint8Array(await f.arrayBuffer()))
    if (!check.ok) {
      setProblem(errorText(t, lang, { error: check.code, width: check.width, height: check.height }, f.size))
      return
    }
    setFile(f)
    setDims(`${check.format.toUpperCase()} · ${check.width}×${check.height} px · ${Math.ceil(f.size / 1024)} KB`)
    setPreview(URL.createObjectURL(f))
  }

  return { file, preview, dims, problem, setProblem, inputKey, pick, reset }
}

/** Botón "Elegir archivo" con el input oculto. */
function FileButton({ inputKey, onPick, disabled, t }: {
  inputKey: number
  onPick: (f: File | null) => void
  disabled: boolean
  t: T
}) {
  return (
    <label className={`${btnPlain} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {t('adminTeams.chooseFile')}
      <input
        key={inputKey}
        type="file"
        accept="image/png,image/webp"
        className="sr-only"
        onChange={e => onPick(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />
    </label>
  )
}

/** Logo en los tres tamaños de la interfaz. */
function LogoSizes({ team }: { team: { name: string; tag: string; color: string | null; logoUrl: string | null } }) {
  return (
    <>
      {(['lg', 'md', 'sm'] as const).map(size => (
        <span key={size} className="flex flex-col items-center gap-1">
          <span className="rounded-lg bg-bg-elevated p-1.5 ring-1 ring-inset ring-border">
            <TeamLogo team={team} size={size} />
          </span>
          <span className="text-[10px] uppercase text-text-muted">{size}</span>
        </span>
      ))}
    </>
  )
}

/** Nombre, siglas y color. */
function DetailsForm({ team, t, lang }: { team: AdminTeamRow; t: T; lang: string }) {
  const [name, setName] = useState(team.name)
  const [tag, setTag] = useState(team.tag)
  const [useColor, setUseColor] = useState(team.color !== null)
  const [color, setColor] = useState(team.color ?? '#3b82f6')
  const [isPending, startTransition] = useTransition()

  const cleanName = name.trim()
  const cleanTag = tag.trim().toUpperCase()
  const cleanColor = useColor ? color.toLowerCase() : ''
  const problems = [
    cleanName.length < 2 || cleanName.length > 60 ? t('adminTeams.errors.nameLength') : null,
    !TAG_RE.test(cleanTag) ? t('adminTeams.errors.tagFormat') : null,
    useColor && !COLOR_RE.test(cleanColor) ? t('adminTeams.errors.colorFormat') : null,
  ].filter((p): p is string => p !== null)
  const unchanged = cleanName === team.name && cleanTag === team.tag && (cleanColor || null) === team.color

  const save = () => {
    startTransition(async () => {
      try {
        const res = await updateLolTeamAction({ teamId: team.id, name: cleanName, tag: cleanTag, color: cleanColor })
        if ('error' in res) toast.error(errorText(t, lang, res))
        else toast.success(t('adminTeams.saved'))
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.name')}
          <input className={fieldClass} value={name} onChange={e => setName(e.target.value)} maxLength={60} disabled={isPending} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.tag')}
          <input
            className={`${fieldClass} uppercase font-semibold tracking-wide`}
            value={tag}
            onChange={e => setTag(e.target.value.toUpperCase())}
            maxLength={6}
            disabled={isPending}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
      </div>
      <ColorField useColor={useColor} setUseColor={setUseColor} color={color} setColor={setColor} disabled={isPending} t={t} />
      {problems.length > 0 && (
        <ul role="alert" className="text-xs text-danger list-disc pl-4">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={isPending || unchanged || problems.length > 0} className={`${btnPrimary} self-start`}>
          {isPending ? t('adminTeams.saving') : t('adminTeams.save')}
        </button>
        {unchanged && <span className="text-[11px] text-text-muted">{t('adminTeams.unchanged')}</span>}
      </div>
    </div>
  )
}

/** Logo: elegir archivo, avisar de errores, previsualizar, subir o quitar. */
function LogoForm({ team, t, lang }: { team: AdminTeamRow; t: T; lang: string }) {
  const { file, preview, dims, problem, setProblem, inputKey, pick, reset } = useLogoPick(t, lang)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isPending, startTransition] = useTransition()

  const upload = () => {
    if (!file) return
    const fd = new FormData()
    fd.set('teamId', String(team.id))
    fd.set('file', file)
    startTransition(async () => {
      try {
        const res = await uploadLolTeamLogoAction(fd)
        if ('error' in res) setProblem(errorText(t, lang, res, file.size))
        else {
          toast.success(t('adminTeams.logoSaved'))
          reset()
        }
      } catch {
        setProblem(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      try {
        const res = await removeLolTeamLogoAction(team.id)
        if ('error' in res) toast.error(errorText(t, lang, res))
        else toast.success(t('adminTeams.logoRemoved'))
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      } finally {
        setConfirmRemove(false)
      }
    })
  }

  const shown = { name: team.name, tag: team.tag, color: team.color, logoUrl: preview ?? team.logoUrl }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted">{t('adminTeams.logoHelp')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FileButton inputKey={inputKey} onPick={pick} disabled={isPending} t={t} />
        {file && <span className="text-xs text-text-muted min-w-0 break-all">{file.name}</span>}
        {team.logoUrl && !file && (
          confirmRemove ? (
            <span className="inline-flex gap-2">
              <button type="button" onClick={remove} disabled={isPending} className={btnDanger}>
                {isPending ? t('adminTeams.removing') : t('adminTeams.confirmRemove')}
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} disabled={isPending} className={btnPlain}>
                {t('adminTeams.cancel')}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className={btnDanger}>
              {t('adminTeams.removeLogo')}
            </button>
          )
        )}
      </div>

      {problem && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-inset ring-danger/30">{problem}</p>
      )}

      {preview && (
        <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3">
          <p className="text-xs font-semibold text-text-primary">
            {t('adminTeams.preview')} <span className="font-normal text-text-muted">· {dims}</span>
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <LogoSizes team={shown} />
            {team.logoUrl && (
              <span className="flex flex-col items-center gap-1">
                <span className="rounded-lg bg-bg-elevated p-1.5 ring-1 ring-inset ring-border opacity-70">
                  <TeamLogo team={team} size="lg" />
                </span>
                <span className="text-[10px] uppercase text-text-muted">{t('adminTeams.current')}</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted">{t('adminTeams.previewHelp')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={upload} disabled={isPending} className={btnPrimary}>
              {isPending ? t('adminTeams.uploading') : t('adminTeams.uploadLogo')}
            </button>
            <button type="button" onClick={reset} disabled={isPending} className={btnPlain}>{t('adminTeams.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Texto de un problema del alta (validación en el navegador). */
function problemText(t: T, p: BatchProblem): string {
  switch (p.code) {
    case 'tagTaken': return t('adminTeams.errors.tagTaken', { tag: p.tag, name: p.name })
    case 'slugTaken': return t('adminTeams.errors.slugTaken', { slug: p.slug, name: p.name })
    case 'dupInBatch': return t('adminTeams.errors.dupInBatch', { line: p.line })
    default: return t(`adminTeams.errors.${p.code}`)
  }
}

function RegionSelect({ value, onChange, disabled, t }: { value: string; onChange: (v: string) => void; disabled: boolean; t: T }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
      {t('adminTeams.region')}
      <select className={fieldClass} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} required>
        <option value="">{t('adminTeams.chooseRegion')}</option>
        {LOL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  )
}

/** Alta de un equipo: nombre, siglas, región, país y color opcionales, y logo opcional. */
function CreateTeamForm({ teams, onDone, t, lang }: { teams: AdminTeamRow[]; onDone: () => void; t: T; lang: string }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [region, setRegion] = useState('')
  const [country, setCountry] = useState('')
  const [useColor, setUseColor] = useState(false)
  const [color, setColor] = useState('#3b82f6')
  const [touched, setTouched] = useState(false)
  const logo = useLogoPick(t, lang)
  const [isPending, startTransition] = useTransition()

  const input = cleanNewTeam({ name, tag, region, country, color: useColor ? color : '' })
  const problems = newTeamProblems(input, teams)
  const shown = { name: input.name || '?', tag: input.tag || '?', color: input.color || null, logoUrl: logo.preview }

  const create = () => {
    setTouched(true)
    if (problems.length > 0) return
    startTransition(async () => {
      try {
        const res = await createLolTeamAction(input)
        if ('error' in res) {
          toast.error(errorText(t, lang, res))
          return
        }
        if (logo.file && res.teamId) {
          const fd = new FormData()
          fd.set('teamId', String(res.teamId))
          fd.set('file', logo.file)
          const up = await uploadLolTeamLogoAction(fd)
          if ('error' in up) {
            toast.warning(t('adminTeams.createdNoLogo', { tag: input.tag, error: errorText(t, lang, up, logo.file.size) }))
            onDone()
            return
          }
        }
        toast.success(t('adminTeams.created', { tag: input.tag }))
        onDone()
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        {t('adminTeams.addHelp', { slug: teamSlug(NEW_TAG_RE.test(input.tag) ? input.tag : t('adminTeams.tag')) })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.name')}
          <input className={fieldClass} value={name} onChange={e => setName(e.target.value)} maxLength={60} disabled={isPending} autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.tag')}
          <input
            className={`${fieldClass} uppercase font-semibold tracking-wide`}
            value={tag}
            onChange={e => setTag(e.target.value.toUpperCase())}
            maxLength={5}
            disabled={isPending}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <RegionSelect value={region} onChange={setRegion} disabled={isPending} t={t} />
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.country')}
          <input
            className={`${fieldClass} uppercase`}
            value={country}
            onChange={e => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="ES"
            title={t('adminTeams.countryHelp')}
            disabled={isPending}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
      </div>
      <ColorField useColor={useColor} setUseColor={setUseColor} color={color} setColor={setColor} disabled={isPending} t={t} />

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-xs font-semibold text-text-primary">{t('adminTeams.logoOptional')}</p>
        <p className="text-xs text-text-muted">{t('adminTeams.logoHelp')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <FileButton inputKey={logo.inputKey} onPick={logo.pick} disabled={isPending} t={t} />
          {logo.file && (
            <>
              <span className="text-xs text-text-muted min-w-0 break-all">{logo.file.name}</span>
              <button type="button" onClick={logo.reset} disabled={isPending} className={btnPlain}>{t('adminTeams.removeFile')}</button>
            </>
          )}
        </div>
        {logo.problem && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-inset ring-danger/30">{logo.problem}</p>
        )}
        <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3">
          <p className="text-xs font-semibold text-text-primary">
            {t('adminTeams.preview')}{logo.dims && <span className="font-normal text-text-muted"> · {logo.dims}</span>}
          </p>
          <div className="flex flex-wrap items-end gap-4"><LogoSizes team={shown} /></div>
        </div>
      </div>

      {touched && problems.length > 0 && (
        <ul role="alert" className="text-xs text-danger list-disc pl-4">
          {problems.map(p => <li key={p.code}>{problemText(t, p)}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={create} disabled={isPending || (touched && problems.length > 0)} className={btnPrimary}>
          {isPending ? t('adminTeams.creating') : t('adminTeams.create')}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className={btnPlain}>{t('adminTeams.cancel')}</button>
      </div>
    </div>
  )
}

/** Alta en lote: pegar "Nombre - SIGLAS", revisar la vista previa y confirmar (todos o ninguno). */
function BatchForm({ teams, onDone, t, lang }: { teams: AdminTeamRow[]; onDone: () => void; t: T; lang: string }) {
  const [text, setText] = useState('')
  const [region, setRegion] = useState('')
  const [isPending, startTransition] = useTransition()

  const rows: BatchRow[] = useMemo(() => parseTeamBatch(text, teams), [text, teams])
  const ready = rows.filter(r => r.problems.length === 0).length
  const canCreate = rows.length > 0 && ready === rows.length && region !== ''

  const confirm = () => {
    startTransition(async () => {
      try {
        const res = await createLolTeamsAction(rows.map(r => ({ name: r.name, tag: r.tag })), region)
        if ('error' in res) toast.error(errorText(t, lang, res))
        else {
          toast.success(t('adminTeams.batchCreated', { n: res.created ?? rows.length }))
          onDone()
        }
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t('adminTeams.batchHelp')}</p>
      <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
        {t('adminTeams.batchLabel')}
        <textarea
          className={`${fieldClass} min-h-28 font-mono`}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('adminTeams.batchPlaceholder')}
          disabled={isPending}
          spellCheck={false}
          rows={5}
        />
      </label>
      <div className="max-w-[12rem]"><RegionSelect value={region} onChange={setRegion} disabled={isPending} t={t} /></div>

      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">{t('adminTeams.batchEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3">
          <p className="text-xs font-semibold text-text-primary">{t('adminTeams.batchPreview', { ok: ready, n: rows.length })}</p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {rows.map(r => (
              <li key={r.line} className="flex items-start gap-2 py-1.5 min-w-0">
                <span className="w-14 shrink-0 text-[11px] text-text-muted tabular-nums pt-0.5">{t('adminTeams.batchLine', { n: r.line })}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 min-w-0">
                    {r.tag && <span className="font-bold tracking-wide text-text-primary">{r.tag}</span>}
                    <span className="truncate text-text-primary">{r.name}</span>
                    {r.problems.length === 0 && <span className="text-[11px] text-text-muted">{teamSlug(r.tag)}</span>}
                  </p>
                  {r.problems.map(p => (
                    <p key={p.code} className="text-xs text-danger">{problemText(t, p)}</p>
                  ))}
                </div>
                <span aria-hidden className={r.problems.length === 0 ? 'text-success' : 'text-danger'}>{r.problems.length === 0 ? '✓' : '✗'}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted">
            {ready === rows.length ? t('adminTeams.batchAllOrNothing') : t('adminTeams.batchFix')}
          </p>
          {region === '' && <p className="text-xs text-danger">{t('adminTeams.errors.regionRequired')}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={confirm} disabled={isPending || !canCreate} className={btnPrimary}>
          {isPending ? t('adminTeams.creating') : t('adminTeams.batchConfirm', { n: rows.length })}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className={btnPlain}>{t('adminTeams.cancel')}</button>
      </div>
    </div>
  )
}

const LEAGUE_RE = /^[A-Z0-9]{2,8}$/

/** Seed del equipo en una edición ("LCK #1"): se ve en las tarjetas de esa edición. */
function SeedForm({ team, editions, t, lang }: { team: AdminTeamRow; editions: SeedEditionOption[]; t: T; lang: string }) {
  const initial = editions.find(e => e.active)?.id ?? editions[0]?.id ?? null
  const [editionId, setEditionId] = useState<number | null>(initial)
  const current = team.seeds.find(x => x.editionId === editionId) ?? null
  const [league, setLeague] = useState(current?.league ?? '')
  const [seed, setSeed] = useState(current ? String(current.seed) : '')
  const [isPending, startTransition] = useTransition()

  const pickEdition = (id: number) => {
    setEditionId(id)
    const c = team.seeds.find(x => x.editionId === id)
    setLeague(c?.league ?? '')
    setSeed(c ? String(c.seed) : '')
  }

  const cleanLeague = league.trim().toUpperCase()
  const n = Number(seed)
  const problem = cleanLeague === '' && seed === ''
    ? null
    : !LEAGUE_RE.test(cleanLeague) || !Number.isInteger(n) || n < 1 || n > 16
      ? t('adminTeams.errors.seedFormat')
      : null
  const unchanged = (current?.league ?? '') === cleanLeague && (current ? String(current.seed) : '') === seed

  const save = (clear: boolean) => {
    if (editionId === null) return
    startTransition(async () => {
      try {
        const res = await setLolTeamSeedAction({
          editionId, teamId: team.id, league: clear ? '' : cleanLeague, seed: clear || seed === '' ? null : n,
        })
        if ('error' in res) toast.error(errorText(t, lang, res))
        else {
          toast.success(clear ? t('adminTeams.seedRemoved') : t('adminTeams.seedSaved'))
          if (clear) { setLeague(''); setSeed('') }
        }
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  if (editions.length === 0) return <p className="text-xs text-text-muted">{t('adminTeams.seedNoEditions')}</p>

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-muted">{t('adminTeams.seedHelp')}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem] gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.seedEdition')}
          <select className={fieldClass} value={editionId ?? ''} onChange={e => pickEdition(Number(e.target.value))} disabled={isPending}>
            {editions.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.seedLeague')}
          <input
            className={`${fieldClass} uppercase font-semibold`}
            value={league}
            onChange={e => setLeague(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="LCK"
            disabled={isPending}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted min-w-0">
          {t('adminTeams.seedNumber')}
          <input
            className={`${fieldClass} tabular-nums`}
            value={seed}
            onChange={e => setSeed(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            maxLength={2}
            placeholder="1"
            disabled={isPending}
          />
        </label>
      </div>
      {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => save(false)} disabled={isPending || unchanged || problem !== null || cleanLeague === ''} className={btnPrimary}>
          {isPending ? t('adminTeams.saving') : t('adminTeams.seedSave')}
        </button>
        {current && (
          <button type="button" onClick={() => save(true)} disabled={isPending} className={btnDanger}>
            {t('adminTeams.seedRemove')}
          </button>
        )}
        {current && <span className="text-xs text-text-muted">{t('adminTeams.seedCurrent', { seed: `${current.league} #${current.seed}` })}</span>}
      </div>
    </div>
  )
}

function rosterProblemText(t: T, p: RosterProblem): string {
  switch (p.code) {
    case 'team': return t('adminTeams.errors.rosterTeam', { tag: p.tag })
    case 'role': return t('adminTeams.errors.rosterRole', { role: p.role })
    case 'country': return t('adminTeams.errors.rosterCountry', { country: p.country })
    case 'duplicate': return t('adminTeams.errors.rosterDuplicate', { line: p.line })
    case 'nickname': return t('adminTeams.errors.rosterNick')
    default: return t('adminTeams.errors.rosterColumns')
  }
}

/** Carga de plantillas pegando desde el Excel, con vista previa y confirmación (todo o nada). */
function RosterImportForm({ teams, editions, onDone, t, lang }: {
  teams: AdminTeamRow[]
  editions: SeedEditionOption[]
  onDone: () => void
  t: T
  lang: string
}) {
  const [editionId, setEditionId] = useState<number | null>(editions.find(e => e.active)?.id ?? editions[0]?.id ?? null)
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(true)
  const [isPending, startTransition] = useTransition()

  const tags = useMemo(() => new Set(teams.map(tm => tm.tag.toUpperCase())), [teams])
  const rows = useMemo(() => parseRosterPaste(text, tags), [text, tags])
  const ready = rows.filter(r => r.problems.length === 0).length
  const canLoad = editionId !== null && rows.length > 0 && ready === rows.length

  const confirm = () => {
    if (editionId === null) return
    startTransition(async () => {
      try {
        const res = await importLolRosterAction(editionId, rows.map(r => ({
          team: r.team, role: r.role ?? '', nickname: r.nickname, country: r.country, realName: r.realName,
        })), replace)
        if ('error' in res) toast.error(errorText(t, lang, res))
        else {
          toast.success(t('adminTeams.rosterLoaded', { n: res.loaded ?? rows.length }))
          onDone()
        }
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }

  if (editions.length === 0) return <p className="text-sm text-text-muted">{t('adminTeams.seedNoEditions')}</p>

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t('adminTeams.rosterImportHelp')}</p>
      <label className="flex flex-col gap-1 text-xs text-text-muted max-w-xs">
        {t('adminTeams.seedEdition')}
        <select className={fieldClass} value={editionId ?? ''} onChange={e => setEditionId(Number(e.target.value))} disabled={isPending}>
          {editions.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <textarea
        className={`${fieldClass} min-h-36 font-mono text-xs`}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'NAVI\tTOP\tMaynter\tUA\nNAVI\tJUNGLE\tRhilech\tTR'}
        disabled={isPending}
        spellCheck={false}
        rows={8}
        aria-label={t('adminTeams.roster')}
      />
      <label className="inline-flex items-start gap-2 text-xs text-text-primary">
        <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} disabled={isPending} className="mt-0.5" />
        {t('adminTeams.rosterReplace')}
      </label>

      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">{t('adminTeams.rosterEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-bg-muted/60 p-3">
          <p className="text-xs font-semibold text-text-primary">{t('adminTeams.rosterPreview', { ok: ready, n: rows.length })}</p>
          <ul className="flex flex-col divide-y divide-border text-sm max-h-80 overflow-y-auto">
            {rows.map(r => (
              <li key={r.line} className="grid grid-cols-[3rem_3.5rem_4.5rem_minmax(0,1fr)_auto] items-start gap-2 py-1.5">
                <span className="text-[11px] text-text-muted tabular-nums pt-0.5">{t('adminTeams.batchLine', { n: r.line })}</span>
                <span className="font-bold text-text-primary truncate">{r.team}</span>
                <span className="text-xs text-text-muted pt-0.5">{r.role ? ROLE_LABEL[r.role as LolRole] : '—'}</span>
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">{r.nickname}{r.country && <span className="text-text-muted"> · {r.country}</span>}</span>
                  {r.problems.map(p => <span key={p.code} className="block text-xs text-danger">{rosterProblemText(t, p)}</span>)}
                </span>
                <span aria-hidden className={r.problems.length === 0 ? 'text-success' : 'text-danger'}>{r.problems.length === 0 ? '✓' : '✗'}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted">{ready === rows.length ? t('adminTeams.batchAllOrNothing') : t('adminTeams.batchFix')}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={confirm} disabled={isPending || !canLoad} className={btnPrimary}>
          {isPending ? t('adminTeams.creating') : t('adminTeams.rosterConfirm', { n: rows.length })}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className={btnPlain}>{t('adminTeams.cancel')}</button>
      </div>
    </div>
  )
}

/** Una persona de la plantilla: sus 3 mejores picks (campeones de Data Dragon) y quitarla. */
function RosterEntryRow({ entry, champions, t, lang }: { entry: AdminRosterEntry; champions: Champion[]; t: T; lang: string }) {
  const byId = useMemo(() => new Map(champions.map(c => [c.id, c.name])), [champions])
  const byName = useMemo(() => new Map(champions.flatMap(c => [[c.name.toLowerCase(), c.id], [c.id.toLowerCase(), c.id]])), [champions])
  const [picks, setPicks] = useState<string[]>(() => [0, 1, 2].map(i => byId.get(entry.picks[i] ?? '') ?? entry.picks[i] ?? ''))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isPending, startTransition] = useTransition()

  const ids = picks.map(p => p.trim()).filter(Boolean).map(p => byName.get(p.toLowerCase()) ?? (champions.length ? null : p))
  const unknown = picks.map(p => p.trim()).filter(p => p && champions.length && !byName.has(p.toLowerCase()))
  const unchanged = ids.join(',') === entry.picks.join(',')

  const save = () => {
    startTransition(async () => {
      try {
        const res = await setLolRosterPicksAction(entry.rosterId, ids.filter((x): x is string => !!x))
        if ('error' in res) toast.error(errorText(t, lang, res))
        else toast.success(t('adminTeams.picksSaved'))
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      }
    })
  }
  const remove = () => {
    startTransition(async () => {
      try {
        const res = await removeLolRosterEntryAction(entry.rosterId)
        if ('error' in res) toast.error(errorText(t, lang, res))
        else toast.success(t('adminTeams.rosterRemoved'))
      } catch {
        toast.error(t('adminTeams.errors.NETWORK'))
      } finally {
        setConfirmRemove(false)
      }
    })
  }

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <p className="text-sm text-text-primary">
        <span className="inline-block w-16 text-[11px] font-bold uppercase text-text-muted">{ROLE_LABEL[entry.role as LolRole] ?? entry.role}</span>
        <strong>{entry.nickname}</strong>{entry.country && <span className="text-text-muted"> · {entry.country}</span>}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {picks.map((p, i) => (
          <input
            key={i}
            className={fieldClass}
            value={p}
            list="lol-champions"
            onChange={e => setPicks(v => v.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={t('adminTeams.picksPlaceholder')}
            aria-label={`${t('adminTeams.picks')} ${i + 1} · ${entry.nickname}`}
            disabled={isPending}
            spellCheck={false}
          />
        ))}
      </div>
      {unknown.length > 0 && <p role="alert" className="text-xs text-danger">{t('adminTeams.errors.picksUnknown', { name: unknown.join(', ') })}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={isPending || unchanged || unknown.length > 0} className={btnPrimary}>
          {t('adminTeams.picksSave')}
        </button>
        {confirmRemove ? (
          <>
            <button type="button" onClick={remove} disabled={isPending} className={btnDanger}>{t('adminTeams.rosterRemoveConfirm')}</button>
            <button type="button" onClick={() => setConfirmRemove(false)} disabled={isPending} className={btnPlain}>{t('adminTeams.cancel')}</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} disabled={isPending} className={btnDanger}>{t('adminTeams.rosterRemove')}</button>
        )}
      </div>
    </li>
  )
}

/** Plantilla del equipo en una edición (se carga desde "Cargar plantillas"). */
function RosterEditor({ team, editions, champions, t, lang }: {
  team: AdminTeamRow
  editions: SeedEditionOption[]
  champions: Champion[]
  t: T
  lang: string
}) {
  const [editionId, setEditionId] = useState<number | null>(editions.find(e => e.active)?.id ?? editions[0]?.id ?? null)
  const entries = team.roster.filter(r => r.editionId === editionId)
  if (editions.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-text-muted max-w-xs">
        {t('adminTeams.seedEdition')}
        <select className={fieldClass} value={editionId ?? ''} onChange={e => setEditionId(Number(e.target.value))}>
          {editions.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">{t('adminTeams.rosterNone')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map(e => (
            <RosterEntryRow key={`${e.rosterId}:${e.picks.join(',')}`} entry={e} champions={champions} t={t} lang={lang} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TeamCard({ team, open, onToggle, editions, champions, t, lang }: {
  team: AdminTeamRow
  open: boolean
  onToggle: () => void
  editions: SeedEditionOption[]
  champions: Champion[]
  t: T
  lang: string
}) {
  return (
    <li className="bg-bg-elevated border border-border rounded-card shadow-card p-3 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <TeamLogo team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary truncate">{team.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="font-bold text-text-primary tracking-wide">{team.tag}</span>
            {team.color && (
              <span className="inline-flex items-center gap-1 font-mono">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-border" style={{ backgroundColor: team.color }} />
                {team.color}
              </span>
            )}
            <span>{t('adminTeams.matches', { n: team.matches })}</span>
            {!team.logoUrl && <span className="text-warning">{t('adminTeams.noLogo')}</span>}
          </p>
        </div>
        <button type="button" onClick={onToggle} className={btnPlain} aria-expanded={open}>
          {open ? t('adminTeams.close') : t('adminTeams.edit')}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-border pt-3">
          <DetailsForm team={team} t={t} lang={lang} />
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-xs font-semibold text-text-primary">{t('adminTeams.seed')}</p>
            <SeedForm key={team.seeds.map(x => `${x.editionId}:${x.league}${x.seed}`).join(',')} team={team} editions={editions} t={t} lang={lang} />
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-xs font-semibold text-text-primary">{t('adminTeams.roster')}</p>
            <RosterEditor team={team} editions={editions} champions={champions} t={t} lang={lang} />
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-xs font-semibold text-text-primary">{t('adminTeams.logo')}</p>
            <LogoForm key={team.logoUrl ?? 'none'} team={team} t={t} lang={lang} />
          </div>
        </div>
      )}
    </li>
  )
}

export default function AdminLolTeams({ teams, audit, editions, champions }: {
  teams: AdminTeamRow[]
  audit: TeamAuditRow[]
  editions: SeedEditionOption[]
  champions: Champion[]
}) {
  const { t, lang } = useLang()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [adding, setAdding] = useState<'one' | 'batch' | 'roster' | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? teams.filter(tm => tm.name.toLowerCase().includes(q) || tm.tag.toLowerCase().includes(q)) : teams
  }, [teams, query])

  const fieldLabel: Record<TeamAuditRow['changes'][number]['field'], string> = {
    name: t('adminTeams.name'),
    tag: t('adminTeams.tag'),
    color: t('adminTeams.color'),
    logo: t('adminTeams.logo'),
    region: t('adminTeams.region'),
    country: t('adminTeams.country'),
    league: t('adminTeams.seedLeague'),
    seed: t('adminTeams.seedNumber'),
  }
  const fmt = timeFmt(lang)
  const value = (field: string, v: string | null) =>
    v === null ? '—' : field === 'logo' ? v.slice(v.lastIndexOf('/') + 1) : v

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading-display text-xl font-bold text-text-primary">{t('adminTeams.title')}</h1>
        <p className="text-sm text-text-muted">{t('adminTeams.intro')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('adminTeams.search')}
          aria-label={t('adminTeams.search')}
          className={`${fieldClass} sm:max-w-xs`}
        />
        <span className="text-xs text-text-muted">{t('adminTeams.count', { n: shown.length })}</span>
        <div className="flex gap-2 sm:ml-auto">
          <button type="button" onClick={() => setAdding(adding === 'one' ? null : 'one')} className={btnPrimary} aria-expanded={adding === 'one'}>
            + {t('adminTeams.add')}
          </button>
          <button type="button" onClick={() => setAdding(adding === 'batch' ? null : 'batch')} className={btnPlain} aria-expanded={adding === 'batch'}>
            {t('adminTeams.batch')}
          </button>
          <button type="button" onClick={() => setAdding(adding === 'roster' ? null : 'roster')} className={btnPlain} aria-expanded={adding === 'roster'}>
            {t('adminTeams.rosterImport')}
          </button>
        </div>
      </div>

      {adding && (
        <section className="bg-bg-elevated border border-accent/40 rounded-card shadow-card p-3 sm:p-4 flex flex-col gap-3 min-w-0">
          <h2 className="heading-display font-bold text-text-primary">
            {adding === 'one' ? t('adminTeams.addTitle') : adding === 'batch' ? t('adminTeams.batch') : t('adminTeams.rosterImport')}
          </h2>
          {adding === 'one'
            ? <CreateTeamForm teams={teams} onDone={() => setAdding(null)} t={t} lang={lang} />
            : adding === 'batch'
              ? <BatchForm teams={teams} onDone={() => setAdding(null)} t={t} lang={lang} />
              : <RosterImportForm teams={teams} editions={editions} onDone={() => setAdding(null)} t={t} lang={lang} />}
        </section>
      )}

      {/* Campeones para los picks (Data Dragon). */}
      <datalist id="lol-champions">
        {champions.map(c => <option key={c.id} value={c.name} />)}
      </datalist>

      {teams.length === 0 ? (
        <p className="text-sm text-text-muted">{t('adminTeams.noTeams')}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-muted">{t('adminTeams.noResults')}</p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {shown.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              open={open === team.id}
              onToggle={() => setOpen(open === team.id ? null : team.id)}
              editions={editions}
              champions={champions}
              t={t}
              lang={lang}
            />
          ))}
        </ul>
      )}

      <section className="bg-bg-elevated border border-border rounded-card shadow-card p-4 flex flex-col gap-3">
        <h2 className="heading-display font-bold text-text-primary">{t('adminTeams.audit.title')}</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-text-muted">{t('adminTeams.audit.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {audit.map(a => (
              <li key={a.id} className="py-2 flex flex-col gap-0.5 min-w-0">
                <p className="text-text-primary">
                  <strong>{a.team}</strong> · {t(`adminTeams.audit.${a.action}`)}{a.edition && ` (${a.edition})`}
                </p>
                {a.changes.map(c => (
                  <p key={c.field} className="text-xs text-text-muted break-all">
                    {fieldLabel[c.field]}: {value(c.field, c.before)} → <span className="text-text-primary">{value(c.field, c.after)}</span>
                  </p>
                ))}
                <p className="text-xs text-text-muted">
                  <time dateTime={a.at}>{fmt.format(new Date(a.at))}</time> · {t('adminTeams.audit.by', { actor: a.actor })}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-text-muted">{t('adminTeams.audit.footer')}</p>
      </section>
    </div>
  )
}
