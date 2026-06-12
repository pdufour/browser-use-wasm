#!/usr/bin/env node
/** Quick GGUF KV dump (llm + mmproj) for debugging load OOM. */
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '..', '.model-cache');

function readStr(fd) {
  const lenBuf = Buffer.alloc(8);
  fs.readSync(fd, lenBuf, 0, 8);
  const n = Number(lenBuf.readBigUInt64LE(0));
  const b = Buffer.alloc(n);
  fs.readSync(fd, b, 0, n);
  return b.toString('utf8').replace(/\0$/, '');
}

function readVal(fd, t) {
  const buf = Buffer.alloc(8);
  if (t === 4) {
    fs.readSync(fd, buf, 0, 4);
    return buf.readUInt32LE(0);
  }
  if (t === 6) {
    fs.readSync(fd, buf, 0, 4);
    return buf.readFloatLE(0);
  }
  if (t === 8) {
    fs.readSync(fd, buf, 0, 8);
    return Number(buf.readBigInt64LE(0));
  }
  if (t === 10) return readStr(fd);
  if (t === 11) {
    fs.readSync(fd, buf, 0, 1);
    return buf[0] !== 0;
  }
  if (t === 12) {
    fs.readSync(fd, buf, 0, 8);
    return buf.readBigUInt64LE(0);
  }
  throw new Error(`unknown type ${t}`);
}

function readGguf(file) {
  const fd = fs.openSync(file, 'r');
  const magic = Buffer.alloc(4);
  fs.readSync(fd, magic, 0, 4);
  if (magic.toString('utf8') !== 'GGUF') throw new Error('not gguf');
  const verBuf = Buffer.alloc(4);
  fs.readSync(fd, verBuf, 0, 4);
  const version = verBuf.readUInt32LE(0);
  const u64 = Buffer.alloc(8);
  fs.readSync(fd, u64, 0, 8);
  const nTensors = Number(u64.readBigUInt64LE(0));
  fs.readSync(fd, u64, 0, 8);
  const nKv = Number(u64.readBigUInt64LE(0));
  const kvs = {};
  for (let i = 0; i < nKv; i++) {
    const key = readStr(fd);
    const tBuf = Buffer.alloc(4);
    fs.readSync(fd, tBuf, 0, 4);
    const valType = tBuf.readUInt32LE(0);
    kvs[key] = readVal(fd, valType);
  }
  fs.closeSync(fd);
  return { version, nTensors, kvs };
}

function pick(kvs, re) {
  for (const [k, v] of Object.entries(kvs)) {
    if (re.test(k)) console.log(`  ${k}: ${v}`);
  }
}

for (const name of ['showui-2b-q4_k_m.gguf', 'mmproj-Qwen2-VL-2B-Instruct-Q8_0.gguf']) {
  const p = path.join(CACHE, name);
  if (!fs.existsSync(p)) {
    console.log(`missing ${name}`);
    continue;
  }
  console.log(`\n=== ${name} (${(fs.statSync(p).size / 1e9).toFixed(2)} GB) ===`);
  const { kvs } = readGguf(p);
  pick(kvs, /ctx|token|image|patch|vision|embd|layer|clip/i);
}
