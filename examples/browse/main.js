/**
 * Browse runner — open a gallery demo with preset url + goal, run a vision task.
 */
import { mountSiteHeader } from '../shared/site-header.js';
import { initTaskRunner } from '../shared/task-runner.js';

const params = new URLSearchParams(location.search);
const initialUrl = params.get('url') ?? params.get('u');
const initialGoal = params.get('goal') ?? '';

if (!initialUrl) {
  location.replace('/gallery/');
} else {
  mountSiteHeader(document.getElementById('site-header'), { active: 'gallery' });
  initTaskRunner({
    initialUrl,
    initialGoal,
    frameTitle: 'Demo',
    wireSiteHeader: true,
  });
}
