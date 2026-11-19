import About from './components/About'
import PlayerScreen from './features/player/PlayerScreen'
import Shortcuts from './components/Shortcuts'
import WindowTitleBar from './components/WindowTitleBar'
import styles from './App.module.css'

function App() {
  if (window.location.hash === '#about') {
    return <About />
  }

  if (window.location.hash === '#shortcuts') {
    return <Shortcuts />
  }

  return (
    <div className={styles.app} data-window-shell>
      <WindowTitleBar />
      <main className={styles.content}>
        <PlayerScreen />
      </main>
    </div>
  )
}

export default App