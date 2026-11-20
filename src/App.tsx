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
  const [immersiveMode, setImmersiveMode] = useState(false)

  function handleAccentColorChange(color: string) {
    window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, color)
    setAccentColor(color)
  }

  const handleImmersiveModeChange = useCallback((immersive: boolean) => {
    setImmersiveMode(immersive)
  }, [])

  return (
    <div
      className={`${styles.app} ${immersiveMode ? styles.immersive : ''}`}
      data-window-shell
      style={{ '--player-accent': accentColor } as AppStyle}
    >
      <WindowTitleBar compact overlay={immersiveMode} />
      <main className={`${styles.content} ${styles.playerContent}`}>
        <PlayerScreen
          accentColor={accentColor}
          onAccentColorChange={handleAccentColorChange}
          onImmersiveModeChange={handleImmersiveModeChange}
        />
      </main>
    </div>
  )
}

export default App