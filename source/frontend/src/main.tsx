import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/themes/modern.css'
import './styles/themes/original.css'
import { IS_WEB_EDITION } from './webEdition'

if (IS_WEB_EDITION) document.title = 'RustSMF Web Edition'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
