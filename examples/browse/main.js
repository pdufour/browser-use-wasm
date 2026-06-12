/**
 * Browse runner — open a gallery demo with preset url + goal, run a vision task.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';
import { withBase } from '../shared/app-base.js';
import { demoLog, demoLogEnv, logGoalBarState, wireDemoErrorLogging } from '../shared/demo-log.js';

wireDemoErrorLogging('browse');
demoLogEnv('browse');

const params = new URLSearchParams(location.search);
const initialUrl = params.get('url') ?? params.get('u');
const initialGoal = params.get('goal') ?? '';

demoLog('browse', 'boot params', { initialUrl, initialGoal });

if (!initialUrl) {
  demoLog('browse', 'missing url — redirecting to gallery');
  location.replace(withBase('gallery/'));
} else {
  logGoalBarState('browse:html');
  mountSiteHeader(document.getElementById('site-header'), { active: 'gallery' });
  logGoalBarState('browse:after-header');
  initTaskRunner({
    initialUrl,
    initialGoal,
    frameTitle: 'Demo',
    wireSiteHeader: true,
  });
}
