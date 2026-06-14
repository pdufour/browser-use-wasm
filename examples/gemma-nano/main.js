/**
 * Gemini Nano (Chrome Prompt API) runner.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';
import { demoLog, demoLogEnv, logGoalBarState, wireDemoErrorLogging } from '../shared/demo-log.js';
import { BUILTIN_BROWSE_PATH } from '../shared/browse-defaults.js';
import { wireBlogSnippets } from './blog-snippets.js';

wireBlogSnippets();

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

const runner = initTaskRunner({
  initialUrl,
  initialGoal,
  frameTitle: 'Gemini Nano Demo',
  wireSiteHeader: true,
  useNativeAi: true,
  hideDevDetails: false,
  inlineCapturePanel: true,
});

if (params.has('e2e')) {
  import('browser-use-wasm').then(
    ({
      buildShowUINavigationMessages,
      mapShowUIMessagesToPromptApiTurns,
      navigationPositionToPoint,
    }) => {
      globalThis.__e2ePromptApiTurnShape = () => {
        const buf = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0]).buffer;
        const messages = buildShowUINavigationMessages(buf, 'click Submit');
        const turns = mapShowUIMessagesToPromptApiTurns(messages);
        const user = turns.find((t) => t.role === 'user');
        const assistant = turns.find((t) => t.role === 'assistant');
        const userContent = user && Array.isArray(user.content) ? user.content : [];
        return {
          turnCount: turns.length,
          userTurnCount: turns.filter((t) => t.role === 'user').length,
          userPartCount: userContent.length,
          textPartCount: userContent.filter((p) => p.type === 'text').length,
          hasImagePart: userContent.some((p) => p.type === 'image'),
          assistantPrefix: assistant?.prefix === true,
        };
      };

      globalThis.__e2eNavPositionNorm = () => {
        const vision = { width: 840, height: 364 };
        const pixel = navigationPositionToPoint([200, 165], vision);
        const norm = navigationPositionToPoint([0.2, 0.165], vision);
        const submit = navigationPositionToPoint([820, 300], vision);
        return {
          pixel: pixel ? { x: +pixel.x.toFixed(3), y: +pixel.y.toFixed(3) } : null,
          norm,
          submit: submit ? { x: +submit.x.toFixed(3), y: +submit.y.toFixed(3) } : null,
        };
      };
    }
  );
}
