import About from './components/About'
import PlayerScreen from './features/player/PlayerScreen'
import Shortcuts from './components/Shortcuts'
import WindowTitleBar from './components/WindowTitleBar'
import styles from './App.module.css'

function App() {
  if (window.location.hash === '#shortcuts') {
    return <Shortcuts />
  }

  const isAbout = window.location.hash === '#about'

  return (
    <div className={styles.app} data-window-shell>
      <WindowTitleBar titleKey={isAbout ? 'window.about' : undefined} closeOnly={isAbout} />
      <main className={styles.content}>
        {isAbout ? <About /> : <PlayerScreen />}
      </main>
    </div>
  )
}

export default App