'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLang } from '@/contexts/LangContext'
import { NAV_LINKS } from '@/components/navLinks'

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLang()

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-accent hover:bg-bg-muted transition-colors"
        aria-label={t('mobile.navegacion')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-overlay z-50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-72 bg-bg-elevated border-l border-border z-50 shadow-raised transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="heading-display font-bold text-text-primary text-sm">{t('mobile.navegacion')}</span>
          <button
            onClick={() => setIsOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-muted transition-colors"
            aria-label="✕"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-col p-4 gap-1">
          {NAV_LINKS.map(({ href, labelKey, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-text-primary hover:bg-bg-muted hover:text-accent transition-colors"
            >
              <span className="text-base">{icon}</span>
              {t(labelKey)}
            </Link>
          ))}

        </nav>
      </div>
    </>
  )
}
