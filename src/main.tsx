import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './AppBusiness'
import './business.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
