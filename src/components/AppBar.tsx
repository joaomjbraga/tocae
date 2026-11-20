import { AudioLines, File, FolderOpen, Settings } from 'lucide-react'
import type { StreamingService } from '@shared/ipc'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

type AppBarProps = {
  activePage: 'player' | 'settings'
  activeStreamingService: StreamingService | null
  onOpenMedia: () => void
  onOpenMediaFolder: () => void
  onOpenStreamingService: (service: StreamingService) => void
  onOpenSettings: () => void
}

function AppBar({
  activePage,
  activeStreamingService,
  onOpenMedia,
  onOpenMediaFolder,
  onOpenStreamingService,
  onOpenSettings,
}: AppBarProps) {
  const { t } = useI18n()

  return (
    <aside className={styles.appBar} aria-label={t('appbar.navigation')}>
      <button
        type="button"
        className={styles.button}
        onClick={onOpenMedia}
        aria-label={t('appbar.openMediaFile')}
      >
        <File size={16} />
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onOpenMediaFolder}
        aria-label={t('appbar.openMediaFolder')}
      >
        <FolderOpen size={16} />
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <button
        type="button"
        className={`${styles.button} ${activeStreamingService === 'netflix' ? styles.active : ''}`}
        onClick={() => onOpenStreamingService('netflix')}
        aria-label={t('services.netflix')}
      >
        <span className={styles.netflixMark} aria-hidden="true">
          N
        </span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activeStreamingService === 'spotify' ? styles.active : ''}`}
        onClick={() => onOpenStreamingService('spotify')}
        aria-label={t('services.spotify')}
      >
        <AudioLines className={styles.spotifyMark} size={18} aria-hidden="true" />
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <span className={styles.spacer} />

      <button
        type="button"
        className={`${styles.button} ${activePage === 'settings' ? styles.active : ''}`}
        onClick={onOpenSettings}
        aria-label={t('settings.title')}
        aria-pressed={activePage === 'settings'}
      >
        <Settings size={16} />
      </button>
    </aside>
  )
}

export default AppBar
