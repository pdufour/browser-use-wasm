import{m}from"./site-header-DCQQ4ZcQ.js";import{a as o,S as d,g as i}from"./gallery-tasks-BIw66jG_.js";m(document.getElementById("site-header"),{active:"home"});const c=document.getElementById("home-featured"),t=document.getElementById("home-examples-grid");function l(e){return`
    <div class="home-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle has-preview"
         style="--demo-accent: ${e.hue??"#6366f1"}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content home-card__preview-stage">
        <img class="home-card__preview-img" src="${i(e)}" alt="" decoding="async" />
      </div>
    </div>
  `}function s(e,{featured:a=!1}={}){const r=document.createElement("a");return r.className=`home-card${a?" home-card--featured":""}${e.accent&&!a?" home-card--accent":""}`,r.href=e.href,r.style.setProperty("--task-hue",e.hue??"#6366f1"),r.innerHTML=`
    ${l(e)}
    <div class="home-card__body">
      <span class="home-card__tag">${e.tag}</span>
      <h2>${e.name}</h2>
      <p class="home-card__goal">“${e.goal}”</p>
      <span class="home-card__cta">${a?"Launch app →":"Open & run →"}</span>
    </div>
  `,r}function p(){const e=o(),a=e.find(n=>n.accent)??d,r=e.filter(n=>n!==a);c&&c.replaceChildren(s(a,{featured:!0})),t&&t.replaceChildren(...r.map(n=>s(n)))}p();
