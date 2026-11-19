// データ整合性チェック: node tools/check_data.mjs
import { readFileSync } from "node:fs";

const words = JSON.parse(readFileSync(new URL("../data/words.json", import.meta.url)));
const passages = JSON.parse(readFileSync(new URL("../data/passages.json", import.meta.url)));
const known = new Set(words.map((w) => w.w));
const count = Object.fromEntries(words.map((w) => [w.w, 0]));
let errors = 0;
const fail = (msg) => { errors++; console.error("NG:", msg); };

const ids = new Set();
for (const p of passages) {
  if (ids.has(p.id)) fail(`id 重複 ${p.id}`);
  ids.add(p.id);
  if (!p.ja) fail(`${p.id}: 和訳なし`);
  const firstSentence = p.text.split(/(?<=[.!?])\s/)[0];
  if (firstSentence.includes("[")) fail(`${p.id}: 1文目に空欄がある`);
  const targets = [...p.text.matchAll(/\[([^\]|]+)\|([^\]]+)\]/g)];
  if (targets.length < 4) fail(`${p.id}: 空欄が ${targets.length} 個しかない`);
  for (const [, surface, head] of targets) {
    if (!known.has(head)) fail(`${p.id}: 未登録の見出し語 ${head}`);
    else count[head]++;
    if (!/^[a-z]+$/.test(surface)) fail(`${p.id}: 表層形 ${surface} に英小文字以外`);
  }
  if ((p.text.match(/\[/g) || []).length !== targets.length) fail(`${p.id}: 角括弧の書式崩れ`);
}
for (const [w, n] of Object.entries(count)) if (n < 2) fail(`${w} が ${n} 段落にしか出ない`);
for (const w of words) if (!w.ja || !w.ety?.parts?.length) fail(`${w.w}: 訳か語源が欠けている`);

console.log(`words=${words.length} passages=${passages.length} blanks=${Object.values(count).reduce((a, b) => a + b, 0)}`);
if (errors) { console.error(`${errors} 件の問題`); process.exit(1); }
console.log("OK");
