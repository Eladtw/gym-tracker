import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AppDataCacheProvider } from './context/AppDataCacheContext'
import { ModalProvider } from './components/ModalProvider'
import './css/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppDataCacheProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </AppDataCacheProvider>
    </BrowserRouter>
  </React.StrictMode>,
)