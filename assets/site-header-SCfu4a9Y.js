(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))i(e);new MutationObserver(e=>{for(const s of e)if(s.type==="childList")for(const n of s.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&i(n)}).observe(document,{childList:!0,subtree:!0});function a(e){const s={};return e.integrity&&(s.integrity=e.integrity),e.referrerPolicy&&(s.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?s.credentials="include":e.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(e){if(e.ep)return;e.ep=!0;const s=a(e);fetch(e.href,s)}})();const u="browser-use-wasm",d="SnapDOM · ShowUI · WASM",l="https://github.com/pdufour/browser-use-wasm";function o(){const r="/browser-use-wasm/";return r.endsWith("/")?r:`${r}/`}function c(r){return`${o()}${String(r??"").replace(/^\//,"")}`}function h(r){const t=String(r??"").trim();if(!t)return o();if(/^https?:\/\//i.test(t))return t;const a=o();return t.startsWith(a)?t:c(t)}function f({active:r="home"}={}){const a=[{id:"home",href:c(""),label:"Home"}].map(i=>`<a href="${i.href}" class="${r===i.id?"is-active":""}">${i.label}</a>`).join("");return`
    <a class="site-header__brand" href="${c("")}">
      <span class="site-header__logo" aria-hidden="true">◉</span>
      <div>
        <p class="site-header__title">${u}</p>
        <p class="site-header__subtitle">${d}</p>
      </div>
    </a>
    <nav class="site-header__nav" aria-label="Site">${a}</nav>
    <div class="site-header__aside" data-site-header-aside>
      <a class="site-header__github" href="${l}" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  `}function p(r,t={}){r&&(r.className="site-header",r.innerHTML=f(t))}export{p as m,h as r,c as w};
