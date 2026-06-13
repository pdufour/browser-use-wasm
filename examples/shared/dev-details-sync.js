import { $ } from './dom.js';

/**
 * Keep developer-details badge, action pipeline, and arena in sync with status text.
 * @param {string} text
 * @param {{ busy?: boolean }} [opts]
 */
export function syncDevChrome(text, { busy = false } = {}) {
  const badge = $('dev-status-badge');
  const pipeline = $('dev-action-pipeline');
  const arena = $('arena-status');
  const t = String(text ?? '').trim();

  if (badge) {
    if (/^Done/i.test(t)) {
      badge.dataset.state = 'done';
      badge.textContent = 'Done';
    } else if (/^Stopped|^Error/i.test(t)) {
      badge.dataset.state = 'error';
      badge.textContent = /Error/i.test(t) ? 'Error' : 'Stopped';
    } else if (busy || /Running|thinking|CLICK|INPUT|SELECT|ENTER|Observing/i.test(t)) {
      badge.dataset.state = 'busy';
      badge.textContent = 'Running';
    } else if (/ready/i.test(t)) {
      badge.dataset.state = 'ready';
      badge.textContent = 'Ready';
    } else if (/Loading|encoding|Captured/i.test(t)) {
      badge.dataset.state = 'boot';
      badge.textContent = 'Loading';
    } else {
      badge.dataset.state = 'idle';
      badge.textContent = '…';
    }
  }

  const summary = t.match(/^(?:Done|Stopped) — (.+)/i);
  if (pipeline) {
    if (summary) {
      const parts = summary[1].split(/\s*→\s*/).filter(Boolean);
      if (parts.length) {
        pipeline.hidden = false;
        pipeline.replaceChildren(
          ...parts.flatMap((part, i) => {
            const nodes = [];
            const chip = document.createElement('span');
            chip.className = 'dev-step';
            chip.textContent = part.trim();
            nodes.push(chip);
            if (i < parts.length - 1) {
              const arrow = document.createElement('span');
              arrow.className = 'dev-step-arrow';
              arrow.setAttribute('aria-hidden', 'true');
              arrow.textContent = '→';
              nodes.push(arrow);
            }
            return nodes;
          })
        );
      } else {
        pipeline.hidden = true;
        pipeline.replaceChildren();
      }
    } else {
      pipeline.hidden = true;
      pipeline.replaceChildren();
    }
  }

  if (arena) {
    const showArena = t && !summary && !/^ready to run/i.test(t);
    arena.hidden = !showArena;
    arena.textContent = showArena ? t : '';
  }
}

/** Open the developer details panel (snapshot / explicit capture). */
export function openDevDetails() {
  const details = document.getElementById('dev-details');
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
    requestAnimationFrame(() => {
      globalThis.dispatchEvent(new CustomEvent('dev-details-layout'));
    });
  }
}
