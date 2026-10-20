// Alta de equipos de LoL en /admin: validación en el navegador (avisar antes
// de enviar) y lectura del alta en lote "Nombre - SIGLAS". Son las mismas
// reglas que admin_create_lol_team (20261022100001), que vuelve a validar.

/** Regiones que admite admin_create_lol_team (teams.metadata.region). */
export const LOL_REGIONS = ['EMEA', 'NA', 'BR', 'KR', 'CN', 'APAC'] as const
export type LolRegion = (typeof LOL_REGIONS)[number]

export const NEW_TAG_RE = /^[A-Z0-9]{2,5}$/
export const COUNTRY_RE = /^[A-Z]{2}$/
export const COLOR_RE = /^#[0-9a-f]{6}$/

/** Slug que genera la BD: "lol-" + siglas en minúscula. */
export const teamSlug = (tag: string) => `lol-${tag.trim().toLowerCase()}`

/** Equipo existente, para avisar de siglas o slug ocupados. */
export interface ExistingTeam {
  name: string
  tag: string
  slug: string | null
}

export type NewTeamProblem =
  | { code: 'nameLength' }
  | { code: 'tagFormatNew' }
  | { code: 'regionRequired' }
  | { code: 'countryFormat' }
  | { code: 'colorFormat' }
  | { code: 'tagTaken'; tag: string; name: string }
  | { code: 'slugTaken'; slug: string; name: string }

export interface NewTeamInput {
  name: string
  tag: string
  region: string
  country: string
  /** '#rrggbb' o '' sin color. */
  color: string
}

/** Datos limpios como los guarda la BD (trim, mayúsculas, color en minúsculas). */
export function cleanNewTeam(input: NewTeamInput): NewTeamInput {
  return {
    name: input.name.trim(),
    tag: input.tag.trim().toUpperCase(),
    region: input.region.trim().toUpperCase(),
    country: input.country.trim().toUpperCase(),
    color: input.color.trim().toLowerCase(),
  }
}

/** Siglas u slug ya usados por otro equipo de LoL. */
function takenProblems(tag: string, existing: ExistingTeam[]): NewTeamProblem[] {
  const out: NewTeamProblem[] = []
  const sameTag = existing.find(t => t.tag.toUpperCase() === tag)
  if (sameTag) out.push({ code: 'tagTaken', tag, name: sameTag.name })
  const slug = teamSlug(tag)
  const sameSlug = existing.find(t => t.slug === slug)
  if (sameSlug && !sameTag) out.push({ code: 'slugTaken', slug, name: `${sameSlug.name} (${sameSlug.tag})` })
  return out
}

export function newTeamProblems(raw: NewTeamInput, existing: ExistingTeam[]): NewTeamProblem[] {
  const v = cleanNewTeam(raw)
  const out: NewTeamProblem[] = []
  if (v.name.length < 2 || v.name.length > 60) out.push({ code: 'nameLength' })
  if (!NEW_TAG_RE.test(v.tag)) out.push({ code: 'tagFormatNew' })
  else out.push(...takenProblems(v.tag, existing))
  if (!(LOL_REGIONS as readonly string[]).includes(v.region)) out.push({ code: 'regionRequired' })
  if (v.country !== '' && !COUNTRY_RE.test(v.country)) out.push({ code: 'countryFormat' })
  if (v.color !== '' && !COLOR_RE.test(v.color)) out.push({ code: 'colorFormat' })
  return out
}

export type BatchProblem = NewTeamProblem | { code: 'lineFormat' } | { code: 'dupInBatch'; line: number }

export interface BatchRow {
  /** Línea del texto pegado (1 = primera). */
  line: number
  name: string
  tag: string
  problems: BatchProblem[]
}

/**
 * Lee el alta en lote: una línea por equipo, "Nombre - SIGLAS" (también
 * vale – o —). Se parte por el ÚLTIMO guion rodeado de espacios, así el
 * nombre puede llevar guiones. Las líneas vacías se ignoran.
 */
export function parseTeamBatch(text: string, existing: ExistingTeam[]): BatchRow[] {
  const rows: BatchRow[] = []
  const seen = new Map<string, number>()
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const lineText = rawLine.trim()
    if (lineText === '') return
    const m = lineText.match(/^(.*\S)\s+[-–—]\s+(\S+)$/)
    if (!m) {
      rows.push({ line: i + 1, name: lineText, tag: '', problems: [{ code: 'lineFormat' }] })
      return
    }
    const name = m[1].trim()
    const tag = m[2].toUpperCase()
    const problems: BatchProblem[] = newTeamProblems({ name, tag, region: LOL_REGIONS[0], country: '', color: '' }, existing)
    const first = seen.get(tag)
    if (first !== undefined && NEW_TAG_RE.test(tag)) problems.push({ code: 'dupInBatch', line: first })
    else seen.set(tag, i + 1)
    rows.push({ line: i + 1, name, tag, problems })
  })
  return rows
}
