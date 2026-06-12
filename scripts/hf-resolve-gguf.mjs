/**
 * Resolve GGUF + mmproj download URLs from Hugging Face (Node: cache-model / verify).
 * Searches *-GGUF repos, picks Q4_K_M + best mmproj, HEAD-verifies before returning.
 */

const HF_API = 'https://huggingface.co/api';

/** @param {Record<string, string>} [extra] */
export function hfFetchHeaders(extra = {}) {
  const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * @param {string} url
 * @returns {Promise<number>}
 */
const PROBE_TIMEOUT_MS = 45_000;

export async function probeUrl(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: hfFetchHeaders(),
      signal: ac.signal,
    });
    return res.status;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`HEAD timed out after ${PROBE_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} repo `author/name`
 * @returns {Promise<string[] | null>}
 */
export async function listRepoGgufFiles(repo) {
  const res = await fetch(`${HF_API}/models/${repo}/tree/main`, {
    headers: hfFetchHeaders(),
  });
  if (!res.ok) return null;
  const entries = await res.json();
  if (!Array.isArray(entries)) return null;
  return entries.filter((e) => e.path?.endsWith('.gguf')).map((e) => e.path);
}

/**
 * @param {string} query
 * @returns {Promise<string[]>}
 */
export async function searchGgufRepos(query) {
  const res = await fetch(
    `${HF_API}/models?search=${encodeURIComponent(query)}&limit=40`,
    { headers: hfFetchHeaders() }
  );
  if (!res.ok) return [];
  const models = await res.json();
  if (!Array.isArray(models)) return [];
  return models.map((m) => m.id).filter((id) => /gguf/i.test(id));
}

/**
 * @param {string[]} files
 * @param {RegExp} llmFileRe
 * @returns {string | null}
 */
export function pickLlmFile(files, llmFileRe) {
  const candidates = files.filter(
    (f) => llmFileRe.test(f) && !/mmproj/i.test(f) && !/\.(i1|imatrix)-/i.test(f)
  );
  if (!candidates.length) return null;
  const prefer = [
    /\.Q4_K_M\.gguf$/i,
    /\.Q5_K_M\.gguf$/i,
    /\.Q8_0\.gguf$/i,
  ];
  for (const re of prefer) {
    const hit = candidates.find((f) => re.test(f));
    if (hit) return hit;
  }
  return candidates[0];
}

/**
 * @param {string[]} files
 * @param {RegExp} mmprojFileRe
 * @returns {string | null}
 */
export function pickMmprojFile(files, mmprojFileRe) {
  const candidates = files.filter((f) => mmprojFileRe.test(f));
  if (!candidates.length) return null;
  const prefer = [
    /\.mmproj-Q8_0\.gguf$/i,
    /\.mmproj-f16\.gguf$/i,
    /\.mmproj-fp16\.gguf$/i,
    /mmproj-F16\.gguf$/i,
    /mmproj-BF16\.gguf$/i,
  ];
  for (const re of prefer) {
    const hit = candidates.find((f) => re.test(f));
    if (hit) return hit;
  }
  return candidates[0];
}

/** @param {string} repo @param {string} filename */
export function hfResolveUrl(repo, filename) {
  return `https://huggingface.co/${repo}/resolve/main/${filename}`;
}

/**
 * @typedef {object} ResolvedGgufSource
 * @property {string} url
 * @property {string} [mmprojUrl]
 * @property {string} repo
 * @property {boolean} requiresHfToken
 */

/**
 * @param {string} repo
 * @param {RegExp} llmFileRe
 * @param {RegExp} mmprojFileRe
 * @returns {Promise<ResolvedGgufSource | null>}
 */
export async function resolveFromRepo(repo, llmFileRe, mmprojFileRe) {
  const files = await listRepoGgufFiles(repo);
  if (!files?.length) return null;

  const llm = pickLlmFile(files, llmFileRe);
  if (!llm) return null;

  const mmproj = pickMmprojFile(files, mmprojFileRe);
  const url = hfResolveUrl(repo, llm);
  const mmprojUrl = mmproj ? hfResolveUrl(repo, mmproj) : undefined;

  const llmStatus = await probeUrl(url);
  if (llmStatus !== 200) return null;
  if (mmprojUrl) {
    const mmStatus = await probeUrl(mmprojUrl);
    if (mmStatus !== 200) return null;
  }

  return { repo, url, mmprojUrl, requiresHfToken: false };
}

/**
 * Never return URLs that HEAD as 404/403 — cache and verify only accept reachable files.
 * @param {ResolvedGgufSource | null | undefined} resolved
 * @returns {Promise<ResolvedGgufSource | null>}
 */
async function requireResolvedOk(resolved) {
  if (!resolved?.url) return null;
  const llm = await probeUrl(resolved.url);
  if (llm !== 200) return null;
  if (resolved.mmprojUrl) {
    const mm = await probeUrl(resolved.mmprojUrl);
    if (mm !== 200) return null;
  }
  return { ...resolved, requiresHfToken: false };
}

/** Preferred quantizers (public mirrors first). */
const REPO_AUTHOR_PREF = [
  /^noctrex\//i,
  /^localattention\//i,
  /^ggml-org\//i,
  /^mradermacher\//i,
  /^bartowski\//i,
  /^muhrehman\//i,
];

/**
 * @param {string} a @param {string} b
 */
function repoSortKey(a, b) {
  const score = (repo) => {
    let s = 0;
    for (let i = 0; i < REPO_AUTHOR_PREF.length; i++) {
      if (REPO_AUTHOR_PREF[i].test(repo)) s += 100 - i * 10;
    }
    if (/-GGUF$/i.test(repo)) s += 5;
    if (/i1-GGUF$/i.test(repo)) s -= 20;
    return s;
  };
  return score(b) - score(a);
}

/**
 * @param {{
 *   id: string;
 *   hfUrl?: string;
 *   ggufRepo?: string;
 *   ggufSearch?: string[];
 *   source?: { url?: string; mmprojUrl?: string };
 *   llmFileRe: RegExp;
 *   mmprojFileRe: RegExp;
 * }} model
 * @returns {Promise<ResolvedGgufSource>}
 */
/**
 * LLM + mmproj from different HF repos (e.g. ShowUI-2B).
 * @param {{
 *   ggufRepo: string;
 *   mmprojRepo: string;
 *   llmFileRe: RegExp;
 *   mmprojFileRe: RegExp;
 * }} model
 */
async function resolveSplitRepos(model) {
  const llmFiles = await listRepoGgufFiles(model.ggufRepo);
  const mmFiles = await listRepoGgufFiles(model.mmprojRepo);
  if (!llmFiles?.length || !mmFiles?.length) return null;

  const llm = pickLlmFile(llmFiles, model.llmFileRe);
  const mmproj = pickMmprojFile(mmFiles, model.mmprojFileRe);
  if (!llm || !mmproj) return null;

  const url = hfResolveUrl(model.ggufRepo, llm);
  const mmprojUrl = hfResolveUrl(model.mmprojRepo, mmproj);
  const llmStatus = await probeUrl(url);
  const mmStatus = await probeUrl(mmprojUrl);
  if (llmStatus !== 200 || mmStatus !== 200) return null;
  return {
    repo: `${model.ggufRepo}+${model.mmprojRepo}`,
    url,
    mmprojUrl,
    requiresHfToken: false,
  };
}

export async function resolveGgufSource(model) {
  if (model.noGgufMirror) {
    throw new Error(
      `${model.id}: no GGUF mirror on Hugging Face yet — remove from cache:all or add ggufRepo when published.`
    );
  }

  const pinnedSource = model.source?.url
    ? {
        url: model.source.url,
        mmprojUrl: model.source.mmprojUrl,
        repo:
          model.source.url.match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve/)?.[1] ??
          'configured',
        requiresHfToken: false,
      }
    : null;

  if (pinnedSource) {
    const fromSource = await requireResolvedOk(pinnedSource);
    if (fromSource) return fromSource;
    throw new Error(
      `Pinned source URLs failed (not HTTP 200) for ${model.id}. Fix source in src/config/models/*.js — run: npm run verify:models`
    );
  }

  if (model.ggufRepo && model.mmprojRepo && model.ggufRepo !== model.mmprojRepo) {
    const split = await requireResolvedOk(await resolveSplitRepos(model));
    if (split) return split;
  }

  if (model.ggufRepo) {
    const fromHint = await requireResolvedOk(
      await resolveFromRepo(model.ggufRepo, model.llmFileRe, model.mmprojFileRe)
    );
    if (fromHint) return fromHint;
  }

  if (!model.ggufSearch?.length) {
    throw new Error(
      `Could not resolve ${model.id} from ggufRepo alone. Add verified source { url, mmprojUrl } in src/config/models/*.js.`
    );
  }

  const slug = model.hfUrl?.match(/huggingface\.co\/([^/]+)\/([^/?#]+)/)?.[2];
  const queries = [...model.ggufSearch];

  const repoSet = new Set();
  for (const q of queries) {
    for (const repo of await searchGgufRepos(q)) repoSet.add(repo);
  }

  const repos = [...repoSet].sort(repoSortKey);

  for (const repo of repos) {
    const resolved = await requireResolvedOk(
      await resolveFromRepo(repo, model.llmFileRe, model.mmprojFileRe)
    );
    if (!resolved) continue;
    console.log(`[hf:resolve] ${model.id} ← ${repo}`);
    return resolved;
  }

  const tokenHint = model.requiresHfToken
    ? ' Export HF_TOKEN=hf_… if a gated quant exists.'
    : '';
  throw new Error(
    `Could not resolve reachable GGUF (HTTP 200) for ${model.id}. Add ggufRepo in src/config/models/*.js.${tokenHint}`
  );
}
