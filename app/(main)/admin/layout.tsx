// La navegación (deporte y pestañas) la pinta /admin/page.tsx, que es quien
// conoce ?deporte=…&tab=…; las rutas antiguas solo redirigen.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>
}
