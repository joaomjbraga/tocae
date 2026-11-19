import { Repeat } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { PlaybackPreferences } from '../player/playbackPreferences'
import styles from './PlaybackSection.module.css'

type PlaybackSectionProps = PlaybackPreferences & {
  onAutoNextChange: (enabled: boolean) => void
  onRepeatCurrentChange: (enabled: boolean) => void
}

function PlaybackSection({
  autoNext,
  repeatCurrent,
  onAutoNextChange,
  onRepeatCurrentChange,
}: PlaybackSectionProps) {
  const { t } = useI18n()

  return (
    <section className={styles.section} aria-labelledby="playback-settings-title">
      <header className={styles.header}>
        <Repeat size={19} className={styles.headerIcon} aria-hidden="true" />
        <div>
          <h2 id="playback-settings-title" className={styles.title}>
            {t('playbackSettings.title')}
          </h2>
          <p className={styles.description}>{t('playbackSettings.description')}</p>
        </div>
      </header>

      <div className={styles.options}>
        <button
          type="button"
          className={styles.option}
          role="switch"
          aria-checked={autoNext}
          aria-labelledby="playback-auto-next-title"
          aria-describedby="playback-auto-next-description"
          onClick={() => onAutoNextChange(!autoNext)}
        >
          <span className={styles.optionCopy}>
            <span id="playback-auto-next-title" className={styles.optionTitle}>
              {t('playbackSettings.autoNextTitle')}
            </span>
            <span id="playback-auto-next-description" className={styles.optionDescription}>
              {t('playbackSettings.autoNextDescription')}
            </span>
          </span>
          <span
            className={`${styles.switchTrack} ${autoNext ? styles.switchEnabled : ''}`}
            aria-hidden="true"
          >
            <span className={styles.switchThumb} />
          </span>
        </button>

        <button
          type="button"
          className={styles.option}
          role="switch"
          aria-checked={repeatCurrent}
          aria-labelledby="playback-repeat-title"
          aria-describedby="playback-repeat-description"
          onClick={() => onRepeatCurrentChange(!repeatCurrent)}
        >
          <span className={styles.optionCopy}>
            <span id="playback-repeat-title" className={styles.optionTitle}>
              {t('playbackSettings.repeatTitle')}
            </span>
            <span id="playback-repeat-description" className={styles.optionDescription}>
              {t('playbackSettings.repeatDescription')}
            </span>
          </span>
          <span
            className={`${styles.switchTrack} ${repeatCurrent ? styles.switchEnabled : ''}`}
            aria-hidden="true"
          >
            <span className={styles.switchThumb} />
          </span>
        </button>
      </div>
    </section>
  )
}

export default PlaybackSection
