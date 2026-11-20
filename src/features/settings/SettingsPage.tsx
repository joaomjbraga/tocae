import { useState } from 'react'
import {
  Info,
  Keyboard,
  Languages,
  Palette,
  Play,
  Settings,
  BrainCircuit,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import AboutSection from './AboutSection'
import AppearanceSection from './AppearanceSection'
import DefaultPlayerSection from './DefaultPlayerSection'
import LanguageSection from './LanguageSection'
import ShortcutsSection from './ShortcutsSection'
import AiSection from './AiSection'
import styles from './SettingsPage.module.css'

type SettingsPageProps = {
  accentColor: string
  onAccentColorChange: (color: string) => void
}

const CATEGORIES = [
  {
    id: 'language',
    icon: Languages,
    title: 'language.button',
    description: 'settings.languageDescription',
  },
  {
    id: 'ai',
    icon: BrainCircuit,
    title: 'assistant.title',
    description: 'settings.aiDescription',
  },
  {
    id: 'appearance',
    icon: Palette,
    title: 'appearance.title',
    description: 'appearance.description',
  },
  {
    id: 'shortcuts',
    icon: Keyboard,
    title: 'shortcuts.title',
    description: 'settings.shortcutsDescription',
  },
  {
    id: 'default-player',
    icon: Play,
    title: 'defaultPlayer.title',
    description: 'settings.defaultPlayerDescription',
  },
  {
    id: 'about',
    icon: Info,
    title: 'about.title',
    description: 'about.description',
  },
] as const

type SettingsCategory = (typeof CATEGORIES)[number]['id']

function SettingsPage({
  accentColor,
  onAccentColorChange,
}: SettingsPageProps) {
  const { t } = useI18n()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('language')

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.pageHeader}>
        <Settings size={18} className={styles.pageIcon} aria-hidden="true" />
        <div>
          <h1 id="settings-title" className={styles.title}>
            {t('settings.title')}
          </h1>
          <p className={styles.description}>{t('settings.description')}</p>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.categoryNav} aria-label={t('settings.title')}>
          {CATEGORIES.map(({ id, icon: Icon, title, description }) => (
            <button
              key={id}
              type="button"
              className={`${styles.categoryButton} ${activeCategory === id ? styles.categoryActive : ''}`}
              onClick={() => setActiveCategory(id)}
              aria-current={activeCategory === id ? 'page' : undefined}
            >
              <span className={styles.categoryIcon}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className={styles.categoryCopy}>
                <span className={styles.categoryTitle}>{t(title)}</span>
                <span className={styles.categoryDescription}>{t(description)}</span>
              </span>
            </button>
          ))}
        </nav>

        <div
          key={activeCategory}
          className={styles.detailPane}
          role="region"
          aria-labelledby={`${activeCategory}-title`}
          tabIndex={0}
        >
          {activeCategory === 'language' && <LanguageSection />}
          {activeCategory === 'ai' && <AiSection />}
          {activeCategory === 'appearance' && (
            <AppearanceSection
              accentColor={accentColor}
              onAccentColorChange={onAccentColorChange}
            />
          )}
          {activeCategory === 'shortcuts' && <ShortcutsSection />}
          {activeCategory === 'default-player' && <DefaultPlayerSection />}
          {activeCategory === 'about' && <AboutSection />}
        </div>
      </div>
    </section>
  )
}

export default SettingsPage
