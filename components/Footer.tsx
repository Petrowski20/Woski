import { getServerLang, tServer } from '@/utils/i18n-server'

const SIMULATORS = [
  { label: '7a0', url: 'https://7a0.com.br/es' },
  { label: '101pts', url: 'https://101pts.com/' },
  { label: '38-0', url: 'https://38-0.app/' },
]

export default async function Footer() {
  const lang = await getServerLang()
  const t = (key: string) => tServer(lang, key)

  return (
    <footer className="w-full py-6 mt-10 border-t border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <div>
          <p>{t('footer.copyright')}</p>
        </div>

        <nav className="flex flex-wrap justify-center gap-4">
          <a
            href="https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=ES&wtw-filter=ALL"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>🗓️</span> {t('footer.calendario')}
          </a>
          <a
            href="https://www.dataredonda.com/simulador-mundial"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>📊</span> {t('footer.simulador')}
          </a>
          <a
            href="https://www.rtve.es/play/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>📺</span> {t('footer.rtve')}
          </a>
          <a
            href="https://www.fctv33hd.yachts/es/football.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium flex items-center gap-1"
          >
            <span>🏴‍☠️</span> {t('footer.alternativa')}
          </a>

          {/* Separador */}
          <span className="text-gray-200 dark:text-slate-700 select-none">|</span>

          {/* Simuladores */}
          <span className="font-semibold text-gray-400 dark:text-slate-500 flex items-center gap-1">
            🎮 {t('footer.simuladores')}:
          </span>
          {SIMULATORS.map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
