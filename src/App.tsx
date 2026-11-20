import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import PlayerScreen from './features/player/PlayerScreen'
import {
  ACCENT_COLOR_PRESETS,
  ACCENT_COLOR_STORAGE_KEY,
  DEFAULT_ACCENT_COLOR,
} from './features/settings/colors'
import WindowTitleBar from './components/WindowTitleBar'
import styles from './App.module.css'

type AppStyle = CSSProperties & { '--player-accent': string }

function getSavedAccentColor() {
  const saved = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY)
  const preset = ACCENT_COLOR_PRESETS.find(
    ({ color }) => color.toLowerCase() === saved?.toLowerCase(),
  )
  return preset?.color ?? DEFAULT_ACCENT_COLOR
}

function App() {
  const [accentColor, setAccentColor] = useState<string>(getSavedAccentColor)
  const [immersiveMedia, setImmersiveMedia] = useState(false)

  function handleAccentColorChange(color: string) {
    window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, color)
    setAccentColor(color)
  }

  const handleImmersiveMediaChange = useCallback((immersive: boolean) => {
    setImmersiveMedia(immersive)
  }, [])

  return (
    <div
      className={`${styles.app} ${immersiveMedia ? styles.immersive : ''}`}
      data-window-shell
      style={{ '--player-accent': accentColor } as AppStyle}
    >
      <WindowTitleBar compact overlay={immersiveMedia} />
      <main className={`${styles.content} ${styles.playerContent}`}>
        <PlayerScreen
          accentColor={accentColor}
          onAccentColorChange={handleAccentColorChange}
          onImmersiveMediaChange={handleImmersiveMediaChange}
        />
      </main>
    </div>
  )
}

export default App