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
  s.practice.tpl ||= {}; s.practice.build ||= {}; s.practice.repeat ||= {}; s.practice.iv ||= {};
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
      <h2>Take an Interview</h2>
      <p class="muted small" style="margin-top:0">質問を聞いて、準備なしで45秒話します。録音を聞き返し、型とチェックリストで振り返ります。</p>
      <ul class="wlist">${D.interview.map((r) => `<li data-iv="${esc(r.id)}"><span class="m" style="color:var(--text);font-size:15px">${esc(r.topic)}${badge(r)}</span><span class="muted small">${P.iv[r.id] ? `${P.iv[r.id]}回` : "未挑戦"}</span></li>`).join("")}</ul>
    </section>
    ${D.hasPack ? "" : `<p class="muted small">「記録・設定」から TST Prep の個人用データを読み込むと、PDF のテンプレート・模範解答・例題もここに加わります（TST マーク付き）。</p>`}`;
  ctx.view().querySelectorAll("[data-tpl]").forEach((li) => li.onclick = () => startTemplate(li.dataset.tpl));
  ctx.view().querySelectorAll("[data-lr]").forEach((li) => li.onclick = () => startRepeat(li.dataset.lr));
  ctx.view().querySelectorAll("[data-iv]").forEach((li) => li.onclick = () => startInterview(li.dataset.iv));
  $("#bs").onclick = startBuild;
}

function backBar(title) {
  return `<div class="qhead"><button class="linkbtn" id="back">← 戻る</button><span class="topic">${esc(title)}</span><span class="timer" id="timer"></span></div>`;
}
function bindBack() { $("#back").onclick = () => { speechSynthesis?.cancel?.(); rec.stop(); renderPractice(); window.scrollTo(0, 0); }; }

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

function jaHtml(t, open) {
  if (!t.ja && !t.noteJa) return t.tst ? `<p class="muted small">（TST 原文には和訳を付けていません）</p>` : "";
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
    bindBack();
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
    bindBack();
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
  bindBack();
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
      ${run.i === 0 ? `<p class="direction">${esc(set.context)}</p>` : ""}
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
      $(".toolbar").outerHTML = `<section class="panel" style="margin-top:14px"><p class="ex" style="margin:0">${html}</p>${pct != null ? `<p class="muted small">書き取り ${pct}%（赤＝抜けた・違った語）</p>` : ""}</section>
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

// ---------------- Take an Interview ----------------
function startInterview(id) {
  const set = data().interview.find((x) => x.id === id);
  const D = data();
  const run = { i: -1 };
  const tplFor = (i) => D.templates.filter((t) => t.id === `tp-int-q${i + 1}` || t.id === `tst-int-q${i + 1}`);
  const show = () => {
    clearTimer();
    if (run.i < 0) {
      ctx.view().innerHTML = `${backBar(set.topic)}<section class="panel"><p style="margin:0">${esc(set.intro)}</p></section>
        <p class="muted small">質問は4つ。各質問のあと準備時間なしで45秒話します。質問文は聞くまで隠れています。</p>
        <button class="btn" id="go">始める</button>`;
      bindBack(); $("#go").onclick = () => { run.i = 0; show(); };
      ctx.speak(set.intro);
      return;
    }
    const q = set.questions[run.i];
    const types = ["個人の経験", "好み", "未来の予想", "抽象的な考え"];
    ctx.view().innerHTML = `${backBar(`Q${run.i + 1} / 4 ・ ${types[run.i]}`)}
      <section class="panel center">
        <button class="btn sub" id="play">▶ 質問を聞く</button>
        <details style="margin-top:10px"><summary class="muted small">質問文を見る</summary><p class="ex">${esc(q)}</p></details>
        <div class="bigtimer" id="count">45</div>
        ${canRecord() ? `<button class="btn" id="speak">● 回答開始（録音）</button>` : `<button class="btn" id="speak">回答開始（45秒）</button>`}
        <audio id="aud" controls hidden></audio>
      </section>
      <div id="ref"></div>
      <div class="toolbar"><button class="btn sub" id="tpl">型を見る</button><button class="btn" id="next">${run.i < 3 ? "次の質問へ" : "振り返りへ"}</button></div>`;
    bindBack();
    $("#play").onclick = () => ctx.speak(q);
    ctx.speak(q);
    let running = false;
    const stopAnswer = () => { clearTimer(); rec.stop(); running = false; $("#speak").textContent = canRecord() ? "● 録り直す" : "もう一度（45秒）"; };
    $("#speak").onclick = async () => {
      if (running) return stopAnswer();
      speechSynthesis?.cancel?.();
      let left = 45; $("#count").textContent = left; $("#count").classList.remove("over");
      if (canRecord()) await rec.start((url) => { const a = $("#aud"); if (a) { a.src = url; a.hidden = false; } });
      running = true; $("#speak").textContent = "■ 止める";
      timer = setInterval(() => { left--; const c = $("#count"); if (!c) return clearTimer(); c.textContent = left; if (left <= 0) { c.classList.add("over"); stopAnswer(); } }, 1000);
    };
    $("#tpl").onclick = () => {
      $("#ref").innerHTML = tplFor(run.i).map((t) => `<section class="panel"><h2>${esc(t.title)}${badge(t)}</h2><p class="pre">${esc(plain(t.text))}</p></section>`).join("") || `<p class="muted">型が見つかりません</p>`;
    };
    $("#next").onclick = () => { stopAnswer(); run.i++; if (run.i < 4) show(); else summary(); window.scrollTo(0, 0); };
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

export function packSummary() {
  const p = loadPack();
  if (!p) return null;
  return ["build", "repeat", "templates", "interview", "checklists"].map((k) => (p[k] || []).length).reduce((a, b) => a + b, 0);
}
