'use client'

import { useState } from 'react'
import { teamTextColor, type TeamLogoMode } from '@/utils/lol/teamLogo'

export type TeamLogoSize = 'sm' | 'md' | 'lg'

interface Props {
  team: { name: string; tag: string; logoUrl: string | null; logoMode?: TeamLogoMode; color?: string | null }
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

// Logo del equipo (bucket team-logos), según teams.logo_mode:
// - color: la imagen tal cual.
// - mono: su alfa como máscara, pintada con el color de texto del tema
//   (negro en claro, blanco en oscuro).
// - plate: sobre una placa oscura fija, igual en los dos temas.
// Sin logo, o si no carga, una insignia con las siglas sobre el color del
// equipo; si no tiene color, el del lado (team-a / team-b) o el neutro del tema.
export default function TeamLogo({ team, size = 'md', side, className = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null)
  const box = `${BOX[size]} shrink-0 ${className}`

  if (team.logoUrl && failed !== team.logoUrl) {
    const url = team.logoUrl
    const img = (cls: string) => (
      // eslint-disable-next-line @next/next/no-img-element -- logos pequeños de tamaño fijo, sin optimizar (igual que las banderas)
      <img src={url} alt={team.name} className={`${cls} object-contain`} loading="lazy" onError={() => setFailed(url)} />
    )

    if (team.logoMode === 'mono') {
      const mask = `url("${url}") center / contain no-repeat`
      return (
        <span
          role="img"
          aria-label={team.name}
          title={team.name}
          style={{ mask, WebkitMask: mask }}
          className={`${box} inline-block bg-current text-text-primary`}
        >
          {/* Sin carga visible: solo para enterarse si el archivo no llega y pasar a las siglas. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- invisible, solo detecta el error de carga */}
          <img src={url} alt="" aria-hidden className="hidden" onError={() => setFailed(url)} />
        </span>
      )
    }

    if (team.logoMode === 'plate') {
      return (
        // El margen va en el tamaño de la imagen: un padding en % se calcula sobre el ancho del padre.
        <span title={team.name} className={`${box} inline-flex items-center justify-center bg-neutral-900 ring-1 ring-inset ring-white/10`}>
          {img('w-[76%] h-[76%]')}
        </span>
      )
    }

    return img(box)
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
