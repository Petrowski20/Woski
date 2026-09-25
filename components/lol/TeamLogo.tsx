interface Props {
  name: string
  tag: string
  logoUrl: string | null
  side: 'a' | 'b'
  size?: 'md' | 'sm'
}

// Logo del equipo; si no hay logo, una insignia con las siglas en el color
// genérico del lado (team-a / team-b).
export default function TeamLogo({ name, tag, logoUrl, side, size = 'md' }: Props) {
  const box = size === 'md' ? 'w-14 h-14 text-sm' : 'w-6 h-6 text-[9px]'

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos externos de tamaño fijo, sin optimizar (igual que las banderas)
      <img src={logoUrl} alt={name} className={`${box} object-contain shrink-0`} />
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`${box} shrink-0 rounded-xl flex items-center justify-center font-black tracking-tight text-on-team ${
        side === 'a' ? 'bg-team-a' : 'bg-team-b'
      }`}
    >
      {tag}
    </span>
  )
}
