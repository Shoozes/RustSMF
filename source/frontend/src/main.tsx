import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/themes/modern.css'
import './styles/themes/original.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
