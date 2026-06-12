import{m as n}from"./site-header-SCfu4a9Y.js";import{S as c,o as i,a as d,g as t,b as o}from"./gallery-tasks-D-misDNW.js";n(document.getElementById("site-header"),{active:"gallery"});const s=document.getElementById("gallery-grid");function l(a){return`
    <div class="task-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle has-preview"
         style="--demo-accent: ${a.hue??"#6366f1"}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <img class="task-card__preview-img" src="${t(a)}" alt="" decoding="async" />
      </div>
    </div>
  `}function p(a){const e=o(a),r=document.createElement("a");return r.className="task-card",r.href=e,r.style.setProperty("--task-hue",a.hue??"#6366f1"),r.innerHTML=`
    ${l(a)}
    <span class="task-card__tag">${a.tag}</span>
    <h2 class="task-card__name">${a.name}</h2>
    <p class="task-card__goal">“${a.goal}”</p>
    <span class="task-card__cta">Open & run →</span>
  `,r}function m(){const a=d,e=document.createElement("a");return e.className="task-card task-card--operator",e.href=i(a.goal),e.style.setProperty("--task-hue",a.hue??"#6366f1"),e.innerHTML=`
    <div class="task-card__visual demo-preview demo-preview--operator brainwave-frame brainwave-frame--compact is-idle has-preview"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <span class="orbit-dot"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <img class="task-card__preview-img" src="${t(a)}" alt="" decoding="async" />
      </div>
    </div>
    <span class="task-card__tag">${a.tag}</span>
    <h2 class="task-card__name">${a.name}</h2>
    <p class="task-card__goal">“${a.goal}”</p>
    <p class="task-card__note">browser-use-wasm — E2E gate</p>
    <span class="task-card__cta">Open operator →</span>
  `,e}function _(){if(!s)return;s.replaceChildren();const a=m(),e=c.map(p);s.append(a,...e)}_();
