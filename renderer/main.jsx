import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installWebApi } from './lib/webApi.js';
import './styles.css';

// In the desktop app window.api comes from the Electron preload; in a browser we provide it.
if (!window.api) {
  installWebApi();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js');
  }
}

createRoot(document.getElementById('root')).render(<App />);
