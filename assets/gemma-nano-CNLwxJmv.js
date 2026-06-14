const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-Du8KZjXO.js","assets/clear-browser-cache-BPxtH0E3.js","assets/site-header-DCQQ4ZcQ.js","assets/site-header-CwZbNdxL.css"])))=>i.map(i=>d[i]);
import{m as U}from"./site-header-DCQQ4ZcQ.js";/* empty css                    */import{N,y as K,z as J,B as V,f as Y,l as T,_ as z}from"./clear-browser-cache-BPxtH0E3.js";import{i as X}from"./task-runner-BTTOXVd6.js";const Q=`const frame = document.getElementById('browse-frame');
const doc = frame.contentDocument;
const stage = doc.getElementById('capture-target');
if (!doc || !stage) {
  throw new Error('Demo page not loaded yet - wait for the checkout preview at the top');
}

const ai = window.LanguageModel || window.ai?.languageModel;
if (!ai) throw new Error('LanguageModel not found');

const session = await ai.create({
  expectedInputs: [{ type: 'text' }, { type: 'image' }],
  expectedOutputs: [{ type: 'text' }],
  temperature: 0,
  topK: 1,
});

const canvas = await window.snapdom.toCanvas(stage, {
  width: stage.offsetWidth,
  height: stage.offsetHeight,
  dpr: Math.min(2, devicePixelRatio || 1),
  embedFonts: true,
});

const jpeg = await new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encode failed'))),
    'image/jpeg',
    0.92
  );
});

const navSystem = \`You are an assistant trained to navigate the web screen.
Given a task instruction, a screen observation, and an action history sequence,
output the next action and wait for the next observation.
Format the action as: {'action': 'CLICK', 'value': None, 'position': [x,y]}
Position is 0-1 on the screenshot.\`;

const t0 = performance.now();
const raw = await session.prompt([
  {
    role: 'user',
    content: [
      { type: 'text', value: navSystem },
      { type: 'text', value: 'Task: click Submit' },
      { type: 'image', value: jpeg },
    ],
  },
  { role: 'assistant', content: "{'action':", prefix: true },
]);
session.destroy?.();

let text = String(raw ?? '').trim();
if (text && !text.startsWith("{'action':") && !text.startsWith('{"action":')) {
  text = \`{'action': \${text}\`;
}

const vision = { width: canvas.width, height: canvas.height };
let point = null;
for (const match of text.matchAll(/\\{[^{}]*\\}/g)) {
  const jsonish = match[0]
    .replace(/'/g, '"')
    .replace(/\\bNone\\b/g, 'null');
  let parsed;
  try {
    parsed = JSON.parse(jsonish);
  } catch {
    continue;
  }
  const pos = parsed.position;
  if (!Array.isArray(pos) || pos.length < 2) continue;
  let x = Number(pos[0]);
  let y = Number(pos[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  if (x <= 1 && y <= 1) point = { x: clamp(x), y: clamp(y) };
  else if (x <= 100 && y <= 100) point = { x: clamp(x / 100), y: clamp(y / 100) };
  else if (x <= vision.width && y <= vision.height) {
    point = { x: clamp(x / vision.width), y: clamp(y / vision.height) };
  }
  if (point) break;
}
if (!point) throw new Error('No [x,y] in model output: ' + (text || '(empty)'));

const rect = stage.getBoundingClientRect();
const px = rect.left + point.x * rect.width;
const py = rect.top + point.y * rect.height;
const el = doc.elementFromPoint(px, py);
if (!el) throw new Error('elementFromPoint returned null');
el.click();

const submit = doc.getElementById('btn-submit');
const hitSubmit = el === submit || (submit && submit.contains(el));

globalThis.__step3Outcome = {
  canvas,
  point,
  text,
  inferMs: Math.round(performance.now() - t0),
  hitSubmit,
  clickedLabel: el.textContent?.trim() || 'element',
  stage,
  doc,
};`;async function F(){var I,P,C;const e=document.getElementById("browse-frame"),n=e==null?void 0:e.contentDocument,o=n==null?void 0:n.getElementById("capture-target");if(!n||!o)throw new Error("Demo page not loaded yet - wait for the checkout preview at the top");const t=window.LanguageModel||((I=window.ai)==null?void 0:I.languageModel);if(!t)throw new Error("LanguageModel not found");const i=await t.create({expectedInputs:[{type:"text"},{type:"image"}],expectedOutputs:[{type:"text"}],temperature:0,topK:1}),a=await window.snapdom.toCanvas(o,{width:o.offsetWidth,height:o.offsetHeight,dpr:Math.min(2,devicePixelRatio||1),embedFonts:!0}),s=await new Promise((_,M)=>{a.toBlob(y=>y?_(y):M(new Error("JPEG encode failed")),"image/jpeg",.92)}),r=`You are an assistant trained to navigate the web screen.
Given a task instruction, a screen observation, and an action history sequence,
output the next action and wait for the next observation.
Format the action as: {'action': 'CLICK', 'value': None, 'position': [x,y]}
Position is 0-1 on the screenshot.`,f=performance.now(),c=await i.prompt([{role:"user",content:[{type:"text",value:r},{type:"text",value:"Task: click Submit"},{type:"image",value:s}]},{role:"assistant",content:"{'action':",prefix:!0}]);(P=i.destroy)==null||P.call(i);let d=String(c??"").trim();d&&!d.startsWith("{'action':")&&!d.startsWith('{"action":')&&(d=`{'action': ${d}`);const x={width:a.width,height:a.height};let u=null;for(const _ of d.matchAll(/\{[^{}]*\}/g)){const M=_[0].replace(/'/g,'"').replace(/\bNone\b/g,"null");let y;try{y=JSON.parse(M)}catch{continue}const v=y.position;if(!Array.isArray(v)||v.length<2)continue;const p=Number(v[0]),g=Number(v[1]);if(!Number.isFinite(p)||!Number.isFinite(g))continue;const h=q=>Math.min(1,Math.max(0,q));if(p<=1&&g<=1?u={x:h(p),y:h(g)}:p<=100&&g<=100?u={x:h(p/100),y:h(g/100)}:p<=x.width&&g<=x.height&&(u={x:h(p/x.width),y:h(g/x.height)}),u)break}if(!u)throw new Error(`No [x,y] in model output: ${d||"(empty)"}`);const b=o.getBoundingClientRect(),G=b.left+u.x*b.width,H=b.top+u.y*b.height,w=n.elementFromPoint(G,H);if(!w)throw new Error("elementFromPoint returned null");w.click();const E=n.getElementById("btn-submit"),W=w===E||E&&E.contains(w),k={canvas:a,point:u,text:d,inferMs:Math.round(performance.now()-f),hitSubmit:W,clickedLabel:((C=w.textContent)==null?void 0:C.trim())||"element",stage:o,doc:n};return globalThis.__step3Outcome=k,k}typeof window<"u"&&(window.snapdom=N,window.runStep3TutorialCode=F);const Z="#snippet-stage",$={expectedInputs:[{type:"text",languages:["en"]},{type:"image"}],expectedOutputs:[{type:"text",languages:["en"]}]};function ee(){var t,i,a,s,r;const e=globalThis;if(e.LanguageModel&&typeof e.LanguageModel.create=="function")return e.LanguageModel;const n=typeof window<"u"?window:null,o=((t=n==null?void 0:n.ai)==null?void 0:t.languageModel)??((i=n==null?void 0:n.ai)==null?void 0:i.textModel)??((a=n==null?void 0:n.ai)==null?void 0:a.assistant)??((s=n==null?void 0:n.model)==null?void 0:s.languageModel)??((r=n==null?void 0:n.model)==null?void 0:r.textModel)??(n==null?void 0:n.model);return o&&typeof o.create=="function"?o:null}async function te(){if(typeof window<"u"&&!window.isSecureContext)throw new Error("Prompt API needs a secure context - use npm run dev (http://127.0.0.1:5173/)");const e=ee();if(!e)throw new Error("LanguageModel not found - enable Chrome Prompt API flags");if(e.availability&&await e.availability($)==="unavailable")throw new Error("Built-in AI unavailable in this browser");return e}function l(e,n,o){const t=e.querySelector(".snippet-feedback__text")??e;t.textContent=n,e.dataset.state=o,e.hidden=!1}function ne(){const e=document.querySelector(Z);if(!e)throw new Error("#snippet-stage not found");return e}function O(e,n="Submit clicked!"){if(!(e instanceof HTMLElement))return;let o=e.querySelector(".snippet-stage__toast");o||(o=document.createElement("div"),o.className="snippet-stage__toast",o.setAttribute("role","status"),o.innerHTML='<span class="snippet-stage__toast-burst" aria-hidden="true"></span><span class="snippet-stage__toast-icon" aria-hidden="true">✓</span><span class="snippet-stage__toast-text"></span>',e.append(o));const t=o.querySelector(".snippet-stage__toast-text");t&&(t.textContent=n),o.hidden=!1,o.classList.remove("snippet-stage__toast--show"),o.offsetWidth,o.classList.add("snippet-stage__toast--show")}function oe(e){e instanceof HTMLButtonElement&&(e.classList.remove("snippet-stage__submit--hit"),e.offsetWidth,e.classList.add("snippet-stage__submit--hit"),e.addEventListener("animationend",()=>e.classList.remove("snippet-stage__submit--hit"),{once:!0}))}function ie(e){e instanceof HTMLButtonElement&&e.addEventListener("click",()=>{oe(e);const n=e.closest(".snippet-stage");n&&O(n)})}async function ae(e){const n=Math.min(2,globalThis.devicePixelRatio??1),o=Math.max(1,e.offsetWidth),t=Math.max(1,e.offsetHeight);return N.toCanvas(e,{width:o,height:t,dpr:n,scale:1,embedFonts:!0})}async function se(){return ae(ne())}function R(e,n,o,t=""){var s;const i=document.createElement("canvas");i.className="snippet-preview__canvas",i.width=n.width,i.height=n.height,(s=i.getContext("2d"))==null||s.drawImage(n,0,0);const a=document.createElement("p");if(a.className="snippet-preview__caption",a.textContent=o,e.replaceChildren(i,a),t){const r=document.createElement("pre");r.className="snippet-preview__model",r.textContent=t,e.append(r)}return e.hidden=!1,i}function re(e,n,o){const t=e.getContext("2d");if(!t)return;const i=n*e.width,a=o*e.height,s=Math.max(10,Math.round(e.width*.035));t.strokeStyle="#dc2626",t.fillStyle="rgba(220, 38, 38, 0.2)",t.lineWidth=Math.max(2,Math.round(e.width*.006)),t.beginPath(),t.arc(i,a,s,0,Math.PI*2),t.fill(),t.stroke(),t.beginPath(),t.arc(i,a,s*.35,0,Math.PI*2),t.stroke()}function ce(e,n,o){const t=document.getElementById(e),i=document.getElementById(n);!t||!i||t.addEventListener("click",async()=>{t.disabled=!0,l(i,"Running…","pending");try{l(i,`✓ ${await o()}`,"ok")}catch(a){const s=a instanceof Error?a.message:String(a);l(i,`✗ ${s}`,"error"),console.error(`[gemma-nano:snippet ${e}]`,a)}finally{t.disabled=!1}})}function le(){const e=document.getElementById("btn-try-snapdom"),n=document.getElementById("snapdom-result"),o=document.getElementById("snapdom-preview");!e||!n||!o||e.addEventListener("click",async()=>{e.disabled=!0,o.hidden=!0,o.replaceChildren(),l(n,"Running…","pending");try{const t=await se();R(o,t,`${t.width}×${t.height}px - bitmap Gemma would receive (Step 3 marks the click on this)`),l(n,`✓ Captured ${t.width}×${t.height}px - preview below`,"ok")}catch(t){const i=t instanceof Error?t.message:String(t);l(n,`✗ ${i}`,"error"),console.error("[gemma-nano:snippet btn-try-snapdom]",t)}finally{e.disabled=!1}})}function de(e){const n=window.scrollX,o=window.scrollY,t=()=>window.scrollTo({left:n,top:o,behavior:"instant"});return Promise.resolve(e()).finally(()=>{t(),requestAnimationFrame(()=>{t(),requestAnimationFrame(t)})})}function ue(){const e=document.getElementById("btn-run-grounding"),n=document.getElementById("grounding-result"),o=document.getElementById("grounding-preview");!e||!n||!o||e.addEventListener("click",()=>{de(async()=>{e.disabled=!0,o.hidden=!0,o.replaceChildren(),l(n,"Running…","pending");try{const t=await F(),i=R(o,t.canvas,`Gemma @ [${t.point.x.toFixed(2)}, ${t.point.y.toFixed(2)}] - red ring is where the model pointed`,t.text);re(i,t.point.x,t.point.y),t.hitSubmit&&O(t.stage,"Submit clicked!"),l(n,t.hitSubmit?`✓ Gemma hit Submit @ [${t.point.x.toFixed(2)}, ${t.point.y.toFixed(2)}] in ${t.inferMs}ms`:`⚠ Gemma pointed @ [${t.point.x.toFixed(2)}, ${t.point.y.toFixed(2)}] but clicked "${t.clickedLabel}" (${t.inferMs}ms)`,t.hitSubmit?"ok":"error")}catch(t){const i=t instanceof Error?t.message:String(t);l(n,`✗ ${i}`,"error"),console.error("[gemma-nano:snippet btn-run-grounding]",t)}finally{e.disabled=!1,e.focus({preventScroll:!0})}})})}async function me(){var o;const n=await(await te()).create({...$,temperature:0,topK:1});try{return"Multimodal session created"}finally{(o=n.destroy)==null||o.call(n)}}function pe(e){if(!(e instanceof HTMLElement))return;const n=document.createRange();n.selectNodeContents(e);const o=window.getSelection();o==null||o.removeAllRanges(),o==null||o.addRange(n)}function ge(){for(const e of document.querySelectorAll(".interactive-snippet .code-block code"))e.addEventListener("dblclick",n=>{n.preventDefault(),pe(e)})}function he(){const e=document.getElementById("step3-tutorial-code");e&&(e.textContent=Q),ge(),ce("btn-run-prompt-api","prompt-api-result",me),le(),ue(),ie(document.getElementById("snippet-submit"))}he();K("gemma-nano");J("gemma-nano");const S=new URLSearchParams(location.search),j=S.get("url")??S.get("u")??V,D=S.get("goal")??"type Joe in the email field";Y("gemma-nano","boot params",{initialUrl:j,initialGoal:D});const fe={ai:!!window.ai,aiProps:window.ai?Object.keys(window.ai):[],model:!!window.model,modelProps:window.model?Object.keys(window.model):[],isSecure:window.isSecureContext};console.info("[gemma-nano:diag]",fe);T("gemma-nano:html");U(document.getElementById("site-header"),{active:"gallery"});T("gemma-nano:after-header");X({initialUrl:j,initialGoal:D,frameTitle:"Gemma 4 Nano Demo",wireSiteHeader:!0,useNativeAi:!0,hideDevDetails:!1,inlineCapturePanel:!0});S.has("e2e")&&z(async()=>{const{buildShowUINavigationMessages:e,mapShowUIMessagesToPromptApiTurns:n,navigationPositionToPoint:o}=await import("./index-Du8KZjXO.js");return{buildShowUINavigationMessages:e,mapShowUIMessagesToPromptApiTurns:n,navigationPositionToPoint:o}},__vite__mapDeps([0,1,2,3])).then(({buildShowUINavigationMessages:e,mapShowUIMessagesToPromptApiTurns:n,navigationPositionToPoint:o})=>{globalThis.__e2ePromptApiTurnShape=()=>{const t=new Uint8Array([255,216,255,0,0,0]).buffer,i=e(t,"click Submit"),a=n(i),s=a.find(c=>c.role==="user"),r=a.find(c=>c.role==="assistant"),f=s&&Array.isArray(s.content)?s.content:[];return{turnCount:a.length,userTurnCount:a.filter(c=>c.role==="user").length,userPartCount:f.length,textPartCount:f.filter(c=>c.type==="text").length,hasImagePart:f.some(c=>c.type==="image"),assistantPrefix:(r==null?void 0:r.prefix)===!0}},globalThis.__e2eNavPositionNorm=()=>{const t={width:840,height:364},i=o([200,165],t),a=o([.2,.165],t),s=o([820,300],t);return{pixel:i?{x:+i.x.toFixed(3),y:+i.y.toFixed(3)}:null,norm:a,submit:s?{x:+s.x.toFixed(3),y:+s.y.toFixed(3)}:null}}});const m=document.getElementById("native-ai-modal"),L=document.getElementById("btn-show-requirements"),B=document.getElementById("btn-close-modal");L&&m&&L.addEventListener("click",()=>{m.hidden=!1});B&&m&&B.addEventListener("click",()=>{m.hidden=!0});m&&m.addEventListener("click",e=>{e.target===m&&(m.hidden=!0)});const A=document.getElementById("btn-verify-ai");A&&A.addEventListener("click",async()=>{const e={window_ai:!!window.ai,window_model:!!window.model,globalThis_ai:!!globalThis.ai,navigator_ai:!!navigator.ai,isSecure:window.isSecureContext,userAgent:navigator.userAgent};console.group("🔍 AI Status Verification"),console.info("Environment:",e);const n=window.ai||window.model||navigator.ai;if(n){console.info("AI Object Keys:",Object.keys(n));const o=n.languageModel||n.textModel||n.assistant||(n.create?n:null);if(o){console.info("Language Model found:",o);try{const t=await o.capabilities();console.info("Capabilities:",t)}catch(t){console.warn("capabilities() failed or missing:",t.message)}}else console.warn("AI object exists but no languageModel/assistant found.")}else console.error("No AI object found in any namespace.");console.groupEnd(),alert(`Verification logged to console (F12).
Status: ${n?"AI Object Detected":"NOT FOUND"}
Secure: ${e.isSecure}`)});
