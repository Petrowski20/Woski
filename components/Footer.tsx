const links = [
  { label: 'Calendario FIFA', href: '#' },
  { label: 'Alineaciones', href: '#' },
  { label: 'Dónde verlo por TV', href: '#' },
]

export default function Footer() {
  return (
    <footer className="w-full py-6 mt-10 border-t border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div>
          <p>© 2026 POLLAMUNDIALISTA. Creado para el grupo.</p>
        </div>
        
        <nav className="flex flex-wrap justify-center gap-4">
          <a 
            href="https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=ES&wtw-filter=ALL" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>🗓️</span> Calendario FIFA
          </a>
          <a 
            href="https://www.dataredonda.com/simulador-mundial" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>📊</span> Simulador
          </a>
          <a 
            href="https://www.rtve.es/play/deportes/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>📺</span> RTVE Play
          </a>
          <a 
            href="https://www.fctv33hd.hair/es/football.html" /* Enlace pirata */
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>🏴‍☠️</span> Alternativa
          </a>
        </nav>
      </div>
    </footer>
  )
}
