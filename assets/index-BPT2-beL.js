import{m}from"./site-header-C-Wmj6X-.js";import{c as o,a as d,g as i}from"./gallery-tasks-B-zdFWfR.js";m(document.getElementById("site-header"),{active:"home"});const c=document.getElementById("home-featured"),t=document.getElementById("home-examples-grid");function l(e){return`
    <div class="home-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle has-preview"
         style="--demo-accent: ${e.hue??"#6366f1"}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content home-card__preview-stage">
        <img class="home-card__preview-img" src="${i(e)}" alt="" decoding="async" />
      </div>
    </div>
  `}function s(e,{featured:r=!1}={}){const a=document.createElement("a");return a.className=`home-card${r?" home-card--featured":""}`,a.href=e.href,a.style.setProperty("--task-hue",e.hue??"#6366f1"),a.innerHTML=`
    ${l(e)}
    <div class="home-card__body">
      <span class="home-card__tag">${e.tag}</span>
      <h2>${e.name}</h2>
      <p class="home-card__goal">“${e.goal}”</p>
      <span class="home-card__cta">${r?"Launch app →":"Open & run →"}</span>
    </div>
  `,a}function p(){const e=o(),r=e.find(n=>n.accent)??d,a=e.filter(n=>!n.accent);c&&c.replaceChildren(s(r,{featured:!0})),t&&t.replaceChildren(...a.map(n=>s(n)))}p();
