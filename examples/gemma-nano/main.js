/**
 * Gemma 4 Nano (Chrome Prompt API) runner.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';
import { withBase } from '../shared/app-base.js';
import { demoLog, demoLogEnv, logGoalBarState, wireDemoErrorLogging } from '../shared/demo-log.js';
import { BUILTIN_BROWSE_PATH } from '../shared/browse-defaults.js';

wireDemoErrorLogging('gemma-nano');
demoLogEnv('gemma-nano');

const params = new URLSearchParams(location.search);
const initialUrl = params.get('url') ?? params.get('u') ?? BUILTIN_BROWSE_PATH;
const initialGoal = params.get('goal') ?? 'type Joe in the email field';

demoLog('gemma-nano', 'boot params', { initialUrl, initialGoal });

// Immediate diagnostic log
const diag = {
  ai: !!window.ai,
  aiProps: window.ai ? Object.keys(window.ai) : [],
  model: !!(window).model,
  modelProps: (window).model ? Object.keys((window).model) : [],
  isSecure: window.isSecureContext,
};
console.info('[gemma-nano:diag]', diag);

logGoalBarState('gemma-nano:html');
mountSiteHeader(document.getElementById('site-header'), { active: 'gallery' });
logGoalBarState('gemma-nano:after-header');

initTaskRunner({
  initialUrl,
  initialGoal,
  frameTitle: 'Gemma 4 Nano Demo',
  wireSiteHeader: true,
  useNativeAi: true, 
});

// Modal Logic
const modal = document.getElementById('native-ai-modal');
const showBtn = document.getElementById('btn-show-requirements');
const closeBtn = document.getElementById('btn-close-modal');

if (showBtn && modal) {
  showBtn.addEventListener('click', () => {
    modal.hidden = false;
  });
}

if (closeBtn && modal) {
  closeBtn.addEventListener('click', () => {
    modal.hidden = true;
  });
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}

// AI Verification Tool
const verifyBtn = document.getElementById('btn-verify-ai');
if (verifyBtn) {
  verifyBtn.addEventListener('click', async () => {
    const report = {
      window_ai: !!window.ai,
      window_model: !!(window).model,
      globalThis_ai: !!globalThis.ai,
      navigator_ai: !!(navigator).ai,
      isSecure: window.isSecureContext,
      userAgent: navigator.userAgent,
    };
    
    console.group('🔍 AI Status Verification');
    console.info('Environment:', report);
    
    const ai = window.ai || (window).model || (navigator).ai;
    if (ai) {
      console.info('AI Object Keys:', Object.keys(ai));
      const lm = ai.languageModel || ai.textModel || ai.assistant || (ai.create ? ai : null);
      if (lm) {
        console.info('Language Model found:', lm);
        try {
          const caps = await lm.capabilities();
          console.info('Capabilities:', caps);
        } catch (e) {
          console.warn('capabilities() failed or missing:', e.message);
        }
      } else {
        console.warn('AI object exists but no languageModel/assistant found.');
      }
    } else {
      console.error('No AI object found in any namespace.');
    }
    console.groupEnd();
    
    alert(`Verification logged to console (F12).\nStatus: ${ai ? 'AI Object Detected' : 'NOT FOUND'}\nSecure: ${report.isSecure}`);
  });
}
