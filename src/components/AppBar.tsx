import { File, FolderOpen, Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

type AppBarProps = {
  activePage: 'player' | 'settings'
  onOpenVideo: () => void
  onOpenFolder: () => void
  onOpenSettings: () => void
}

function AppBar({ activePage, onOpenVideo, onOpenFolder, onOpenSettings }: AppBarProps) {
  const { t } = useI18n()

  return (
    <aside className={styles.appBar} aria-label={t('appbar.navigation')}>
      <button
        type="button"
        className={styles.button}
        onClick={onOpenVideo}
        title={t('appbar.openVideoTitle')}
        aria-label={t('appbar.openVideo')}
      >
        <File size={16} />
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onOpenFolder}
        title={t('appbar.openFolderTitle')}
        aria-label={t('appbar.openFolder')}
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
