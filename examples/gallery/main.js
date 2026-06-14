/**
 * Gallery — demo picker linking to /browse/ with preset url + goal.
 */
import {
  SAMPLE_SITES,
  SHOP_DEMO_TASK,
  GEMMA_NANO_TASK,
  browseRunnerHref,
  operatorHref,
  galleryPreviewSrc,
} from '../shared/gallery-tasks.js';
import { mountSiteHeader } from '../shared/site-header.js';
import { withBase } from '../shared/app-base.js';

mountSiteHeader(document.getElementById('site-header'), { active: 'gallery' });

const grid = document.getElementById('gallery-grid');

/** @param {import('../shared/gallery-tasks.js').GalleryTask} task */
function taskPreviewHtml(task) {
  const hue = task.hue ?? '#6366f1';
  return `
    <div class="task-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle has-preview"
         style="--demo-accent: ${hue}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <img class="task-card__preview-img" src="${galleryPreviewSrc(task)}" alt="" decoding="async" />
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

function renderGemmaCard() {
  const task = GEMMA_NANO_TASK;
  const card = document.createElement('a');
  card.className = 'task-card task-card--accent';
  card.href = withBase('gemma-nano/');
  card.style.setProperty('--task-hue', task.hue ?? '#10b981');
  card.innerHTML = `
    ${taskPreviewHtml(task)}
    <span class="task-card__tag">${task.tag}</span>
    <h2 class="task-card__name">${task.name}</h2>
    <p class="task-card__goal">“${task.goal}”</p>
    <p class="task-card__note">Chrome Prompt API — Gemini Nano</p>
    <span class="task-card__cta">Open native demo →</span>
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
    <div class="task-card__visual demo-preview demo-preview--operator brainwave-frame brainwave-frame--compact is-idle has-preview"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <span class="orbit-dot"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <img class="task-card__preview-img" src="${galleryPreviewSrc(task)}" alt="" decoding="async" />
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

function renderGallery() {
  if (!grid) return;
  grid.replaceChildren();
  const shop = renderShopCard();
  const gemma = renderGemmaCard();
  const taskCards = SAMPLE_SITES.map(renderCard);
  grid.append(shop, gemma, ...taskCards);
}

renderGallery();
