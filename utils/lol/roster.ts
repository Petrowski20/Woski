// Plantillas de LoL: roles y lectura de lo que se pega desde el Excel en
// /admin (pestaña Equipos). La BD vuelve a validar al guardar
// (admin_import_lol_roster, 20261026100001).

export const ROLES = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT', 'COACH'] as const
export type LolRole = (typeof ROLES)[number]

export const ROLE_LABEL: Record<LolRole, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MID: 'Mid',
  ADC: 'ADC',
  SUPPORT: 'Support',
  COACH: 'Coach',
}

const ROLE_ALIASES: Record<string, LolRole> = {
  TOP: 'TOP', TOPLANE: 'TOP', TOPLANER: 'TOP',
  JUNGLE: 'JUNGLE', JUNGLA: 'JUNGLE', JG: 'JUNGLE', JGL: 'JUNGLE', JUNGLER: 'JUNGLE',
  MID: 'MID', MIDDLE: 'MID', MIDLANE: 'MID', MIDLANER: 'MID',
  ADC: 'ADC', ADCARRY: 'ADC', AD: 'ADC', BOT: 'ADC', BOTTOM: 'ADC', MARKSMAN: 'ADC',
  SUPPORT: 'SUPPORT', SUP: 'SUPPORT', SUPP: 'SUPPORT', SOPORTE: 'SUPPORT',
  COACH: 'COACH', ENTRENADOR: 'COACH', HEADCOACH: 'COACH',
}

/** Rol a partir de lo escrito en el Excel ("ADCARRY", "Jungla", "head coach"…); null si no se reconoce. */
export function parseRole(raw: string): LolRole | null {
  return ROLE_ALIASES[raw.trim().toUpperCase().replace(/[\s_-]+/g, '')] ?? null
}

/** Orden de los roles en una plantilla. */
export const roleOrder = (role: string) => {
  const i = (ROLES as readonly string[]).indexOf(role)
  return i === -1 ? ROLES.length : i
}

export type RosterProblem =
  | { code: 'columns' }
  | { code: 'team'; tag: string }
  | { code: 'role'; role: string }
  | { code: 'nickname' }
  | { code: 'country'; country: string }
  | { code: 'league'; league: string }
  | { code: 'duplicate'; line: number }

export interface RosterLine {
  /** Línea del texto pegado (1 = primera). */
  line: number
  team: string
  role: LolRole | null
  nickname: string
  country: string
  realName: string
  /** Liga del equipo (opcional), en mayúsculas. */
  league: string
  problems: RosterProblem[]
}

/**
 * Lee lo pegado: una línea por persona, columnas EQUIPO, ROL, NICK, PAÍS
 * y, opcionales, NOMBRE REAL y LIGA, separadas por tabulador (copiar del Excel),
 * "|" o ";". Se ignoran las líneas vacías y una cabecera ("Equipo…").
 * knownTags: siglas de los equipos de LoL (en mayúsculas).
 */
export function parseRosterPaste(text: string, knownTags: Set<string>): RosterLine[] {
  const out: RosterLine[] = []
  const seen = new Map<string, number>()
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '') return
    const cols = raw.split(/\t|\||;/).map(c => c.trim())
    if (i === 0 && /^(equipo|team)$/i.test(cols[0] ?? '')) return
    const [team = '', role = '', nickname = '', country = '', realName = '', league = ''] = cols
    const problems: RosterProblem[] = []
    const tag = team.toUpperCase()
    const r = parseRole(role)
    const cc = country.toUpperCase()
    const lg = league.toUpperCase()
    if (cols.length < 3) problems.push({ code: 'columns' })
    else {
      if (!knownTags.has(tag)) problems.push({ code: 'team', tag: team })
      if (!r) problems.push({ code: 'role', role })
      if (nickname.length < 1 || nickname.length > 30) problems.push({ code: 'nickname' })
      if (cc !== '' && !/^[A-Z]{2}$/.test(cc)) problems.push({ code: 'country', country })
      if (lg !== '' && !/^[A-Z0-9]{2,8}$/.test(lg)) problems.push({ code: 'league', league })
      const key = nickname.toLowerCase()
      const first = seen.get(key)
      if (key && first !== undefined) problems.push({ code: 'duplicate', line: first })
      else if (key) seen.set(key, i + 1)
    }
    out.push({ line: i + 1, team: tag, role: r, nickname, country: cc, realName, league: lg, problems })
  })
  return out
}

/** Bandera (flagcdn, como el resto de la web) de un código ISO de 2 letras; null si no hay. */
export function flagUrl(country: string | null | undefined): string | null {
  return country && /^[A-Za-z]{2}$/.test(country) ? `https://flagcdn.com/w40/${country.toLowerCase()}.png` : null
}
