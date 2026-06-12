(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))i(e);new MutationObserver(e=>{for(const r of e)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function a(e){const r={};return e.integrity&&(r.integrity=e.integrity),e.referrerPolicy&&(r.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?r.credentials="include":e.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(e){if(e.ep)return;e.ep=!0;const r=a(e);fetch(e.href,r)}})();const n="browser-use-wasm",c="SnapDOM · ShowUI · WASM",d="https://github.com/pdufour/browser-use-wasm";function l({active:t="home"}={}){const a=[{id:"home",href:"/",label:"Home"}].map(i=>`<a href="${i.href}" class="${t===i.id?"is-active":""}">${i.label}</a>`).join("");return`
    <a class="site-header__brand" href="/">
      <span class="site-header__logo" aria-hidden="true">◉</span>
      <div>
        <p class="site-header__title">${n}</p>
        <p class="site-header__subtitle">${c}</p>
      </div>
    </a>
    <nav class="site-header__nav" aria-label="Site">${a}</nav>
    <div class="site-header__aside" data-site-header-aside>
      <a class="site-header__github" href="${d}" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  `}function u(t,s={}){t&&(t.className="site-header",t.innerHTML=l(s))}export{u as m};
