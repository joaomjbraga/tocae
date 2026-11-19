import { File, FolderOpen, Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

type AppBarProps = {
  activePage: 'player' | 'settings'
  onOpenMedia: () => void
  onOpenMediaFolder: () => void
  onOpenSettings: () => void
}

function AppBar({ activePage, onOpenMedia, onOpenMediaFolder, onOpenSettings }: AppBarProps) {
  const { t } = useI18n()

  return (
    <aside className={styles.appBar} aria-label={t('appbar.navigation')}>
      <button
        type="button"
        className={styles.button}
        onClick={onOpenMedia}
        title={t('appbar.openMediaFileTitle')}
        aria-label={t('appbar.openMediaFile')}
      >
        <File size={16} />
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onOpenMediaFolder}
        title={t('appbar.openMediaFolderTitle')}
        aria-label={t('appbar.openMediaFolder')}
      >
        <FolderOpen size={16} />
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <span className={styles.spacer} />

      <button
        type="button"
        className={`${styles.button} ${activePage === 'settings' ? styles.active : ''}`}
        onClick={onOpenSettings}
        title={t('settings.title')}
        aria-label={t('settings.title')}
        aria-pressed={activePage === 'settings'}
      >
        <Settings size={16} />
      </button>
    </aside>
  )
}

export default AppBar
