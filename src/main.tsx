import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { TooltipLayer } from './components/TooltipLayer'
import { I18nProvider } from './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <>
        <App />
        <TooltipLayer />
      </>
    </I18nProvider>
  </React.StrictMode>,
)
