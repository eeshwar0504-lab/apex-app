import {createRoot} from 'react-dom/client';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-600.css';
import './styles.css';
import './apex3-phase2.css';
import './apex3-phase3.css';
import './apex3-phase4.css';
import './apex3-phase5.css';
import './apex3-phase6.css';
import './apex3-phase7.css';
import './apex3-phase8.css';
import './apex3-phase9.css';
import './apex3-phase10.css';
import './apex3-phase11.css';
import './apex3-phase12.css';
import './apex3-phase13.css';
import './apex3-phase14.css';
import './apex3-phase15.css';
import './apex3-design-system.css';
import './apex-motion.css';
import './apex5.css';
import {ApexErrorBoundary,ErrorPanel,LoadingPanel} from './ui/primitives';
import {App} from './App';

/* Dev-only: ?apexState=loading|error renders those panels for visual review. Stripped from production builds. */
const previewState=import.meta.env.DEV?new URLSearchParams(location.search).get('apexState'):null;
createRoot(document.getElementById('root')!).render(<ApexErrorBoundary>{previewState==='error'?<div className="app" data-theme="obsidian"><ErrorPanel onRetry={()=>{}} onBack={()=>{}}/></div>:previewState==='loading'?<div className="app" data-theme="obsidian"><LoadingPanel progress={72}/></div>:<App/>}</ApexErrorBoundary>);
