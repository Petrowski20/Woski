/** Logo del club (URL externa libre) o su inicial si no tiene. */
export default function ClubLogo({ url, name, size }: { url: string | null; name: string; size: number }) {
  return (
    <div
      className="rounded-lg overflow-hidden bg-bg-muted border border-border flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL de cualquier dominio, fuera de images.remotePatterns
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-accent" style={{ fontSize: size * 0.4 }}>
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
