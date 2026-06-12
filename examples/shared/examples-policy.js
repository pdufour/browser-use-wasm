/** Examples-only policy — library embedders should not import this. */
import { setModelDownloadConsentRequired } from './model-download-gate.js';

// Playwright opens `/home/?e2e=1` — skip the human consent gate so autoload can finish.
const isE2e = new URLSearchParams(location.search).has('e2e');
setModelDownloadConsentRequired(!isE2e);
