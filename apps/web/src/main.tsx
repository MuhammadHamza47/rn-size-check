import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { prewarmWorker } from './analyze';
import { App } from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';

prewarmWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
