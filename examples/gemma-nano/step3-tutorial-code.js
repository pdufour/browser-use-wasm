/** Tutorial body for Step 3 — shown in the page; copy-paste into the console or click Run. */
export const STEP3_TUTORIAL_CODE = `const frame = document.getElementById('browse-frame');
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
};`;

export async function runStep3TutorialCode() {
  const frame = document.getElementById('browse-frame');
  const doc = frame?.contentDocument;
  const stage = doc?.getElementById('capture-target');
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

  const navSystem = `You are an assistant trained to navigate the web screen.
Given a task instruction, a screen observation, and an action history sequence,
output the next action and wait for the next observation.
Format the action as: {'action': 'CLICK', 'value': None, 'position': [x,y]}
Position is 0-1 on the screenshot.`;

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
    text = `{'action': ${text}`;
  }

  const vision = { width: canvas.width, height: canvas.height };
  let point = null;
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    const jsonish = match[0]
      .replace(/'/g, '"')
      .replace(/\bNone\b/g, 'null');
    let parsed;
    try {
      parsed = JSON.parse(jsonish);
    } catch {
      continue;
    }
    const pos = parsed.position;
    if (!Array.isArray(pos) || pos.length < 2) continue;
    const x = Number(pos[0]);
    const y = Number(pos[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    if (x <= 1 && y <= 1) point = { x: clamp(x), y: clamp(y) };
    else if (x <= 100 && y <= 100) point = { x: clamp(x / 100), y: clamp(y / 100) };
    else if (x <= vision.width && y <= vision.height) {
      point = { x: clamp(x / vision.width), y: clamp(y / vision.height) };
    }
    if (point) break;
  }
  if (!point) throw new Error(`No [x,y] in model output: ${text || '(empty)'}`);

  const rect = stage.getBoundingClientRect();
  const px = rect.left + point.x * rect.width;
  const py = rect.top + point.y * rect.height;
  const el = doc.elementFromPoint(px, py);
  if (!el) throw new Error('elementFromPoint returned null');
  el.click();

  const submit = doc.getElementById('btn-submit');
  const hitSubmit = el === submit || (submit && submit.contains(el));

  const outcome = {
    canvas,
    point,
    text,
    inferMs: Math.round(performance.now() - t0),
    hitSubmit,
    clickedLabel: el.textContent?.trim() || 'element',
    stage,
    doc,
  };
  globalThis.__step3Outcome = outcome;
  return outcome;
}
