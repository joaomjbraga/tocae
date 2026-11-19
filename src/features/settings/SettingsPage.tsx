import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  Info,
  Keyboard,
  Languages,
  Monitor,
  Palette,
  Play,
  Repeat,
  Settings,
} from 'lucide-react'
import { LOCALE_NAMES, SUPPORTED_LOCALES } from '@shared/i18n'
import { useI18n } from '../../i18n'
import type { PlaybackPreferences } from '../player/playbackPreferences'
import AboutSection from './AboutSection'
import AppearanceSection from './AppearanceSection'
import DefaultPlayerSection from './DefaultPlayerSection'
import PlaybackSection from './PlaybackSection'
import ShortcutsSection from './ShortcutsSection'
import styles from './SettingsPage.module.css'

type SettingsPageProps = PlaybackPreferences & {
  accentColor: string
  onAccentColorChange: (color: string) => void
  onAutoNextChange: (enabled: boolean) => void
  onRepeatCurrentChange: (enabled: boolean) => void
  onBack: () => void
}

const CATEGORIES = [
  {
    id: 'language',
    icon: Languages,
    title: 'language.button',
    description: 'settings.languageDescription',
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
    id: 'playback',
    icon: Repeat,
    title: 'settings.playbackTitle',
    description: 'settings.playbackDescription',
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
  autoNext,
  repeatCurrent,
  onAutoNextChange,
  onRepeatCurrentChange,
  onBack,
}: SettingsPageProps) {
  const { locale, systemLocale, source, setLocale, t } = useI18n()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('language')

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.pageHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          aria-label={t('navigation.backToPlayer')}
          title={t('navigation.backToPlayer')}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <span className={styles.headerDivider} aria-hidden="true" />
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
          {activeCategory === 'language' && (
            <section aria-labelledby="language-title">
              <header className={styles.detailHeader}>
                <Languages size={18} className={styles.detailIcon} aria-hidden="true" />
                <div>
                  <h2 id="language-title" className={styles.detailTitle}>
                    {t('language.button')}
                  </h2>
                  <p className={styles.detailDescription}>
                    {t('settings.languageDescription')}
                  </p>
                </div>
              </header>
              <div className={styles.languageChoices} role="group" aria-label={t('language.menu')}>
                <button
                  type="button"
                  className={`${styles.languageChoice} ${source === 'system' ? styles.languageChoiceActive : ''}`}
                  onClick={() => setLocale(null)}
                  aria-pressed={source === 'system'}
                >
                  <span className={styles.choiceIcon}>
                    <Monitor size={17} aria-hidden="true" />
                  </span>
                  <span className={styles.choiceCopy}>
                    <span className={styles.choiceTitle}>{t('language.system')}</span>
                    <span className={styles.choiceDescription}>
                      {t('language.systemHint', { locale: LOCALE_NAMES[systemLocale] })}
                    </span>
                  </span>
                  {source === 'system' && (
                    <Check size={16} className={styles.choiceCheck} aria-hidden="true" />
                  )}
                </button>

                {SUPPORTED_LOCALES.map((option) => {
                  const selected = source === 'user' && locale === option
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.languageChoice} ${selected ? styles.languageChoiceActive : ''}`}
                      onClick={() => setLocale(option)}
                      aria-pressed={selected}
                    >
                      <span className={styles.choiceIcon}>
                        <Languages size={17} aria-hidden="true" />
                      </span>
                      <span className={styles.choiceCopy}>
                        <span className={styles.choiceTitle}>{LOCALE_NAMES[option]}</span>
                        <span className={styles.choiceDescription}>{option}</span>
                      </span>
                      {selected && (
                        <Check size={16} className={styles.choiceCheck} aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          {activeCategory === 'appearance' && (
            <AppearanceSection
              accentColor={accentColor}
              onAccentColorChange={onAccentColorChange}
            />
          )}
          {activeCategory === 'shortcuts' && <ShortcutsSection />}
          {activeCategory === 'default-player' && <DefaultPlayerSection />}
          {activeCategory === 'playback' && (
            <PlaybackSection
              autoNext={autoNext}
              repeatCurrent={repeatCurrent}
              onAutoNextChange={onAutoNextChange}
              onRepeatCurrentChange={onRepeatCurrentChange}
            />
          )}
          {activeCategory === 'about' && <AboutSection />}
        </div>
      </div>
    </section>
  )
}

export default SettingsPage
