new TextDecoder;const b=o=>!!(o!=null&&o.startsWith),F=()=>!!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/),h=o=>{const e=URL.createObjectURL(b(o)?new Blob([o],{type:"text/javascript"}):o);return new Worker(e,{type:"module"})},p=`let accessHandle;
let abortController = new AbortController();

async function openFile(filename) {
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });
  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });
  accessHandle = await fileHandler.createSyncAccessHandle();
  accessHandle.truncate(0); // clear file content
}

async function writeFile(buf) {
  accessHandle.write(buf);
}

async function closeFile() {
  accessHandle.flush();
  accessHandle.close();
}

async function writeTextFile(filename, str) {
  await openFile(filename);
  await writeFile(new TextEncoder().encode(str));
  await closeFile();
}

const throttled = (func, delay) => {
  let lastRun = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastRun > delay) {
      lastRun = now;
      func.apply(null, args);
    }
  };
};

const assertNonNull = (val) => {
  if (val === null || val === undefined) {
    throw new Error('OPFS Worker: Assertion failed');
  }
};

// respond to main thread
const resOK = () => postMessage({ ok: true });
const resProgress = (loaded, total) =>
  postMessage({ progress: { loaded, total } });
const resErr = (err) => postMessage({ err });

onmessage = async (e) => {
  try {
    if (!e.data) return;

    /**
     * @param {Object} e.data
     *
     * Fine-control FS actions:
     * - { action: 'open', filename: 'string' }
     * - { action: 'write', buf: ArrayBuffer }
     * - { action: 'close' }
     *
     * Simple write API:
     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }
     *
     * Download API:
     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }
     * - { action: 'download-abort' }
     */
    const {
      action,
      filename,
      buf,
      url,
      options,
      metadataFileName,
      metadataAdditional,
    } = e.data;

    if (action === 'open') {
      assertNonNull(filename);
      await openFile(filename);
      return resOK();
    } else if (action === 'write') {
      assertNonNull(buf);
      await writeFile(buf);
      return resOK();
    } else if (action === 'close') {
      await closeFile();
      return resOK();
    } else if (action === 'write-simple') {
      assertNonNull(filename);
      assertNonNull(buf);
      await openFile(filename);
      await writeFile(buf);
      await closeFile();
      return resOK();
    } else if (action === 'download') {
      assertNonNull(url);
      assertNonNull(filename);
      assertNonNull(metadataFileName);
      assertNonNull(options);
      assertNonNull(options.aborted);
      abortController = new AbortController();
      if (options.aborted) abortController.abort();
      const response = await fetch(url, {
        ...options,
        signal: abortController.signal,
      });
      const contentLength = response.headers.get('content-length');
      const etag = (response.headers.get('etag') || '').replace(
        /[^A-Za-z0-9]/g,
        ''
      );
      const total = parseInt(contentLength, 10);
      const reader = response.body.getReader();
      await openFile(filename);
      let loaded = 0;
      const throttledProgress = throttled(resProgress, 100);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        await writeFile(value);
        throttledProgress(loaded, total);
      }
      resProgress(total, total); // 100% done
      await closeFile();
      // make sure this is in-sync with CacheEntryMetadata
      await writeTextFile(
        metadataFileName,
        JSON.stringify({
          originalURL: url,
          originalSize: total,
          etag,
          ...metadataAdditional,
        })
      );
      return resOK();
    } else if (action === 'download-abort') {
      if (abortController) {
        abortController.abort();
      }
      return;
    }

    throw new Error('OPFS Worker: Invalid action', e.data);
  } catch (err) {
    return resErr(err);
  }
};
`,c="__metadata__",N="polyfill_for_older_version";class R{async getNameFromURL(e){return await d(e,"")}async write(e,n,t){return this.writeMetadata(e,t),await g(e,n)}async download(e,n={}){const t=h(p);let a=!1;n.signal&&(a=n.signal.aborted,n.signal.addEventListener("abort",()=>{a=!0,t.postMessage({action:"download-abort"})}),delete n.signal);const r=await d(e,c),i=await d(e,"");return await new Promise((s,f)=>{t.postMessage({action:"download",url:e,filename:i,metadataFileName:r,metadataAdditional:n.metadataAdditional??{},options:{headers:n.headers,aborted:a}}),t.onmessage=l=>{var u;if(l.data.ok)t.terminate(),s();else if(l.data.err)t.terminate(),f(l.data.err);else if(l.data.progress){const y=l.data.progress;(u=n.progressCallback)==null||u.call(n,y)}else f(new Error("Unknown message from worker")),console.error("Unknown message from worker",l.data)}})}async open(e){return await m(e)}async getSize(e){return await S(e)}async getMetadata(e){const n=await m(e,c),t=await this.getSize(e);if(!n)return t>0?{etag:N,originalSize:t,originalURL:""}:null;try{return await new Response(n).json()}catch{return null}}async list(){const e=await w(),n=[],t={};for await(let[a,r]of e.entries())if(r.kind==="file"&&a.startsWith(c)){const i=(await r.getFile()).stream(),s=await new Response(i).json().catch(f=>null);t[a.replace(c,"")]=s}for await(let[a,r]of e.entries())r.kind==="file"&&!a.startsWith(c)&&n.push({name:a,size:await r.getFile().then(i=>i.size),metadata:t[a]||{originalSize:(await r.getFile()).size,originalURL:"",etag:""}});return n}async clear(){await this.deleteMany(()=>!0)}async delete(e){const n=await this.getNameFromURL(e);await this.deleteMany(t=>t.name===e||t.name===n)}async deleteMany(e){const n=await w(),t=await this.list();for(const a of t)e(a)&&n.removeEntry(a.name)}async writeMetadata(e,n){const t=new Blob([JSON.stringify(n)],{type:"text/plain"});await g(e,t.stream(),c)}}async function g(o,e,n=""){try{const t=await d(o,n),a=await A(t);await a.truncate(0);const r=e.getReader();for(;;){const{done:i,value:s}=await r.read();if(i)break;await a.write(s)}await a.close()}catch(t){console.error("opfsWrite",t)}}async function m(o,e=""){const n=async r=>{try{return await(await(await w()).getFileHandle(r)).getFile()}catch{return null}};let t=await n(o);if(t)return t;const a=await d(o,e);return t=await n(a),t}async function S(o,e=""){try{const n=await w(),t=await d(o,e);return(await(await n.getFileHandle(t)).getFile()).size}catch{return-1}}async function d(o,e){const n=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(o)),a=Array.from(new Uint8Array(n)).map(r=>r.toString(16).padStart(2,"0")).join("");return`${e}${a}_${o.split("/").pop()}`}async function w(){return await(await navigator.storage.getDirectory()).getDirectoryHandle("cache",{create:!0})}async function A(o){const e=h(p);let n,t;e.onmessage=r=>{r.data.ok?n(null):r.data.err&&t(r.data.err)};const a=r=>new Promise((i,s)=>{n=i,t=s,e.postMessage(r,F()?void 0:{transfer:r.value?[r.value.buffer]:[]})});return await a({open:o}),{truncate:async()=>{},write:r=>a({value:r}),close:async()=>{await a({done:!0}),e.terminate()}}}export{R as CacheManager,N as POLYFILL_ETAG};
