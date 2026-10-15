'use client'

import { useState } from 'react'
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

// Logo del equipo (bucket team-logos). Sin logo, o si no carga, una
// insignia con las siglas sobre el color del equipo; si no tiene color, el
// del lado (team-a / team-b) o el neutro del tema.
export default function TeamLogo({ team, size = 'md', side, className = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const box = `${BOX[size]} shrink-0 ${className}`

  if (team.logoUrl && failed !== team.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos pequeños de tamaño fijo, sin optimizar (igual que las banderas)
      <img
        src={team.logoUrl}
        alt={team.name}
        className={`${box} object-contain`}
        loading="lazy"
        onError={() => setFailed(team.logoUrl)}
      />
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
