/**
 * Video demo — live iframe + follow-along cursor (Screen Studio style).
 * Fixed FindIt preset; change goal or swap URL in code to try other demos.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';
import { withBase } from '../shared/app-base.js';
import { demoLog, demoLogEnv, logGoalBarState, wireDemoErrorLogging } from '../shared/demo-log.js';

wireDemoErrorLogging('video');
demoLogEnv('video');
logGoalBarState('video:html');

mountSiteHeader(document.getElementById('site-header'), { active: 'video' });
logGoalBarState('video:after-header');

demoLog('video', 'init task runner', { initialUrl: withBase('sites/find-it/index.html') });

initTaskRunner({
  initialUrl: withBase('sites/find-it/index.html'),
  initialGoal: 'search for cats',
  frameTitle: 'FindIt search',
  hideDevDetails: true,
  wireSiteHeader: true,
});
