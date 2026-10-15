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

export type TeamActionError = Extract<TeamActionResult, { error: TeamErrorCode }>

/** Vista previa del logo ya procesado por el servidor (PNG 256×256). */
export type TeamLogoPreviewResult =
  | {
      success: true
      dataUrl: string
      /** Peso del PNG procesado. */
      bytes: number
      /** Dimensiones del archivo original y de la caja tras recortar. */
      source: { width: number; height: number }
      trimmed: { width: number; height: number }
    }
  | TeamActionError

export interface AdminTeamRow {
  id: number
  name: string
  tag: string
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
  action: 'update_team' | 'set_team_logo' | 'remove_team_logo'
  /** Campos que cambiaron, antes y después (logo: URL). */
  changes: { field: 'name' | 'tag' | 'color' | 'logo'; before: string | null; after: string | null }[]
}
