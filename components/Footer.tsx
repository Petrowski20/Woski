export default function Footer() {
  return (
    <footer className="w-full py-6 mt-10 border-t border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50">
      <div className="container mx-auto px-4 flex justify-center text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} Woski</p>
      </div>
    </footer>
  )
}
