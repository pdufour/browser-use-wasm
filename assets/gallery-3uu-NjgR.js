import{m as c,w as o}from"./site-header-DCQQ4ZcQ.js";import{b as d,o as i,S as l,g as t,G as p,c as m}from"./gallery-tasks-DDh8zhdl.js";c(document.getElementById("site-header"),{active:"gallery"});const r=document.getElementById("gallery-grid");function n(a){return`
    <div class="task-card__visual demo-preview brainwave-frame brainwave-frame--compact is-idle has-preview"
         style="--demo-accent: ${a.hue??"#6366f1"}"
         aria-hidden="true">
      <span class="brainwave-frame__floor"></span>
      <span class="orbit-ring"></span>
      <div class="brainwave-frame__content task-card__preview-stage">
        <img class="task-card__preview-img" src="${t(a)}" alt="" decoding="async" />
      </div>
    </div>
  `}function _(a){const e=m(a),s=document.createElement("a");return s.className="task-card",s.href=e,s.style.setProperty("--task-hue",a.hue??"#6366f1"),s.innerHTML=`
    ${n(a)}
    <span class="task-card__tag">${a.tag}</span>
    <h2 class="task-card__name">${a.name}</h2>
    <p class="task-card__goal">“${a.goal}”</p>
    <span class="task-card__cta">Open & run →</span>
  `,s}function g(){const a=p,e=document.createElement("a");return e.className="task-card task-card--accent",e.href=o("gemma-nano/"),e.style.setProperty("--task-hue",a.hue??"#10b981"),e.innerHTML=`
    ${n(a)}
    <span class="task-card__tag">${a.tag}</span>
    <h2 class="task-card__name">${a.name}</h2>
    <p class="task-card__goal">“${a.goal}”</p>
    <p class="task-card__note">Chrome Prompt API — Gemma 4 Nano</p>
    <span class="task-card__cta">Open native demo →</span>
  `,e}function u(){const a=l,e=document.createElement("a");return e.className="task-card task-card--operator",e.href=i(a.goal),e.style.setProperty("--task-hue",a.hue??"#6366f1"),e.innerHTML=`
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
  `,e}function v(){if(!r)return;r.replaceChildren();const a=u(),e=g(),s=d.map(_);r.append(a,e,...s)}v();
