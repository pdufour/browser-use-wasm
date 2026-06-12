import { PRODUCT_NAME, PRODUCT_TAGLINE, GITHUB_REPO_URL } from './product.js';

/**
 * Shared site header — product brand + nav.
 * @param {{ active?: 'home' | 'gallery' | 'browse' }} [opts]
 */
export function siteHeaderHtml({ active = 'home' } = {}) {
  const nav = [{ id: 'home', href: '/', label: 'Home' }];
  const links = nav
    .map(
      (item) =>
        `<a href="${item.href}" class="${active === item.id ? 'is-active' : ''}">${item.label}</a>`
    )
    .join('');
  return `
    <a class="site-header__brand" href="/">
      <span class="site-header__logo" aria-hidden="true">◉</span>
      <div>
        <p class="site-header__title">${PRODUCT_NAME}</p>
        <p class="site-header__subtitle">${PRODUCT_TAGLINE}</p>
      </div>
    </a>
    <nav class="site-header__nav" aria-label="Site">${links}</nav>
    <div class="site-header__aside" data-site-header-aside>
      <a class="site-header__github" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  `;
}

/** @param {HTMLElement | null} el @param {{ active?: string }} [opts] */
export function mountSiteHeader(el, opts = {}) {
  if (!el) return;
  el.className = 'site-header';
  el.innerHTML = siteHeaderHtml(opts);
}
