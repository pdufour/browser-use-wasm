/**
 * Video demo — live iframe + follow-along cursor (Screen Studio style).
 * Fixed FindIt preset; change goal or swap URL in code to try other demos.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';
import { withBase } from '../shared/app-base.js';

mountSiteHeader(document.getElementById('site-header'), { active: 'video' });

initTaskRunner({
  initialUrl: withBase('sites/find-it/index.html'),
  initialGoal: 'search for cats',
  frameTitle: 'FindIt search',
  hideDevDetails: true,
  wireSiteHeader: true,
});
