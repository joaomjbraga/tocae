import { Check, Monitor } from 'lucide-react'
import { LOCALE_NAMES, SUPPORTED_LOCALES } from '@shared/i18n'
import { useI18n } from '../../i18n'
import styles from './LanguageSection.module.css'

function LanguageSection() {
  const { locale, systemLocale, source, setLocale, t } = useI18n()

  return (
    <section className={styles.section} aria-labelledby="language-title">
      <header className={styles.header}>
        <h2 id="language-title" className={styles.title}>
          {t('language.button')}
        </h2>
        <p className={styles.description}>{t('settings.languageDescription')}</p>
      </header>

      <div className={styles.group} role="group" aria-label={t('language.menu')}>
        <button
          type="button"
          className={`${styles.choice} ${source === 'system' ? styles.choiceActive : ''}`}
          onClick={() => setLocale(null)}
          aria-pressed={source === 'system'}
        >
          <span className={styles.choiceIcon} aria-hidden="true">
            <Monitor size={16} />
          </span>
          <span className={styles.choiceCopy}>
            <span className={styles.choiceTitle}>{t('language.system')}</span>
            <span className={styles.choiceDescription}>
              {t('language.systemHint', { locale: LOCALE_NAMES[systemLocale] })}
            </span>
          </span>
          {source === 'system' && (
            <Check
              size={16}
              strokeWidth={2.5}
              className={styles.choiceCheck}
              aria-hidden="true"
            />
          )}
        </button>

        {SUPPORTED_LOCALES.map((option) => {
          const selected = source === 'user' && locale === option
          return (
            <button
              key={option}
              type="button"
              className={`${styles.choice} ${selected ? styles.choiceActive : ''}`}
              onClick={() => setLocale(option)}
              aria-pressed={selected}
            >
              <span className={styles.choiceCopy}>
                <span className={styles.choiceTitle}>{LOCALE_NAMES[option]}</span>
              </span>
              <span className={styles.choiceCode}>{option}</span>
              {selected && (
                <Check
                  size={16}
                  strokeWidth={2.5}
                  className={styles.choiceCheck}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default LanguageSection