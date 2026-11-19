import { Check, Palette } from 'lucide-react'
import { useI18n } from '../../i18n'
import { ACCENT_COLOR_PRESETS } from './colors'
import styles from './AppearanceSection.module.css'

type AppearanceSectionProps = {
  accentColor: string
  onAccentColorChange: (color: string) => void
}

function AppearanceSection({ accentColor, onAccentColorChange }: AppearanceSectionProps) {
  const { t } = useI18n()

  return (
    <section className={styles.section} aria-labelledby="appearance-title">
      <header className={styles.sectionHeader}>
        <span className={styles.pageIcon} aria-hidden="true">
          <Palette size={19} />
        </span>
        <div>
          <h2 id="appearance-title" className={styles.title}>
            {t('appearance.title')}
          </h2>
          <p className={styles.description}>{t('appearance.description')}</p>
        </div>
      </header>

      <section className={styles.setting} aria-labelledby="accent-color-title">
        <div className={styles.settingHeader}>
          <div>
            <h2 id="accent-color-title" className={styles.settingTitle}>
              {t('appearance.accentTitle')}
            </h2>
            <p className={styles.settingDescription}>{t('appearance.accentDescription')}</p>
          </div>
          <span className={styles.colorValue}>{accentColor.toUpperCase()}</span>
        </div>

        <div className={styles.colorControls}>
          <div className={styles.presets} role="group" aria-label={t('appearance.presets')}>
            {ACCENT_COLOR_PRESETS.map(({ color, label }) => {
              const selected = accentColor.toLowerCase() === color
              return (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
                  onClick={() => onAccentColorChange(color)}
                  aria-label={t(label)}
                  aria-pressed={selected}
                  title={t(label)}
                >
                  <span className={styles.swatchDot} style={{ backgroundColor: color }}>
                    {selected && <Check size={14} aria-hidden="true" />}
                  </span>
                  <span className={styles.swatchLabel}>{t(label)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </section>
  )
}

export default AppearanceSection
