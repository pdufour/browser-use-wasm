import { mountSiteHeader } from '../shared/site-header.js';
import { allHomeExamples, SHOP_DEMO_TASK } from '../shared/gallery-tasks.js';
import { scheduleGalleryPreviews } from '../shared/gallery-previews.js';

mountSiteHeader(document.getElementById('site-header'), { active: 'home' });

const featuredSlot = document.getElementById('home-featured');
const grid = document.getElementById('home-examples-grid');

/** @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function taskPreviewHtml(task) {
  const hue = task.hue ?? '#6366f1';
  return `
    <div class="home-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle"
         data-preview-url="${task.url}"
         style="--demo-accent: ${hue}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content home-card__preview-stage">
        <div class="home-card__preview-skeleton">
          <span class="home-card__preview-label">${task.name}</span>
        </div>
        <img class="home-card__preview-img" alt="" hidden decoding="async" />
      </div>
    </div>
  `;
}

/**
 * @param {ReturnType<typeof allHomeExamples>[number]} task
 * @param {{ featured?: boolean }} [opts]
 */
function renderExampleCard(task, { featured = false } = {}) {
  const card = document.createElement('a');
  card.className = `home-card${featured ? ' home-card--featured' : ''}`;
  card.href = task.href;
  card.style.setProperty('--task-hue', task.hue ?? '#6366f1');
  card.innerHTML = `
    ${taskPreviewHtml(task)}
    <div class="home-card__body">
      <span class="home-card__tag">${task.tag}</span>
      <h2>${task.name}</h2>
      <p class="home-card__goal">“${task.goal}”</p>
      <span class="home-card__cta">${featured ? 'Launch app →' : 'Open & run →'}</span>
    </div>
  `;
  return card;
}

/** @param {HTMLElement} card @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function previewJobFromCard(card, task) {
  const visualEl = card.querySelector('.home-card__visual[data-preview-url]');
  if (!(visualEl instanceof HTMLElement)) return null;
  return { visualEl, url: task.url, label: task.name };
}

function renderHomeExamples() {
  const examples = allHomeExamples();
  const featured = examples.find((t) => t.accent) ?? SHOP_DEMO_TASK;
  const rest = examples.filter((t) => !t.accent);

  if (featuredSlot) {
    featuredSlot.replaceChildren(renderExampleCard(featured, { featured: true }));
  }
  if (grid) {
    grid.replaceChildren(...rest.map((task) => renderExampleCard(task)));
  }

  const cards = [
    ...(featuredSlot ? [featuredSlot.firstElementChild] : []),
    ...(grid ? [...grid.children] : []),
  ];
  const tasks = [featured, ...rest];
  const jobs = cards
    .map((card, i) => (card instanceof HTMLElement ? previewJobFromCard(card, tasks[i]) : null))
    .filter(Boolean);

  scheduleGalleryPreviews(jobs, { statusId: 'home-preview-status' });
}

renderHomeExamples();
