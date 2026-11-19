import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import App from './App';
import { startDiagnostics } from './data/diagnostics';
import './styles.css';
import './scenes.css';

startDiagnostics();
createRoot(document.getElementById('root')!).render(<App />);
