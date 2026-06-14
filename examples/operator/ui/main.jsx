/**
 * ShowUI Operator demo — React UI over the `src/` library (`createWebOperator`).
 * Capture → ShowUI navigation in a WASM worker → live-page actions.
 */
import './styles/base.css';
import './styles/dashboard.css';
import './styles/command-bar.css';
import './styles/browser-frame.css';
import './styles/orbit-pulse.css';
import './styles/marker.css';
import './styles/e2e-shelf.css';
import '../../shared/user-facing.css';
import '../../shared/site-header.css';
import '../../shared/dev-details.css';
import { createRoot } from 'react-dom/client';
import { App } from './app.jsx';

createRoot(document.getElementById('root')).render(<App />);
