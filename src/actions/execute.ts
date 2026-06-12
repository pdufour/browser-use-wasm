/**
 * Execute one parsed ShowUI navigation action on the live page.
 * Coordinates are capture-norm points from the model on the screenshot —
 * execution maps them onto the target document via the browser-tools helpers.
 */

import {
  triggerActionAtNorm,
  typeAtNorm,
  selectOptionAtNorm,
  pressKey,
  scrollPage,
} from '../browser-tools/dom-actions.ts';
import type { GroundingPoint } from './parse-coords.ts';

export interface ExecutableNavigationAction {
  action: string;
  value: string | null;
  point: GroundingPoint | null;
}

export interface NavigationExecution {
  ok: boolean;
  detail: string;
}

export function executeNavigationAction(
  nav: ExecutableNavigationAction
): NavigationExecution {
  const { action, value, point } = nav;
  switch (action) {
    case 'CLICK': {
      if (!point) return { ok: false, detail: 'position missing' };
      const ok = triggerActionAtNorm(point.x, point.y, 'click');
      return {
        ok,
        detail: ok
          ? `clicked at (${point.x.toFixed(3)}, ${point.y.toFixed(3)})`
          : 'no element at position',
      };
    }
    case 'SELECT': {
      if (!point) return { ok: false, detail: 'position missing' };
      if (value != null && value.trim()) {
        const ok = selectOptionAtNorm(point.x, point.y, value);
        return { ok, detail: ok ? `selected "${value}"` : 'no select at position' };
      }
      const ok = triggerActionAtNorm(point.x, point.y, 'click');
      return { ok, detail: ok ? 'clicked select target' : 'no element at position' };
    }
    case 'INPUT': {
      if (!point) return { ok: false, detail: 'position missing' };
      if (value == null) return { ok: false, detail: 'value missing' };
      const ok = typeAtNorm(point.x, point.y, value);
      return { ok, detail: ok ? `typed "${value}"` : 'no input at position' };
    }
    case 'HOVER':
      return point
        ? { ok: true, detail: `hover at (${point.x.toFixed(3)}, ${point.y.toFixed(3)})` }
        : { ok: false, detail: 'position missing' };
    case 'ENTER': {
      const r = pressKey('Enter');
      return { ok: r.ok, detail: r.detail };
    }
    case 'SCROLL': {
      const dir = /up/i.test(value ?? '') ? 'up' : 'down';
      scrollPage(dir);
      return { ok: true, detail: `scrolled ${dir}` };
    }
    case 'ANSWER':
      return { ok: true, detail: value ?? '(no answer)' };
    default:
      return { ok: false, detail: `unsupported action ${action}` };
  }
}
