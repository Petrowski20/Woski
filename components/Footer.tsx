export default function Footer() {
  return (
    <footer className="w-full py-6 mt-10 border-t border-border bg-bg-surface/60">
      <div className="container mx-auto px-4 flex justify-center text-sm text-text-muted">
        <p>© {new Date().getFullYear()} Woski</p>
      </div>
    </footer>
  )
}
