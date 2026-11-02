import { createRoot } from 'react-dom/client'
import 'pdfjs-dist/web/pdf_viewer.css'
import { App } from '../app/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
