import Image from 'next/image'

// Logotipo de Woski. Hoy es un wordmark de texto (Rajdhani, color de marca).
// Para usar el logotipo definitivo: deja el archivo en /public y rellena
// BRAND_LOGO con su ruta y su proporción (ancho / alto). No hace falta tocar
// nada más: todas las pantallas usan este componente.
const BRAND_LOGO: { src: string; aspectRatio: number } | null = null

type Size = 'sm' | 'md' | 'lg'

const TEXT_SIZE: Record<Size, string> = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-5xl sm:text-6xl',
}

// Alto en px del logotipo de imagen (ancho = alto × proporción).
const IMAGE_HEIGHT: Record<Size, number> = { sm: 28, md: 36, lg: 64 }

export default function BrandLogo({ size = 'sm', className = '' }: { size?: Size; className?: string }) {
  if (BRAND_LOGO) {
    const height = IMAGE_HEIGHT[size]
    return (
      <Image
        src={BRAND_LOGO.src}
        alt="Woski"
        width={Math.round(height * BRAND_LOGO.aspectRatio)}
        height={height}
        className={`shrink-0 ${className}`}
        unoptimized
        priority
      />
    )
  }

  return (
    <span
      className={`inline-block shrink-0 font-display font-bold uppercase leading-none tracking-[0.12em] bg-accent-gradient bg-clip-text text-transparent forced-colors:text-[CanvasText] dark:drop-shadow-[0_0_10px_var(--glow-accent-soft)] ${TEXT_SIZE[size]} ${className}`}
    >
      Woski
    </span>
  )
}
