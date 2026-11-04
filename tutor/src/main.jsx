import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <footer aria-label="Company and policies" style={{padding:'24px',background:'#101014',color:'#c9c3d1',fontSize:'13px',lineHeight:1.8}}>
      <p>SynapSoul Learn · Operated by Shriansh Vikram Singh, sole proprietor</p>
      <nav style={{display:'flex',flexWrap:'wrap',gap:'18px'}} aria-label="Policies">
        <a href="/privacy/">Privacy &amp; service information</a><a href="https://synapsoulai.me/legal/terms/">Terms</a><a href="https://synapsoulai.me/legal/brand/">Brand permissions</a><a href="mailto:omshriansh16@gmail.com">Contact</a>
      </nav>
    </footer>
  </StrictMode>,
)
