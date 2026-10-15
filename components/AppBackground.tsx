// Fondo global decorativo: cuadrícula sutil y resplandores radiales en las
// esquinas. Solo gradientes CSS (sin imágenes); los colores salen de los
// tokens --bg-* de app/styles/theme.css, así que cada tema tiene el suyo.
export default function AppBackground() {
  return <div aria-hidden className="app-background" />
}
