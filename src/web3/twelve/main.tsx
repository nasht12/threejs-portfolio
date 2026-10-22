import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import App from './App';
import '../base.css';
import './twelve.css';

// ?cover: the scene alone, for capturing card covers
if (new URLSearchParams(location.search).has('cover')) document.documentElement.classList.add('cover-view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
