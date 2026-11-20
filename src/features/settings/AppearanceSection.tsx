import { Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { ACCENT_COLOR_PRESETS } from './colors'
import styles from './AppearanceSection.module.css'

const uniqueAccentColorPresets = ACCENT_COLOR_PRESETS.filter(
  (preset, index, presets) =>
    presets.findIndex(
      (candidate) => candidate.color.toLowerCase() === preset.color.toLowerCase(),
    ) === index,
)

type AppearanceSectionProps = {
  accentColor: string
  onAccentColorChange: (color: string) => void
}

function AppearanceSection({ accentColor, onAccentColorChange }: AppearanceSectionProps) {
  const { t } = useI18n()

  return (
    <section className={styles.section} aria-labelledby="appearance-title">
      <header className={styles.sectionHeader}>
        <h2 id="appearance-title" className={styles.title}>
          {t('appearance.title')}
        </h2>
        <p className={styles.description}>{t('appearance.description')}</p>
      </header>

      <section className={styles.group} aria-labelledby="accent-color-title">
        <div className={styles.groupHeader}>
          <div className={styles.groupText}>
            <h3 id="accent-color-title" className={styles.settingTitle}>
              {t('appearance.accentTitle')}
            </h3>
            <p className={styles.settingDescription}>{t('appearance.accentDescription')}</p>
          </div>
          <span className={styles.colorValue}>{accentColor.toUpperCase()}</span>
        </div>

        <div className={styles.presets} role="group" aria-label={t('appearance.presets')}>
          {uniqueAccentColorPresets.map(({ color, label }) => {
            const selected = accentColor.toLowerCase() === color.toLowerCase()
            return (
              <button
                key={color.toLowerCase()}
                type="button"
                className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
                onClick={() => onAccentColorChange(color)}
                aria-label={t(label)}
                aria-pressed={selected}
              >
                <span className={styles.swatchRing}>
                  <span className={styles.swatchDot} style={{ backgroundColor: color }}>
                    {selected && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                  </span>
                </span>
                <span className={styles.swatchLabel}>{t(label)}</span>
              </button>
            )
          })}
        </div>
      </section>
    </section>
  )
}

export default AppearanceSection