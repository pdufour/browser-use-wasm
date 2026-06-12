/**
 * Gallery — demo picker linking to /browse/ with preset url + goal.
 * Card thumbnails are SnapDOM captures (hidden iframe), cached for the session.
 */
import {
  SAMPLE_SITES,
  SHOP_DEMO_TASK,
  browseRunnerHref,
  operatorHref,
} from '../shared/gallery-tasks.js';
import { scheduleGalleryPreviews } from '../shared/gallery-previews.js';
import { mountSiteHeader } from '../shared/site-header.js';

mountSiteHeader(document.getElementById('site-header'), { active: 'gallery' });

const grid = document.getElementById('gallery-grid');

/** @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function taskPreviewHtml(task) {
  const hue = task.hue ?? '#6366f1';
  return `
    <div class="task-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle"
         data-preview-url="${task.url}"
         style="--demo-accent: ${hue}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <div class="task-card__preview-skeleton">
          <span class="task-card__preview-label">${task.name}</span>
        </div>
        <img class="task-card__preview-img" alt="" hidden decoding="async" />
      </div>
    </div>
  `;
}

/** @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function renderCard(task) {
  const href = browseRunnerHref(task);
  const card = document.createElement('a');
  card.className = 'task-card';
  card.href = href;
  card.style.setProperty('--task-hue', task.hue ?? '#6366f1');
  card.innerHTML = `
    ${taskPreviewHtml(task)}
    <span class="task-card__tag">${task.tag}</span>
    <h2 class="task-card__name">${task.name}</h2>
    <p class="task-card__goal">“${task.goal}”</p>
    <span class="task-card__cta">Open & run →</span>
  `;
  return card;
}

function renderShopCard() {
  const task = SHOP_DEMO_TASK;
  const card = document.createElement('a');
  card.className = 'task-card task-card--operator';
  card.href = operatorHref(task.goal);
  card.style.setProperty('--task-hue', task.hue ?? '#6366f1');
  card.innerHTML = `
    <div class="task-card__visual demo-preview demo-preview--operator brainwave-frame brainwave-frame--compact is-idle"
         data-preview-url="${task.url}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <span class="orbit-dot"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <div class="task-card__preview-skeleton">
          <span class="task-card__preview-label">${task.name}</span>
        </div>
        <img class="task-card__preview-img" alt="" hidden decoding="async" />
      </div>
    </div>
    <span class="task-card__tag">${task.tag}</span>
    <h2 class="task-card__name">${task.name}</h2>
    <p class="task-card__goal">“${task.goal}”</p>
    <p class="task-card__note">browser-use-wasm — E2E gate</p>
    <span class="task-card__cta">Open operator →</span>
  `;
  return card;
}

/** @param {HTMLElement} card @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function previewJobFromCard(card, task) {
  const visualEl = card.querySelector('.task-card__visual[data-preview-url]');
  if (!(visualEl instanceof HTMLElement)) return null;
  return {
    visualEl,
    url: task.url,
    label: task.name,
  };
}

function collectPreviewJobs(cards, tasks) {
  /** @type {Array<{ visualEl: HTMLElement; url: string; label?: string }>} */
  const jobs = [];
  for (let i = 0; i < cards.length; i++) {
    const job = previewJobFromCard(cards[i], tasks[i]);
    if (job) jobs.push(job);
  }
  return jobs;
}

function renderGallery() {
  if (!grid) return;
  grid.replaceChildren();
  const shop = renderShopCard();
  const taskCards = SAMPLE_SITES.map(renderCard);
  grid.append(shop, ...taskCards);
  scheduleGalleryPreviews([
    ...collectPreviewJobs([shop], [SHOP_DEMO_TASK]),
    ...collectPreviewJobs(taskCards, SAMPLE_SITES),
  ]);
}

renderGallery();
