// データ整合性チェック: node tools/check_data.mjs
import { readFileSync, existsSync } from "node:fs";

const dir = new URL("../data/", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, dir)));
const { batches } = read("index.json");
const words = [], passages = [];
let errors = 0;
const fail = (msg) => { errors++; console.error("NG:", msg); };

for (const b of batches) {
  const w = read(`words/${b}.json`), p = read(`passages/${b}.json`);
  w.forEach((x) => { x.batch = b; words.push(x); });
  p.forEach((x) => { x.batch = b; passages.push(x); });
}

const known = new Map();
for (const w of words) {
  if (known.has(w.w)) fail(`単語の重複 ${w.w}（${known.get(w.w)} と ${w.batch}）`);
  known.set(w.w, w.batch);
  if (!w.ja || !w.pos || !Array.isArray(w.forms) || !w.ety?.parts?.length || !w.ety.note) fail(`${w.w}: 訳・品詞・派生形・語源のどれかが欠けている`);
}
const count = Object.fromEntries(words.map((w) => [w.w, 0]));

const ids = new Set();
for (const p of passages) {
  if (ids.has(p.id)) fail(`段落 id 重複 ${p.id}`);
  ids.add(p.id);
  if (!p.ja || !p.topic) fail(`${p.id}: 和訳かトピックがない`);
  const first = p.text.split(/(?<=[.!?])\s/)[0];
  if (first.includes("[")) fail(`${p.id}: 1文目に空欄がある`);
  const targets = [...p.text.matchAll(/\[([^\]|]+)\|([^\]]+)\]/g)];
  if (targets.length < 4) fail(`${p.id}: 空欄が ${targets.length} 個しかない`);
  const seen = new Set();
  for (const [, surface, head] of targets) {
    if (!known.has(head)) fail(`${p.id}: 未登録の見出し語 ${head}`);
    else count[head]++;
    if (seen.has(head)) fail(`${p.id}: ${head} が同じ段落に2回`);
    seen.add(head);
    if (!/^[A-Za-z][a-z]*(-[a-z]+)?$/.test(surface)) fail(`${p.id}: 表層形 ${surface} の書式`);
  }
  if ((p.text.match(/\[/g) || []).length !== targets.length) fail(`${p.id}: 角括弧の書式崩れ`);
}
for (const [w, n] of Object.entries(count)) if (n < 2) fail(`${w} が ${n} 段落にしか出ない`);

const blanks = Object.values(count).reduce((a, b) => a + b, 0);
console.log(`batches=${batches.length} words=${words.length} passages=${passages.length} blanks=${blanks}`);

const rawPath = new URL("./awl_raw.json", import.meta.url);
if (existsSync(rawPath)) {
  const skip = new Set(["loboid", "erminal"]);
  const missing = JSON.parse(readFileSync(rawPath)).map((x) => x.word).filter((w) => !known.has(w) && !skip.has(w));
  console.log(`未収録 ${missing.length} 語${missing.length ? ": " + missing.slice(0, 15).join(" ") + (missing.length > 15 ? " …" : "") : ""}`);
}
if (errors) { console.error(`${errors} 件の問題`); process.exit(1); }
console.log("OK");
