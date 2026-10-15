'use client'

import { useState, type CSSProperties } from 'react'
import { teamTextColor } from '@/utils/lol/teamLogo'

export type TeamLogoSize = 'sm' | 'md' | 'lg'

interface Props {
  team: { name: string; tag: string; logoUrl: string | null; color?: string | null }
  size?: TeamLogoSize
  /** Color genérico del lado (team-a / team-b) si el equipo no tiene color propio. */
  side?: 'a' | 'b'
  className?: string
}

const BOX: Record<TeamLogoSize, string> = {
  sm: 'w-6 h-6 rounded-md text-[8px]',
  md: 'w-10 h-10 rounded-lg text-[11px]',
  lg: 'w-14 h-14 rounded-xl text-sm',
}

// Relleno interior de la ficha (~12-15 % del lado: 3/24, 5/40, 8/56).
const PAD: Record<TeamLogoSize, string> = {
  sm: 'p-[3px]',
  md: 'p-[5px]',
  lg: 'p-2',
}

// Logo del equipo (bucket team-logos) dentro de una ficha oscura en ambos
// temas (utilidad logo-tile) con borde del color del equipo; object-contain
// iguala logos de distintas proporciones. Sin logo, o si no carga, una
// insignia con las siglas sobre el color del equipo; si no tiene color, el
// del lado (team-a / team-b) o el neutro del tema.
export default function TeamLogo({ team, size = 'md', side, className = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const box = `${BOX[size]} shrink-0 ${className}`

  if (team.logoUrl && failed !== team.logoUrl) {
    return (
      <span
        style={team.color ? ({ '--team-color': team.color } as CSSProperties) : undefined}
        className={`${box} ${PAD[size]} logo-tile inline-flex items-center justify-center`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- logos pequeños de tamaño fijo, sin optimizar (igual que las banderas) */}
        <img
          src={team.logoUrl}
          alt={team.name}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setFailed(team.logoUrl)}
        />
      </span>
    )
  }

  const tone = team.color
    ? ''
    : side === 'a'
      ? 'bg-team-a text-on-team'
      : side === 'b'
        ? 'bg-team-b text-on-team'
        : 'bg-bg-muted text-text-primary ring-1 ring-inset ring-border'
  return (
    <span
      role="img"
      aria-label={team.name}
      title={team.name}
      style={team.color ? { backgroundColor: team.color, color: teamTextColor(team.color) } : undefined}
      className={`${box} ${tone} inline-flex items-center justify-center overflow-hidden font-black tracking-tight leading-none`}
    >
      {team.tag}
    </span>
  )
}
