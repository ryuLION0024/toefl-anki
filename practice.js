// 書く・話すタブ：テンプレート暗記（段階的穴埋め）/ Build a Sentence / Listen and Repeat / Take an Interview
export const PACK_KEY = "toefl-anki-pack";
const LEVELS = [0, 0.25, 0.5, 0.75, 1]; // 穴埋めの割合。level 4 は全文を書く、5 = 完全暗記
const DONE = 5;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const norm = (w) => w.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']/g, "");
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let ctx; // { view, getState, save, speak, stopTimers }
let PUB = { build: [], repeat: [], templates: [], interview: [] };
let timer = null;
const clearTimer = () => { clearInterval(timer); timer = null; };

// 自作の自己チェック（TST Prep データが無いとき用）
const OWN_CHECKS = {
  interview: ["45秒近く話し続けられたか", "最初の一文で質問に直接答えたか", "具体的な体験・例を入れたか", "つなぎ言葉を2つ以上使ったか", "「uh」「um」などの言いよどみが少なかったか", "最後に自分の立場をもう一度まとめたか"],
  repeat: ["語を足したり抜かしたりしなかったか", "語尾（-s、-ed など）まで正しく言えたか", "言いよどみ・言い直しがなかったか", "自然な速さで、まとまりごとに区切って言えたか"],
};

export async function initPractice(c) {
  ctx = c;
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : []));
  const [build, repeat, templates, interview] = await Promise.all(["build", "repeat", "templates", "interview"].map((n) => get(`data/practice/${n}.json`)));
  PUB = { build, repeat, templates, interview };
}

export function loadPack() {
  try { return JSON.parse(localStorage.getItem(PACK_KEY) || "null"); } catch { return null; }
}
export function savePack(p) {
  try { localStorage.setItem(PACK_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
export function clearPack() { try { localStorage.removeItem(PACK_KEY); } catch { /* noop */ } }

function data() {
  const pack = loadPack();
  const tag = (arr) => (arr || []).map((x) => ({ ...x, tst: true }));
  return {
    build: [...PUB.build, ...tag(pack?.build)],
    repeat: [...PUB.repeat, ...tag(pack?.repeat)],
    templates: [...PUB.templates, ...tag(pack?.templates)],
    interview: [...PUB.interview, ...tag(pack?.interview)],
    checklists: tag(pack?.checklists),
    hasPack: !!pack,
  };
}
function prog() {
  const s = ctx.getState();
  s.practice ||= {};
  s.practice.tpl ||= {}; s.practice.notes ||= {}; s.practice.build ||= {}; s.practice.repeat ||= {}; s.practice.iv ||= {};
  return s.practice;
}
const badge = (x) => (x.tst ? ' <span class="tag">TST</span>' : "");
const lvDots = (lv) => `<span class="dots${lv >= DONE ? " done" : ""}">${Array.from({ length: DONE }, (_, i) => `<i class="${i < lv ? "f" : ""}"></i>`).join("")}</span>`;

// ---------------- 一覧 ----------------
export function renderPractice() {
  clearTimer();
  const D = data(), P = prog();
  const groups = {};
  D.templates.forEach((t) => (groups[t.group] ||= []).push(t));
  const done = D.templates.filter((t) => (P.tpl[t.id]?.level || 0) >= DONE).length;
  const buildOk = D.build.filter((b) => (P.build[b.id]?.ok || 0) > 0).length;
  ctx.view().innerHTML = `
    <section class="panel">
      <h2>テンプレート・模範解答の暗記（${done} / ${D.templates.length} 完全暗記）</h2>
      <p class="muted small" style="margin-top:0">読む → 型フレーズの半分 → 型フレーズすべて → 型＋その他 → 全文を書く、の5段階。9割正解で次の段階へ。どの画面でも「和訳」を開けます。</p>
      ${Object.entries(groups).map(([g, list]) => `
        <h3 class="sub">${esc(g)}</h3>
        <ul class="wlist">${list.map((t) => `<li data-tpl="${esc(t.id)}"><span class="m" style="color:var(--text);font-size:15px">${esc(t.title)}${badge(t)}</span>${lvDots(P.tpl[t.id]?.level || 0)}</li>`).join("")}</ul>`).join("")}
    </section>
    <section class="panel">
      <h2>Build a Sentence（${buildOk} / ${D.build.length} 問 正解済み）</h2>
      <p class="muted small" style="margin-top:0">語句をタップして正しい順に並べます。本番は10問・1問35秒。</p>
      <button class="btn" id="bs">10問に挑戦</button>
    </section>
    <section class="panel">
      <h2>Listen and Repeat</h2>
      <p class="muted small" style="margin-top:0">音声を1回聞いて声に出して繰り返します。録音して聞き比べ、書き取りで正確さも確認できます。</p>
      <ul class="wlist">${D.repeat.map((r) => `<li data-lr="${esc(r.id)}"><span class="m" style="color:var(--text);font-size:15px">${esc(r.title)}${badge(r)}</span><span class="muted small">${P.repeat[r.id]?.best != null ? `書き取り最高 ${P.repeat[r.id].best}%` : "未挑戦"}</span></li>`).join("")}</ul>
    </section>
    <section class="panel">
      <h2>最初の一文ドリル</h2>
      <p class="muted small" style="margin-top:0">Interview の質問を聞いて、5秒以内に型を使った最初の一文を言う練習。1回10問・2分ほど。${P.drill ? `自己ベスト ${P.drill.best}/10` : ""}</p>
      <button class="btn" id="drill">10問に挑戦</button>
    </section>
    <section class="panel">
      <h2>Take an Interview</h2>
      <p class="muted small" style="margin-top:0">質問を聞いて、準備なしで45秒話します。時間配分の目安を見ながら話し、文字起こしの自動チェックと録音で振り返ります。</p>
      <ul class="wlist">${D.interview.map((r) => `<li data-iv="${esc(r.id)}"><span class="m" style="color:var(--text);font-size:15px">${esc(r.topic)}${badge(r)}</span><span class="muted small">${P.iv[r.id] ? `${P.iv[r.id]}回` : "未挑戦"}</span></li>`).join("")}</ul>
    </section>
    ${D.hasPack ? "" : `<p class="muted small">「記録・設定」から TST Prep の個人用データを読み込むと、PDF のテンプレート・模範解答・例題もここに加わります（TST マーク付き）。</p>`}`;
  ctx.view().querySelectorAll("[data-tpl]").forEach((li) => li.onclick = () => startTemplate(li.dataset.tpl));
  ctx.view().querySelectorAll("[data-lr]").forEach((li) => li.onclick = () => startRepeat(li.dataset.lr));
  ctx.view().querySelectorAll("[data-iv]").forEach((li) => li.onclick = () => startInterview(li.dataset.iv));
  $("#bs").onclick = startBuild;
  $("#drill").onclick = startDrill;
}

function backBar(title) {
  return `<div class="qhead"><button class="linkbtn" id="back">← 戻る</button><span class="topic">${esc(title)}</span><span class="timer" id="timer"></span></div>`;
}
function bindBack() { $("#back").onclick = () => { speechSynthesis?.cancel?.(); rec.stop(); stt.stop(); renderPractice(); window.scrollTo(0, 0); }; }

// ---------------- テンプレート暗記 ----------------
// [[ ]] で囲んだ部分が「型フレーズ」。印が無いもの（TST 原文など）は同じグループの型から自動で見つける
const plain = (s) => s.replace(/\[\[|\]\]/g, "");
const speakable = (s) => plain(s).replace(/\([^)]*\)/g, " ");

function tokenize(text) {
  const out = []; let paren = 0, key = false;
  text.split("\n").forEach((line, li) => {
    if (li) out.push({ br: true });
    line.split(/\s+/).filter(Boolean).forEach((raw) => {
      const startKey = raw.includes("[[");
      const endKey = raw.includes("]]");
      const tok = plain(raw);
      if (!tok) { if (startKey) key = true; if (endKey) key = false; return; }
      const isKey = key || startKey;
      if (startKey) key = true;
      if (endKey) key = false;
      const opens = (tok.match(/\(/g) || []).length, closes = (tok.match(/\)/g) || []).length;
      const inParen = paren > 0 || opens > 0;
      paren += opens - closes; if (paren < 0) paren = 0;
      const m = tok.match(/^([^A-Za-z0-9']*)(.*?)([^A-Za-z0-9']*)$/);
      const core = m ? m[2] : tok;
      out.push({ tok, key: isKey && !inParen, paren: inParen, lead: m ? m[1] : "", core, trail: m ? m[3] : "",
        blankable: !inParen && /[A-Za-z]/.test(core) && core.replace(/[^A-Za-z]/g, "").length >= 2 });
    });
  });
  return out;
}

// 同じグループの「型」（タイトルに「型」を含む項目）に出てくる2〜8語の連なりを型フレーズとみなす
function autoKeys(t, toks) {
  if (toks.some((x) => x.key)) return;
  const frames = data().templates.filter((f) => f.group === t.group && f.id !== t.id && /型|structure|template/i.test(f.title + f.id) && !/例|-ex$/.test(f.title + f.id));
  const grams = new Set();
  frames.forEach((f) => {
    plain(f.text).split(/\([^)]*\)|\n|\.\.\.|…|[.?!](?=\s|$)/).forEach((seg) => {
      const w = seg.split(/\s+/).map(norm).filter(Boolean);
      for (let i = 0; i < w.length; i++) for (let n = 2; n <= 8 && i + n <= w.length; n++) grams.add(w.slice(i, i + n).join(" "));
    });
  });
  if (!grams.size) return;
  const idx = toks.map((x, i) => (x.br || x.paren || !norm(x.core) ? -1 : i)).filter((i) => i >= 0);
  const words = idx.map((i) => norm(toks[i].core));
  const ends = idx.map((i) => /[.?!]/.test(toks[i].trail)); // 文末の語を越えて一致させない
  for (let s = 0; s < words.length; s++) {
    let max = 1; while (max < 8 && s + max < words.length && !ends[s + max - 1]) max++;
    for (let n = max; n >= 2; n--) {
      const g = words.slice(s, s + n);
      if (g.join("").length >= 9 && grams.has(g.join(" "))) { for (let k = s; k < s + n; k++) toks[idx[k]].key = true; s += n - 1; break; }
    }
  }
}

// 段階ごとの穴の選び方：1 = 型の半分、2 = 型すべて、3 = 型すべて＋その他40%。型が無い文章は 25/50/75%
function pickBlanks(toks, lv) {
  const all = toks.map((x, i) => (x.blankable ? i : -1)).filter((i) => i >= 0);
  const key = all.filter((i) => toks[i].key), other = all.filter((i) => !toks[i].key);
  if (key.length < 3) return new Set(shuffle(all).slice(0, Math.max(1, Math.round(all.length * LEVELS[lv]))));
  if (lv === 1) return new Set(shuffle(key).slice(0, Math.ceil(key.length / 2)));
  if (lv === 2) return new Set(key);
  return new Set([...key, ...shuffle(other).slice(0, Math.round(other.length * 0.4))]);
}
const LV_LABEL = (hasKey) => hasKey
  ? ["0：読んで覚える（色付き＝型フレーズ）", "1：型フレーズの半分を穴埋め", "2：型フレーズをすべて穴埋め", "3：型フレーズ＋その他40%を穴埋め", "4：何も見ずに全文を書く"]
  : ["0：読んで覚える", "1：25% 穴埋め", "2：50% 穴埋め", "3：75% 穴埋め", "4：何も見ずに全文を書く"];

// TST 原文には自分で和訳を書く（学習記録と一緒に保存され、進捗のコピーで他の端末にも移る）
function noteHtml(t, open) {
  const note = prog().notes[t.id] || "";
  return `<details class="jabox" id="notebox"${open && note ? " open" : ""}><summary>自分の和訳メモ${note ? "" : "（未記入）"}</summary>
    <p class="ja pre" id="notetext"${note ? "" : " hidden"}>${esc(note)}</p>
    <textarea id="noteedit" class="recall" rows="4" placeholder="この文章の和訳や覚え方のメモを書いて保存" ${note ? "hidden" : ""}>${esc(note)}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn sub" id="notebtn">${note ? "編集" : "保存"}</button></div></details>`;
}
function bindNote(t) {
  const btn = $("#notebtn"); if (!btn) return;
  btn.onclick = () => {
    const ed = $("#noteedit"), tx = $("#notetext");
    if (ed.hidden) { ed.hidden = false; tx.hidden = true; btn.textContent = "保存"; ed.focus(); return; }
    const v = ed.value.trim(), P = prog();
    if (v) P.notes[t.id] = v; else delete P.notes[t.id];
    ctx.save();
    tx.textContent = v; tx.hidden = !v; ed.hidden = !!v; btn.textContent = v ? "編集" : "保存";
    $("#notebox summary").textContent = `自分の和訳メモ${v ? "" : "（未記入）"}`;
  };
}

function jaHtml(t, open) {
  if (!t.ja && !t.noteJa) return t.tst ? noteHtml(t, open) : "";
  return `<details class="jabox"${open ? " open" : ""}><summary>和訳</summary>${t.noteJa ? `<p class="ja"><b>課題：</b>${esc(t.noteJa)}</p>` : ""}${t.ja ? `<p class="ja pre">${esc(t.ja)}</p>` : ""}</details>`;
}
const wordSpan = (x, cls = "") => `<span class="${[x.paren ? "ph" : "", x.key ? "key" : "", cls].filter(Boolean).join(" ")}">${esc(x.tok)}</span> `;

function startTemplate(id) {
  const t = data().templates.find((x) => x.id === id);
  const P = prog();
  const lv = Math.min(P.tpl[id]?.level || 0, 4);
  const toks = tokenize(t.text);
  autoKeys(t, toks);
  const hasKey = toks.filter((x) => x.key && x.blankable).length >= 3;
  const head = `${backBar(t.title)}
    ${t.note ? `<p class="direction">${esc(t.note)}</p>` : ""}
    <p class="muted small">段階 ${LV_LABEL(hasKey)[lv]} ${lvDots(P.tpl[id]?.level || 0)}</p>`;

  if (lv === 0) {
    ctx.view().innerHTML = `${head}
      <section class="panel tpl">${toks.map((x) => (x.br ? "<br>" : wordSpan(x))).join("")}</section>
      ${jaHtml(t, true)}
      <div class="toolbar"><button class="btn sub" id="say">♪ 読み上げ</button><button class="btn" id="ok">覚えた → 穴埋めへ</button></div>`;
    bindBack(); bindNote(t);
    $("#say").onclick = () => ctx.speak(speakable(t.text));
    $("#ok").onclick = () => { setTpl(id, 1); startTemplate(id); };
    return;
  }

  if (lv === 4) {
    const target = toks.filter((x) => !x.br && x.blankable).map((x) => norm(x.core));
    ctx.view().innerHTML = `${head}
      ${jaHtml(t, false)}
      <section class="panel"><textarea id="full" class="recall" placeholder="覚えた文章を全文書いてください（（ ）の部分は不要）" autocapitalize="sentences" autocorrect="off" spellcheck="false"></textarea></section>
      <div class="toolbar"><button class="btn sub" id="peek">1行目を見る</button><button class="btn" id="check">答え合わせ</button></div><div id="res"></div>`;
    bindBack(); bindNote(t);
    $("#peek").onclick = () => { $("#res").innerHTML = `<div class="hintbox">${esc(plain(t.text).split("\n")[0])}</div>`; };
    $("#check").onclick = () => {
      const typed = $("#full").value.split(/\s+/).map(norm).filter(Boolean);
      const hit = lcsHits(target, typed);
      const score = target.length ? hit.size / target.length : 0;
      let i = 0;
      const shown = toks.map((x) => (x.br ? "<br>" : !x.blankable ? wordSpan(x) : wordSpan(x, hit.has(i++) ? "w-ok" : "w-ng"))).join("");
      finishTemplate(id, lv, score, shown);
    };
    return;
  }

  // 1〜3：型フレーズ優先の穴埋め
  const pick = pickBlanks(toks, lv);
  ctx.view().innerHTML = `${head}
    <section class="panel tpl" id="tpl">${toks.map((x, i) => {
      if (x.br) return "<br>";
      if (!pick.has(i)) return wordSpan(x);
      return `${esc(x.lead)}<span class="blank${x.key ? " kblank" : ""}"><input data-i="${i}" style="width:calc(${x.core.length}ch + 8px)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></span>${esc(x.trail)} `;
    }).join("")}</section>
    ${jaHtml(t, false)}
    <div class="toolbar"><button class="btn sub" id="say">♪</button><button class="btn" id="check">答え合わせ</button></div><div id="res"></div>`;
  bindBack(); bindNote(t);
  $("#say").onclick = () => ctx.speak(speakable(t.text));
  const inputs = [...ctx.view().querySelectorAll(".blank input")];
  inputs.forEach((inp, k) => inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || (e.key === " " && inp.value.trim())) { e.preventDefault(); inputs[k + 1] ? inputs[k + 1].focus() : $("#check").click(); }
  }));
  $("#check").onclick = () => {
    let ok = 0;
    inputs.forEach((inp) => {
      const x = toks[+inp.dataset.i];
      const good = norm(inp.value) === norm(x.core);
      if (good) ok++;
      inp.parentElement.outerHTML = `<span class="${good ? "w-ok" : "w-ng"}">${esc(x.core)}</span>${!good && inp.value.trim() ? `<span class="typed">${esc(inp.value.trim())}</span>` : ""}`;
    });
    finishTemplate(id, lv, inputs.length ? ok / inputs.length : 1, null);
  };
}

function setTpl(id, level) {
  const P = prog();
  P.tpl[id] = { ...(P.tpl[id] || {}), level, last: Date.now() };
  ctx.save();
}

function finishTemplate(id, lv, score, shownHtml) {
  const pct = Math.round(score * 100);
  let next = lv, msg;
  if (score >= 0.9) { next = lv + 1; msg = next >= DONE ? "完全暗記しました！" : `合格。次は段階 ${next} です。`; }
  else if (score < 0.6 && lv > 1) { next = lv - 1; msg = `正答率が低いので段階 ${next} に戻ります。`; }
  else msg = "9割で合格です。もう一度挑戦しましょう。";
  setTpl(id, next);
  const P = prog(); P.tpl[id].best = Math.max(P.tpl[id].best || 0, pct); ctx.save();
  if (shownHtml) $("#full").outerHTML = `<div class="tpl">${shownHtml}</div>`;
  $(".toolbar").outerHTML = `<section class="panel" style="margin-top:14px"><h2>正答率 ${pct}%</h2><p style="margin:0">${msg}</p></section>
    <div class="toolbar"><button class="btn sub" id="list">一覧へ</button><button class="btn" id="again">${next >= DONE ? "もう一度（全文）" : "続ける"}</button></div>`;
  $("#list").onclick = () => renderPractice();
  $("#again").onclick = () => { startTemplate(id); window.scrollTo(0, 0); };
}

// 最長共通部分列で、正しく書けた語（target 側の位置）を求める
function lcsHits(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Set(); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { hit.add(i); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return hit;
}

// ---------------- Build a Sentence ----------------
function startBuild() {
  const D = data(), P = prog();
  const items = [...D.build].sort((a, b) => ((P.build[a.id]?.ok || 0) - (P.build[a.id]?.ng || 0)) - ((P.build[b.id]?.ok || 0) - (P.build[b.id]?.ng || 0)) || Math.random() - 0.5);
  const set = shuffle(items.slice(0, Math.min(14, items.length))).slice(0, 10);
  const run = { set, i: 0, ok: 0 };
  const show = () => {
    clearTimer();
    const it = run.set[run.i];
    const chips = shuffle([...it.answer, ...(it.extra || [])]);
    const slots = Array(it.answer.length).fill(null);
    ctx.view().innerHTML = `${backBar(`Build a Sentence ${run.i + 1} / ${run.set.length}`)}
      <p class="direction">Make an appropriate sentence. ・ ${esc(it.structure)}${badge(it)}</p>
      <section class="panel"><div class="bubble">${esc(it.context)}</div>
        <div class="sentence" id="sent"></div></section>
      <div class="chips" id="chips"></div>
      <div class="toolbar"><button class="btn sub" id="clear">やり直す</button><button class="btn" id="check">答え合わせ</button></div><div id="res"></div>`;
    bindBack();
    const draw = () => {
      $("#sent").innerHTML = `${it.pre ? `<span>${esc(it.pre)}</span> ` : ""}${slots.map((s, k) => `<button class="slot${s == null ? "" : " on"}" data-k="${k}">${s == null ? "&nbsp;" : esc(chips[s])}</button>`).join(" ")}<span>${esc(it.post || "")}</span>`;
      $("#chips").innerHTML = chips.map((c, k) => `<button class="chip-btn" data-k="${k}" ${slots.includes(k) ? "disabled" : ""}>${esc(c)}</button>`).join("");
      ctx.view().querySelectorAll(".chip-btn").forEach((b) => b.onclick = () => { const e = slots.indexOf(null); if (e >= 0) { slots[e] = +b.dataset.k; draw(); } });
      ctx.view().querySelectorAll(".slot").forEach((b) => b.onclick = () => { slots[+b.dataset.k] = null; draw(); });
    };
    draw();
    $("#clear").onclick = () => { slots.fill(null); draw(); };
    let left = 35;
    const tick = () => { const el = $("#timer"); if (!el) return clearTimer(); el.textContent = `残り ${left}秒`; el.classList.toggle("over", left <= 0); left--; };
    tick(); timer = setInterval(tick, 1000);
    $("#check").onclick = () => {
      clearTimer();
      $("#sent").style.pointerEvents = $("#chips").style.pointerEvents = "none";
      const built = slots.map((s) => (s == null ? "" : chips[s]));
      const good = built.map(norm).join(" ") === it.answer.map(norm).join(" ");
      const P2 = prog(); const r = P2.build[it.id] ||= { ok: 0, ng: 0 }; good ? r.ok++ : r.ng++; ctx.save();
      if (good) run.ok++;
      const full = [it.pre, it.answer.join(" ")].filter(Boolean).join(" ") + (/^[.?!]$/.test(it.post) ? "" : " ") + (it.post || "");
      $(".toolbar").outerHTML = `<section class="panel" style="margin-top:14px"><h2>${good ? "○ 正解" : "✕ 不正解"}</h2><p class="ex" style="margin:0">${esc(full)}</p>${it.extra?.length ? `<p class="muted small">使わない語：${it.extra.map(esc).join(", ")}</p>` : ""}</section>
        <div class="toolbar"><button class="btn sub" id="say">♪</button><button class="btn" id="next">${run.i + 1 < run.set.length ? "次へ" : "結果へ"}</button></div>`;
      $("#say").onclick = () => ctx.speak(`${it.context} ${full}`);
      $("#next").onclick = () => { run.i++; if (run.i < run.set.length) show(); else summary(); };
    };
  };
  const summary = () => {
    ctx.view().innerHTML = `${backBar("Build a Sentence")}<section class="panel"><h2>結果</h2><div class="stats"><div><b>${run.ok}/${run.set.length}</b><span>正解</span></div></div></section><button class="btn" id="again">もう一度</button>`;
    bindBack(); $("#again").onclick = startBuild;
  };
  show();
}

// ---------------- 録音 ----------------
const rec = {
  mr: null, chunks: [], url: null,
  async start(onStop) {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.mr = new MediaRecorder(stream);
      this.mr.ondataavailable = (e) => this.chunks.push(e.data);
      this.mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(new Blob(this.chunks, { type: this.mr.mimeType }));
        onStop?.(this.url);
      };
      this.mr.start();
      return true;
    } catch { return false; }
  },
  stop() { if (this.mr && this.mr.state === "recording") this.mr.stop(); },
};
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// ---------------- Listen and Repeat ----------------
function startRepeat(id) {
  const set = data().repeat.find((x) => x.id === id);
  const run = { i: 0, scores: [] };
  const show = () => {
    const s = set.sentences[run.i];
    ctx.view().innerHTML = `${backBar(`${set.title} ${run.i + 1} / ${set.sentences.length}`)}
      ${run.i === 0 ? `<p class="direction">${esc(set.context)}</p>${set.contextJa ? `<p class="muted small">${esc(set.contextJa)}</p>` : ""}` : ""}
      <section class="panel center">
        <button class="btn" id="play">▶ 聞く</button>
        <p class="muted small" id="plays">本番は1回だけ。聞いたらすぐ声に出して繰り返します。</p>
        ${canRecord() ? `<button class="btn sub" id="rec">● 録音して繰り返す</button><audio id="aud" controls hidden></audio>` : `<p class="muted small">この端末では録音が使えません。声に出して繰り返してください。</p>`}
      </section>
      <section class="panel"><textarea id="dict" class="recall" rows="2" placeholder="（任意）聞こえた文を書き取る" autocapitalize="sentences" autocorrect="off" spellcheck="false"></textarea></section>
      <div class="toolbar"><button class="btn" id="reveal">答えを見る</button></div><div id="res"></div>`;
    bindBack();
    let plays = 0;
    $("#play").onclick = () => { plays++; ctx.speak(s); $("#plays").textContent = plays > 1 ? `${plays}回目（本番では1回のみ）` : "声に出して繰り返しましょう。"; };
    if (canRecord()) {
      let on = false;
      $("#rec").onclick = async () => {
        if (!on) {
          if (await rec.start((url) => { const a = $("#aud"); if (a) { a.src = url; a.hidden = false; } })) { on = true; $("#rec").textContent = "■ 録音を止める"; }
          else $("#rec").textContent = "マイクが使えません";
        } else { rec.stop(); on = false; $("#rec").textContent = "● 録り直す"; }
      };
    }
    $("#reveal").onclick = () => {
      rec.stop();
      const typed = $("#dict").value.split(/\s+/).map(norm).filter(Boolean);
      const words = s.split(/\s+/);
      let html = esc(s), pct = null;
      if (typed.length) {
        const hit = lcsHits(words.map(norm), typed);
        pct = Math.round(hit.size / words.length * 100);
        run.scores.push(pct);
        html = words.map((w, k) => `<span class="${hit.has(k) ? "w-ok" : "w-ng"}">${esc(w)}</span>`).join(" ");
      }
      $(".toolbar").outerHTML = `<section class="panel" style="margin-top:14px"><p class="ex" style="margin:0">${html}</p>${set.sentencesJa?.[run.i] ? `<p class="ja" style="margin:6px 0 0">${esc(set.sentencesJa[run.i])}</p>` : ""}${pct != null ? `<p class="muted small">書き取り ${pct}%（赤＝抜けた・違った語）</p>` : ""}</section>
        <div class="toolbar"><button class="btn sub" id="again">もう一度聞く</button><button class="btn" id="next">${run.i + 1 < set.sentences.length ? "次の文へ" : "振り返りへ"}</button></div>`;
      $("#again").onclick = () => ctx.speak(s);
      $("#next").onclick = () => { run.i++; if (run.i < set.sentences.length) show(); else summary(); };
    };
  };
  const summary = () => {
    const avg = run.scores.length ? Math.round(run.scores.reduce((a, b) => a + b, 0) / run.scores.length) : null;
    if (avg != null) { const P = prog(); P.repeat[id] = { best: Math.max(P.repeat[id]?.best || 0, avg), last: Date.now() }; ctx.save(); }
    ctx.view().innerHTML = `${backBar(set.title)}
      ${avg != null ? `<section class="panel"><h2>書き取りの平均 ${avg}%</h2></section>` : ""}
      ${checklistHtml("Listen and Repeat", OWN_CHECKS.repeat)}
      <button class="btn" id="again">もう一度</button>`;
    bindBack(); $("#again").onclick = () => startRepeat(id);
  };
  show();
}

function checklistHtml(name, own) {
  const tst = data().checklists.find((c) => c.title.includes(name));
  const items = tst ? tst.items : own;
  return `<section class="panel"><h2>${tst ? esc(tst.title) : "自己チェック"}</h2>${items.map((x) => `<label class="check"><input type="checkbox"> ${esc(x)}</label>`).join("")}</section>`;
}

// ---------------- 文字起こし（ブラウザの音声認識） ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canTranscribe = () => !!SR;
const stt = {
  r: null, on: false, base: "", sess: "", interim: "", error: null,
  start(onUpdate) {
    if (!SR) return false;
    this.stop(); this.base = ""; this.sess = ""; this.interim = ""; this.error = null;
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let fin = "", inter = "";
      for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t + " "; else inter += t; }
      this.sess = fin; this.interim = inter; onUpdate?.(this.text());
    };
    r.onerror = (e) => { this.error = e.error; };
    // 無音で止まるブラウザがあるので、止められるまで自動で再開する
    r.onend = () => { this.base += this.sess; this.sess = ""; if (this.on) { try { r.start(); } catch { /* noop */ } } };
    this.r = r; this.on = true;
    try { r.start(); return true; } catch { this.on = false; return false; }
  },
  stop() { this.on = false; try { this.r?.stop(); } catch { /* noop */ } },
  text() { return (this.base + this.sess + this.interim).replace(/\s+/g, " ").trim(); },
};

const TRANSITIONS = ["in addition", "furthermore", "on top of that", "what's more", "for example", "for instance", "to illustrate",
  "in my view", "from my perspective", "i would argue", "it seems to me", "personally", "in fact", "above all", "especially",
  "what i mean is", "as a result", "therefore", "because of this", "that's why", "however", "on the other hand", "even so",
  "although", "first", "after that", "eventually", "in the end", "overall", "all in all", "in short", "to sum up",
  "these days", "one reason is", "the reason is", "mainly because", "given this trend", "so overall"];
const FILLERS = /\b(uh+|um+|uhm|erm?|ah+|hmm+|you know)\b/gi;
const flat = (s) => " " + s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim() + " ";

// 回答の文字起こしから、語数・話す速さ・言いよどみ・つなぎ言葉・型フレーズを数える
function analyze(text, secs, framePhrases) {
  const words = text.split(/\s+/).filter(Boolean);
  const f = flat(text);
  const used = TRANSITIONS.filter((t) => f.includes(" " + t + " "));
  const fillers = (text.match(FILLERS) || []).length;
  const keys = framePhrases.map((p) => ({ p, ok: f.includes(flat(p)) }));
  return { n: words.length, wpm: secs > 0 ? Math.round(words.length / secs * 60) : 0, fillers, used, keys };
}
function statsHtml(a, text) {
  const mark = (ok) => (ok ? '<span class="w-ok">✓</span>' : '<span class="w-ng">✕</span>');
  return `<section class="panel"><h2>自動チェック</h2>
    <div class="stats"><div><b>${a.n}</b><span>語（目安110〜）</span></div><div><b>${a.wpm}</b><span>語/分</span></div><div><b>${a.fillers}</b><span>言いよどみ</span></div></div>
    <p class="small" style="margin:12px 0 4px">${mark(a.n >= 110)} 110語以上　${mark(a.used.length >= 2)} つなぎ言葉2つ以上　${mark(a.fillers < 3)} 言いよどみ3回未満</p>
    <p class="small" style="margin:4px 0">つなぎ言葉：${a.used.length ? a.used.map(esc).join(", ") : "なし"}</p>
    ${a.keys.length ? `<p class="small" style="margin:4px 0">型フレーズ：${a.keys.map((k) => `${mark(k.ok)} ${esc(k.p)}`).join("　")}</p>` : ""}
    <details class="jabox"><summary>文字起こし全文</summary><p class="ex">${esc(text) || "（認識できませんでした）"}</p></details>
    <p class="muted small" style="margin:6px 0 0">音声認識は「uh」「um」を省くことが多いので、言いよどみは録音でも確認してください。</p></section>`;
}
const framePhrasesFor = (i) => {
  const t = data().templates.find((x) => x.id === `tp-int-q${i + 1}`);
  return t ? [...t.text.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1].replace(/[.,]$/, "")) : [];
};

// ---------------- 45秒の時間配分 ----------------
const STAGES = [
  [[0, 5, "答える", "Well, one thing that comes to mind is ..."], [5, 30, "具体例", "For example, ..."], [30, 45, "理由・まとめ", "I think I remember this so clearly because ..."]],
  [[0, 5, "好みを言う", "Personally, I would rather ..."], [5, 15, "理由", "mainly because ..."], [15, 35, "個人的な例", "For instance, ..."], [35, 45, "まとめ", "That experience taught me that ..."]],
  [[0, 5, "予想を言う", "Yes, I do think ..."], [5, 15, "理由", "One reason is that ..."], [15, 35, "最近の傾向", "These days, ..."], [35, 45, "まとめ", "Given this trend, it seems likely that ..."]],
  [[0, 5, "賛否を言う", "I strongly agree that ..."], [5, 15, "理由", "The reason is that ..."], [15, 35, "例", "To illustrate, ..."], [35, 45, "まとめ", "So overall, I am convinced that ..."]],
];
const paceHtml = (i) => `<div class="pace" id="pace">${STAGES[i].map(([a, b, label], k) => `<div class="seg" data-k="${k}" style="flex:${b - a}"><span>${a}–${b}秒</span>${esc(label)}</div>`).join("")}</div>
  <p class="pacehint" id="pacehint">${esc(STAGES[i][0][2])}：${esc(STAGES[i][0][3])}</p>`;
function paceUpdate(i, elapsed) {
  const k = Math.max(0, STAGES[i].findIndex(([a, b]) => elapsed >= a && elapsed < b));
  const cur = elapsed >= 45 ? STAGES[i].length - 1 : k;
  ctx.view().querySelectorAll("#pace .seg").forEach((el) => { const n = +el.dataset.k; el.classList.toggle("on", n === cur); el.classList.toggle("past", n < cur); });
  const h = $("#pacehint"); if (h) h.textContent = `${STAGES[i][cur][2]}：${STAGES[i][cur][3]}`;
}

function sayThen(text, cb) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.95;
    let done = false; const fin = () => { if (!done) { done = true; cb?.(); } };
    u.onend = fin; u.onerror = fin;
    speechSynthesis.speak(u);
    setTimeout(fin, Math.max(4000, text.length * 90)); // onend が来ない端末への保険
  } catch { cb?.(); }
}

// ---------------- Take an Interview ----------------
function startInterview(id) {
  const set = data().interview.find((x) => x.id === id);
  const D = data();
  const run = { i: -1 };
  const tplFor = (i) => D.templates.filter((t) => t.id === `tp-int-q${i + 1}` || t.id === `tst-int-q${i + 1}`);
  const show = () => {
    clearTimer();
    if (run.i < 0) {
      ctx.view().innerHTML = `${backBar(set.topic)}<section class="panel"><p style="margin:0">${esc(set.intro)}</p>${set.introJa ? `<p class="ja">${esc(set.introJa)}</p>` : ""}</section>
        <p class="muted small">質問は4つ。各質問のあと準備時間なしで45秒話します。回答中は「今どこを話すか」の目安が表示され、終わると文字起こしから語数やつなぎ言葉を自動でチェックします。</p>
        <button class="btn" id="go">始める</button>`;
      bindBack(); $("#go").onclick = () => { run.i = 0; show(); };
      ctx.speak(set.intro);
      return;
    }
    const i = run.i, q = set.questions[i];
    const types = ["個人の経験", "好み", "未来の予想", "抽象的な考え"];
    ctx.view().innerHTML = `${backBar(`Q${i + 1} / 4 ・ ${types[i]}`)}
      <section class="panel center">
        <button class="btn sub" id="play">▶ 質問を聞く</button>
        <details style="margin-top:10px"><summary class="muted small">質問文を見る</summary><p class="ex">${esc(q)}</p>${set.questionsJa?.[i] ? `<p class="ja">${esc(set.questionsJa[i])}</p>` : ""}</details>
        <div class="bigtimer" id="count">45</div>
        ${paceHtml(i)}
        <button class="btn" id="speak">● 回答開始</button>
        ${canTranscribe() ? `<label class="small muted"><input type="checkbox" id="usestt" checked> 文字起こしして自動チェック</label>` : `<p class="muted small">この端末のブラウザは音声認識に対応していないため、自動チェックは使えません。</p>`}
        <p class="ex live" id="live"></p>
        <audio id="aud" controls hidden></audio>
      </section>
      <div id="result"></div><div id="ref"></div>
      <div class="toolbar"><button class="btn sub" id="tpl">型・模範解答</button><button class="btn" id="next">${i < 3 ? "次の質問へ" : "振り返りへ"}</button></div>`;
    bindBack();
    $("#play").onclick = () => ctx.speak(q);
    ctx.speak(q);
    let running = false, t0 = 0, usingStt = false;
    const stopAnswer = () => {
      if (!running) return;
      clearTimer(); rec.stop(); running = false;
      const secs = Math.min(45, (Date.now() - t0) / 1000);
      $("#speak").textContent = "● 録り直す";
      if (usingStt) {
        stt.stop();
        setTimeout(() => { // 最後の認識結果が届くのを少し待つ
          const text = stt.text();
          $("#live").textContent = "";
          $("#result").innerHTML = stt.error && !text ? `<p class="muted small">音声認識が使えませんでした（${esc(stt.error)}）。録音で確認してください。</p>` : statsHtml(analyze(text, secs, framePhrasesFor(i)), text);
        }, 700);
      }
    };
    $("#speak").onclick = async () => {
      if (running) return stopAnswer();
      speechSynthesis?.cancel?.();
      $("#result").innerHTML = ""; $("#live").textContent = "";
      let left = 45; $("#count").textContent = left; $("#count").classList.remove("over");
      if (canRecord()) await rec.start((url) => { const a = $("#aud"); if (a) { a.src = url; a.hidden = false; } });
      usingStt = !!$("#usestt")?.checked && stt.start((txt) => { const l = $("#live"); if (l) l.textContent = txt; });
      running = true; t0 = Date.now(); $("#speak").textContent = "■ 止める";
      paceUpdate(i, 0);
      timer = setInterval(() => {
        left--; const c = $("#count"); if (!c) return clearTimer();
        c.textContent = Math.max(0, left); paceUpdate(i, 45 - left);
        if (left <= 0) { c.classList.add("over"); stopAnswer(); }
      }, 1000);
    };
    $("#tpl").onclick = () => {
      const sample = D.templates.find((t) => t.note && norm(t.note) === norm(q));
      const box = (t) => `<section class="panel"><h2>${esc(t.title)}${badge(t)}</h2><p class="pre">${esc(plain(t.text))}</p>${t.ja ? `<details class="jabox"><summary>和訳</summary><p class="ja pre">${esc(t.ja)}</p></details>` : ""}</section>`;
      $("#ref").innerHTML = (tplFor(i).map(box).join("") || `<p class="muted">型が見つかりません</p>`) + (sample ? box({ ...sample, title: `この質問の${sample.title}` }) : "");
    };
    $("#next").onclick = () => { stopAnswer(); stt.stop(); run.i++; if (run.i < 4) show(); else summary(); window.scrollTo(0, 0); };
  };
  const summary = () => {
    const P = prog(); P.iv[id] = (P.iv[id] || 0) + 1; ctx.save();
    ctx.view().innerHTML = `${backBar(set.topic)}
      <p class="muted small">最後の回答の録音を聞き返しながら、チェックしましょう。</p>
      ${checklistHtml("Take an Interview", OWN_CHECKS.interview)}
      <button class="btn" id="again">もう一度</button>`;
    bindBack(); $("#again").onclick = () => startInterview(id);
  };
  show();
}

// ---------------- 最初の一文ドリル ----------------
// 質問を聞いて5秒以内に、型を使った最初の一文を言う。質問タイプ別の書き出しが口から出るまで繰り返す
const OPENERS = [
  { frame: "Well, one thing that comes to mind is ...", test: ["one thing that comes to mind", "comes to mind"] },
  { frame: "Personally, I would rather ...", test: ["i would rather", "personally i", "i'd rather", "i prefer"] },
  { frame: "Yes, I do think ... / No, I don't think ...", test: ["i do think", "i don't think", "i think"] },
  { frame: "I strongly agree that ... / I don't really believe that ...", test: ["i strongly agree", "i agree", "i don't really believe", "i disagree"] },
];
function startDrill() {
  const D = data();
  const pool = D.interview.flatMap((s) => s.questions.map((q, i) => ({ q, i, ja: s.questionsJa?.[i], topic: s.topic })));
  const list = shuffle(pool).slice(0, 10);
  const run = { k: 0, ok: 0 };
  const types = ["Q1 個人の経験", "Q2 好み", "Q3 未来の予想", "Q4 抽象的な考え"];
  const show = () => {
    clearTimer(); stt.stop();
    const it = list[run.k];
    ctx.view().innerHTML = `${backBar(`最初の一文ドリル ${run.k + 1} / ${list.length}`)}
      <section class="panel center">
        <p class="topic" style="margin:0">${esc(types[it.i])}</p>
        <div class="bigtimer" id="count">…</div>
        <p class="muted small" id="state">質問を読み上げています。終わったら5秒以内に最初の一文を言いましょう。</p>
        <p class="ex live" id="live"></p>
      </section>
      <div id="res"></div>`;
    bindBack();
    let heard = "";
    sayThen(it.q, () => {
      if (!$("#count")) return;
      let left = 5; $("#count").textContent = left; $("#state").textContent = "話して！";
      if (canTranscribe()) stt.start((t) => { heard = t; const l = $("#live"); if (l) l.textContent = t; });
      timer = setInterval(() => {
        left--; const c = $("#count"); if (!c) return clearTimer();
        c.textContent = Math.max(0, left);
        if (left <= -2) { clearTimer(); stt.stop(); setTimeout(() => reveal(stt.text() || heard), 500); } // 5秒＋言い終わりの余裕2秒
        else if (left <= 0) { c.classList.add("over"); $("#state").textContent = "言い終えてください"; }
      }, 1000);
    });
    const reveal = (text) => {
      const op = OPENERS[it.i];
      const f = flat(text);
      const auto = text ? op.test.some((p) => f.includes(" " + p + " ") || f.includes(" " + p)) : null;
      const sample = D.templates.find((t) => t.note && norm(t.note) === norm(it.q));
      const sampleFirst = sample ? plain(sample.text).split(/(?<=[.?!])\s/)[0] : "";
      $("#state").textContent = "";
      $("#res").innerHTML = `<section class="panel">
          <p class="ex" style="margin-top:0">${esc(it.q)}</p>${it.ja ? `<p class="ja">${esc(it.ja)}</p>` : ""}
          <h2 style="margin-top:12px">このタイプの書き出し</h2><p class="ex key-line">${esc(op.frame)}</p>
          ${sampleFirst ? `<p class="small muted">模範解答の書き出し：${esc(sampleFirst)}</p>` : ""}
          ${text ? `<p class="small">あなた：${esc(text)} ${auto ? '<span class="w-ok">型を使えています</span>' : '<span class="w-ng">型の書き出しが聞き取れませんでした</span>'}</p>` : ""}
        </section>
        <div class="toolbar"><button class="btn sub" id="ng">言えなかった</button><button class="btn" id="ok">言えた</button></div>`;
      const next = (good) => { if (good) run.ok++; run.k++; if (run.k < list.length) show(); else summary(); };
      $("#ok").onclick = () => next(true); $("#ng").onclick = () => next(false);
    };
  };
  const summary = () => {
    const P = prog(); P.drill = { runs: (P.drill?.runs || 0) + 1, best: Math.max(P.drill?.best || 0, run.ok) }; ctx.save();
    ctx.view().innerHTML = `${backBar("最初の一文ドリル")}<section class="panel"><h2>結果</h2><div class="stats"><div><b>${run.ok}/${list.length}</b><span>5秒以内に言えた</span></div><div><b>${P.drill.best}</b><span>自己ベスト</span></div><div><b>${P.drill.runs}</b><span>回目</span></div></div></section><button class="btn" id="again">もう一度</button>`;
    bindBack(); $("#again").onclick = startDrill;
  };
  show();
}

export function packSummary() {
  const p = loadPack();
  if (!p) return null;
  return ["build", "repeat", "templates", "interview", "checklists"].map((k) => (p[k] || []).length).reduce((a, b) => a + b, 0);
}
