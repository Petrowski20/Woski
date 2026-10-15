'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLang } from '@/contexts/LangContext'
import { removeLolTeamLogoAction, updateLolTeamAction, uploadLolTeamLogoAction } from '@/app/(main)/admin/lol/teamActions'
import { checkTeamLogo, TEAM_LOGO_MAX_BYTES } from '@/utils/lol/teamLogo'
import TeamLogo from './TeamLogo'
import type { AdminTeamRow, TeamActionResult, TeamAuditRow } from './adminTeamsTypes'

// Pestaña Equipos de /admin (LoL). Valida en el navegador para avisar antes
// de enviar (mismas reglas que el servidor y la BD, que vuelven a validar) y
// guarda con teamActions.ts.

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs text-text-muted">{t('adminTeams.color')}</span>
        <label className="inline-flex items-center gap-1.5 text-xs text-text-primary">
          <input type="checkbox" checked={useColor} onChange={e => setUseColor(e.target.checked)} disabled={isPending} />
          {t('adminTeams.useColor')}
        </label>
        {useColor ? (
          <span className="inline-flex items-center gap-2">
            <input
              type="color"
              aria-label={t('adminTeams.color')}
              value={COLOR_RE.test(color.toLowerCase()) ? color.toLowerCase() : '#000000'}
              onChange={e => setColor(e.target.value)}
              disabled={isPending}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-bg-muted p-0.5"
            />
            <input
              className={`${fieldClass} !w-24 font-mono`}
              value={color}
              onChange={e => setColor(e.target.value.trim())}
              maxLength={7}
              aria-label={`${t('adminTeams.color')} (#rrggbb)`}
              disabled={isPending}
              spellCheck={false}
            />
          </span>
        ) : (
          <span className="text-xs text-text-muted">{t('adminTeams.noColor')}</span>
        )}
      </div>
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
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dims, setDims] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const [isPending, startTransition] = useTransition()

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
        <label className={`${btnPlain} cursor-pointer ${isPending ? 'pointer-events-none opacity-50' : ''}`}>
          {t('adminTeams.chooseFile')}
          <input
            key={inputKey}
            type="file"
            accept="image/png,image/webp"
            className="sr-only"
            onChange={e => pick(e.target.files?.[0] ?? null)}
            disabled={isPending}
          />
        </label>
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
            {(['lg', 'md', 'sm'] as const).map(size => (
              <span key={size} className="flex flex-col items-center gap-1">
                <span className="rounded-lg bg-bg-elevated p-1.5 ring-1 ring-inset ring-border">
                  <TeamLogo team={shown} size={size} />
                </span>
                <span className="text-[10px] uppercase text-text-muted">{size}</span>
              </span>
            ))}
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

function TeamCard({ team, open, onToggle, t, lang }: {
  team: AdminTeamRow
  open: boolean
  onToggle: () => void
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
            <p className="mb-1 text-xs font-semibold text-text-primary">{t('adminTeams.logo')}</p>
            <LogoForm key={team.logoUrl ?? 'none'} team={team} t={t} lang={lang} />
          </div>
        </div>
      )}
    </li>
  )
}

export default function AdminLolTeams({ teams, audit }: { teams: AdminTeamRow[]; audit: TeamAuditRow[] }) {
  const { t, lang } = useLang()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? teams.filter(tm => tm.name.toLowerCase().includes(q) || tm.tag.toLowerCase().includes(q)) : teams
  }, [teams, query])

  const fieldLabel: Record<TeamAuditRow['changes'][number]['field'], string> = {
    name: t('adminTeams.name'),
    tag: t('adminTeams.tag'),
    color: t('adminTeams.color'),
    logo: t('adminTeams.logo'),
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
      </div>

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
                  <strong>{a.team}</strong> · {t(`adminTeams.audit.${a.action}`)}
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
