import type { TeamLogoErrorCode } from '@/utils/lol/teamLogo'

// Tipos compartidos entre la pestaña Equipos (servidor), sus acciones y el
// componente cliente. Los errores van como código y la interfaz los traduce.

export type TeamErrorCode =
  | TeamLogoErrorCode
  | 'AUTH'
  | 'FORBIDDEN'
  | 'INVALID'
  | 'DUPLICATE_TAG'
  | 'UPLOAD'
  | 'SERVER'
  | 'NETWORK'

export type TeamActionResult =
  | { success: true }
  | { error: TeamErrorCode; detail?: string; width?: number; height?: number }

export interface AdminTeamRow {
  id: number
  name: string
  tag: string
  /** teams.slug ("lol-g2"); para avisar de un slug ocupado al crear. */
  slug: string | null
  color: string | null
  logoUrl: string | null
  /** Series de LoL en las que juega (para saber si está en uso). */
  matches: number
}

export interface TeamAuditRow {
  id: number
  at: string
  team: string
  actor: string
  action: 'create_team' | 'update_team' | 'set_team_logo' | 'remove_team_logo'
  /** Campos que cambiaron, antes y después (logo: URL; en un alta, antes = null). */
  changes: { field: 'name' | 'tag' | 'color' | 'logo' | 'region' | 'country'; before: string | null; after: string | null }[]
}
