// TOEFL暗記 — Complete the Words 形式 + 間隔反復（Leitner 方式）
const STORE_KEY = "toefl-anki-v1";
const INTERVALS = [0, 1, 3, 7, 16, 35]; // box ごとの次回までの日数。box 5 = 習得
const MASTER = 5;
const SEC_PER_BLANK = 12; // 本番の目安（約10空欄を2分）
const PASSAGES_PER_SESSION = 5;
const DAY = 86400000;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let WORDS = [], WMAP = {}, PASSAGES = [], state;

// ---------- 保存 ----------
function blankState() {
  return { cards: {}, passSeen: {}, history: [], settings: { newPerDay: 10 } };
}
function load() {
  try { state = { ...blankState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
  catch { state = blankState(); }
  state.settings = { ...blankState().settings, ...state.settings };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { /* プライベートモード等では保存できない */ }
}
const card = (w) => state.cards[w] || { box: 0, due: 0, correct: 0, wrong: 0, first: null };

// ---------- 段落の解析 ----------
function tokens(text) {
  const out = []; let last = 0;
  for (const m of text.matchAll(/\[([^\]|]+)\|([^\]]+)\]/g)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ surface: m[1], head: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
const headsOf = (p) => p.heads;
const splitWord = (s) => { const k = Math.max(1, Math.floor(s.length / 2)); return [s.slice(0, k), s.slice(k)]; };

// ---------- 出題の組み立て ----------
function newToday() {
  const k = dayKey();
  return Object.values(state.cards).filter((c) => c.first === k).length;
}
function dueWords() {
  const now = Date.now();
  return WORDS.filter((w) => { const c = card(w.w); return c.box > 0 && c.due <= now; })
    .sort((a, b) => card(a.w).due - card(b.w).due).map((w) => w.w);
}
// 新出語は段落単位でまとめて選ぶ（1段落の空欄が多くなり本番に近づく）
function newWords(limit) {
  const isNew = (h) => card(h).box === 0 && !card(h).first;
  const picked = [];
  const order = [...PASSAGES].sort((a, b) =>
    headsOf(b).filter(isNew).length - headsOf(a).filter(isNew).length || (state.passSeen[a.id] || 0) - (state.passSeen[b.id] || 0));
  for (const p of order) {
    for (const h of headsOf(p)) {
      if (picked.length >= limit) return picked;
      if (isNew(h) && !picked.includes(h)) picked.push(h);
    }
  }
  return picked;
}
function buildSession(targets) {
  const remaining = new Set(targets);
  const used = new Set();
  const list = [];
  while (remaining.size && list.length < PASSAGES_PER_SESSION) {
    let best = null, bestScore = -1;
    for (const p of PASSAGES) {
      if (used.has(p.id)) continue;
      const hit = headsOf(p).filter((h) => remaining.has(h)).length;
      if (!hit) continue;
      const score = hit * 1e13 - (state.passSeen[p.id] || 0) / 1e3; // 多く含む > 最近見ていない
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (!best) break;
    used.add(best.id);
    const tg = new Set(headsOf(best).filter((h) => remaining.has(h)));
    tg.forEach((h) => remaining.delete(h));
    list.push({ id: best.id, targets: [...tg] });
  }
  return list;
}
function freeSession() {
  const ps = [...PASSAGES].sort((a, b) => (state.passSeen[a.id] || 0) - (state.passSeen[b.id] || 0) || Math.random() - 0.5).slice(0, 3);
  return ps.map((p) => ({ id: p.id, targets: headsOf(p), free: true }));
}

// ---------- 採点と SRS 更新 ----------
function grade(head, ok, hinted, isTarget) {
  const c = { ...card(head) };
  const now = Date.now();
  if (!c.first) c.first = dayKey();
  if (!ok) {
    c.box = 1; c.due = now; c.wrong++;
  } else {
    c.correct++;
    if (hinted) { c.box = Math.max(c.box, 1); c.due = today0() + DAY; }
    else if (c.box === 0) { c.box = 2; c.due = today0() + INTERVALS[2] * DAY; }
    else if (isTarget || c.due <= now) { c.box = Math.min(MASTER, c.box + 1); c.due = today0() + (c.box === MASTER && card(head).box === MASTER ? 60 : INTERVALS[c.box]) * DAY; }
  }
  c.last = now;
  state.cards[head] = c;
}

// ---------- 画面 ----------
const view = () => $("#view");
let session = null, timerId = null;

function setTab(t) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  clearInterval(timerId);
  session = null;
  ({ home: renderHome, words: renderWords, settings: renderSettings })[t]();
  window.scrollTo(0, 0);
}

function counts() {
  let mastered = 0, learning = 0, fresh = 0;
  for (const w of WORDS) { const b = card(w.w).box; if (b >= MASTER) mastered++; else if (b > 0) learning++; else fresh++; }
  return { mastered, learning, fresh };
}
function streak() {
  const days = new Set(state.history.map((h) => h.day));
  let n = 0, t = Date.now();
  if (!days.has(dayKey(t))) t -= DAY;
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

function renderHome() {
  const { mastered, learning, fresh } = counts();
  const due = dueWords();
  const newLeft = Math.max(0, state.settings.newPerDay - newToday());
  const nw = newWords(newLeft);
  const total = WORDS.length;
  view().innerHTML = `
    <section class="panel">
      <h2>進捗（${total}語）</h2>
      <div class="stats">
        <div><b>${mastered}</b><span>習得</span></div>
        <div><b>${learning}</b><span>学習中</span></div>
        <div><b>${fresh}</b><span>未学習</span></div>
      </div>
      <div class="bar"><i style="width:${mastered / total * 100}%;background:var(--ok)"></i><i style="width:${learning / total * 100}%;background:var(--accent)"></i></div>
      <p class="muted small" style="margin:10px 0 0">連続学習 ${streak()} 日・習得＝間隔を空けて5回正解</p>
    </section>
    <section class="panel">
      <h2>今日の学習</h2>
      <p style="margin:0 0 12px">復習 <b>${due.length}</b> 語 ・ 新出 <b>${nw.length}</b> 語</p>
      <button class="btn" id="start" ${due.length + nw.length ? "" : "disabled"}>${due.length + nw.length ? "Complete the Words を始める" : "今日の分は完了"}</button>
      <button class="btn sub" id="free">自由練習（全空欄で3段落）</button>
    </section>
    <p class="muted small">段落中の単語の後半を補って完成させる、TOEFL Reading「Complete the Words」と同じ形式です。間違えた語は語源つきで解説し、後日別の段落でもう一度出題します。</p>`;
  $("#start").onclick = () => startSession(buildSession([...due, ...nw]));
  $("#free").onclick = () => startSession(freeSession());
}

function startSession(list) {
  if (!list.length) return;
  session = { list, i: 0, log: [], started: Date.now() };
  renderQuestion();
}

function renderQuestion() {
  const item = session.list[session.i];
  const p = PASSAGES.find((x) => x.id === item.id);
  const tset = new Set(item.targets);
  let html = "", n = 0;
  for (const tk of tokens(p.text)) {
    if (!tk.head) { html += esc(tk.t); continue; }
    const c = card(tk.head);
    const blank = tset.has(tk.head) || c.box > 0;
    if (!blank) { html += `<span class="known" data-w="${esc(tk.head)}">${esc(tk.surface)}</span>`; continue; }
    const [shown, miss] = splitWord(tk.surface);
    html += `<span class="blank" data-i="${n}" data-head="${esc(tk.head)}" data-miss="${esc(miss)}" data-surface="${esc(tk.surface)}" data-target="${tset.has(tk.head) ? 1 : 0}">${esc(shown)}<input aria-label="${esc(shown)}の続き" maxlength="${miss.length + 4}" style="width:calc(${miss.length}ch + ${miss.length * 0.2}ch + 6px)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="next"></span>`;
    n++;
  }
  const limit = n * SEC_PER_BLANK;
  view().innerHTML = `
    <div class="qhead"><span class="topic">${session.i + 1} / ${session.list.length} ・ ${esc(p.topic)}</span><span class="timer" id="timer">0:00 / ${mmss(limit)}</span></div>
    <p class="direction">Fill in the missing letters in the paragraph.</p>
    <section class="panel passage" id="passage">${html}</section>
    <div id="hint"></div>
    <div class="toolbar"><button class="btn sub" id="hintBtn">ヒント</button><button class="btn" id="check">答え合わせ</button></div>
    <p class="muted small" id="qnote">点線の語はまだ学習していない語です（タップで意味）。ヒントを使って正解した語は「もう一度」扱いになります。</p>`;
  const inputs = [...view().querySelectorAll(".blank input")];
  let lastFocus = inputs[0];
  inputs.forEach((inp, k) => {
    const miss = inp.parentElement.dataset.miss;
    inp.addEventListener("focus", () => { lastFocus = inp; });
    inp.addEventListener("input", () => {
      if (inp.value.length >= miss.length && inputs[k + 1] && !inp.value.endsWith(" ")) inputs[k + 1].focus();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!inp.value.trim()) return; // 自動移動直後の Enter で空欄を飛ばさない
      const nextEmpty = inputs.slice(k + 1).find((x) => !x.value.trim());
      nextEmpty ? nextEmpty.focus() : check();
    });
  });
  view().querySelectorAll(".known").forEach((el) => el.onclick = () => openCard(el.dataset.w));
  $("#hintBtn").onclick = () => {
    if (!lastFocus) return;
    const b = lastFocus.parentElement;
    b.classList.add("hinted");
    const w = WMAP[b.dataset.head];
    $("#hint").innerHTML = `<div class="hintbox"><b>${esc(b.firstChild.textContent)}…</b>（${esc(w.pos)}）${esc(w.ja)}</div>`;
    lastFocus.focus();
  };
  $("#check").onclick = check;
  const t0 = Date.now();
  clearInterval(timerId);
  timerId = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    const el = $("#timer"); if (!el) return clearInterval(timerId);
    el.textContent = `${mmss(s)} / ${mmss(limit)}`;
    el.classList.toggle("over", s > limit);
  }, 500);
  session.t0 = t0;
  if (matchMedia("(hover: hover)").matches) inputs[0]?.focus();
}

function check() {
  clearInterval(timerId);
  const secs = Math.round((Date.now() - session.t0) / 1000);
  const item = session.list[session.i];
  const p = PASSAGES.find((x) => x.id === item.id);
  const rows = [];
  view().querySelectorAll(".blank").forEach((b) => {
    const inp = $("input", b);
    const typed = inp.value.trim().toLowerCase();
    const { miss, surface, head } = b.dataset;
    const ok = typed === miss.toLowerCase() || typed === surface.toLowerCase();
    const hinted = b.classList.contains("hinted");
    grade(head, ok, hinted, b.dataset.target === "1");
    rows.push({ head, surface, ok, hinted, typed });
    b.classList.add(ok ? "ok" : "ng");
    const [shown] = splitWord(surface);
    b.innerHTML = `${esc(shown)}<span class="fix">${esc(miss)}</span>${!ok && typed ? `<span class="typed">${esc(typed)}</span>` : ""}`;
  });
  state.passSeen[p.id] = Date.now();
  const nOk = rows.filter((r) => r.ok && !r.hinted).length;
  session.log.push({ id: p.id, blanks: rows.length, ok: nOk, secs });
  save();

  const ordered = [...rows.filter((r) => !r.ok), ...rows.filter((r) => r.ok && r.hinted), ...rows.filter((r) => r.ok && !r.hinted)];
  const items = ordered.map((r) => {
    const w = WMAP[r.head];
    const cls = !r.ok ? "ng" : r.hinted ? "hinted" : "ok";
    const mark = !r.ok ? "✕" : r.hinted ? "△" : "○";
    const showEty = !r.ok || r.hinted;
    return `<li class="${cls}" data-w="${esc(r.head)}"><span class="mark">${mark}</span><span class="w">${esc(r.surface)}</span> <span class="muted small">← ${esc(w.w)}（${esc(w.pos)}）</span><div class="small">${esc(w.ja)}</div>${showEty ? etyHtml(w) : ""}</li>`;
  }).join("");
  const last = session.i === session.list.length - 1;
  $("#hint").innerHTML = "";
  $(".toolbar").outerHTML = `
    <section class="panel" style="margin-top:14px">
      <h2>結果 ${nOk} / ${rows.length}（${mmss(secs)}）</h2>
      <ul class="result">${items}</ul>
      <details style="margin-top:10px"><summary class="muted small">和訳を表示</summary><p class="ja">${esc(p.ja)}</p></details>
    </section>
    <button class="btn" id="next">${last ? "結果まとめへ" : "次の段落へ"}</button>`;
  $("#qnote")?.remove();
  view().querySelectorAll(".result li").forEach((li) => li.onclick = () => openCard(li.dataset.w));
  $("#next").onclick = () => { if (last) renderSummary(); else { session.i++; renderQuestion(); window.scrollTo(0, 0); } };
}

function renderSummary() {
  const blanks = session.log.reduce((a, x) => a + x.blanks, 0);
  const ok = session.log.reduce((a, x) => a + x.ok, 0);
  const secs = session.log.reduce((a, x) => a + x.secs, 0);
  state.history.push({ day: dayKey(), at: Date.now(), passages: session.log.length, blanks, ok, secs });
  if (state.history.length > 500) state.history = state.history.slice(-500);
  save();
  const { mastered } = counts();
  view().innerHTML = `
    <section class="panel">
      <h2>おつかれさまでした</h2>
      <div class="stats">
        <div><b>${blanks ? Math.round(ok / blanks * 100) : 0}%</b><span>正答率</span></div>
        <div><b>${ok}/${blanks}</b><span>正解</span></div>
        <div><b>${mmss(secs)}</b><span>所要時間</span></div>
      </div>
      <p class="muted small" style="margin:12px 0 0">習得済み ${mastered} / ${WORDS.length} 語。間違えた語は次回の学習でまた出題されます。</p>
    </section>
    <button class="btn" id="home">ホームへ</button>`;
  $("#home").onclick = () => setTab("home");
}

function etyHtml(w) {
  const chips = w.ety.parts.map((x) => `<span class="chip${x.list ? " list" : ""}">${esc(x.p)}<small>${esc(x.m)}</small></span>`).join('<span class="plus">+</span>');
  return `<div class="ety">${chips}</div><p class="note">${esc(w.ety.note)}</p>`;
}

function examples(head) {
  const out = [];
  for (const p of PASSAGES) {
    for (const s of p.text.split(/(?<=[.!?:;])\s+/)) {
      const re = new RegExp(`\\[([^\\]|]+)\\|${head}\\]`);
      if (re.test(s)) out.push(esc(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, (_, sf, h) => h === head ? `<b>${sf}</b>` : sf));
    }
  }
  return out;
}

function openCard(head) {
  const w = WMAP[head]; const c = card(head);
  const dlg = $("#card");
  dlg.innerHTML = `<div class="cardin">
    <h3>${esc(w.w)} <span class="pos">${esc(w.pos)}</span> <button class="speak" id="say">♪ 発音</button></h3>
    <div class="mean">${esc(w.ja)}</div>
    <div class="dots${c.box >= MASTER ? " done" : ""}">${dots(c.box)}</div>
    <h4>語源（枠付き＝Word Parts List 収録）</h4>${etyHtml(w)}
    <h4>派生形</h4><div class="forms">${w.forms.map(esc).join(" / ") || "—"}</div>
    <h4>例文</h4>${examples(head).map((s) => `<p class="ex">${s}</p>`).join("")}
    <p class="muted small">正解 ${c.correct} ・ 不正解 ${c.wrong}${c.box > 0 ? ` ・ 次回 ${dayKey(c.due)}` : ""}</p>
    <button class="btn sub" id="close">閉じる</button></div>`;
  $("#say", dlg).onclick = () => speak(w.w);
  $("#close", dlg).onclick = () => dlg.close();
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  dlg.showModal();
}
const dots = (box) => Array.from({ length: MASTER }, (_, i) => `<i class="${i < box ? "f" : ""}"></i>`).join("");
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch { /* 読み上げ非対応 */ }
}

let wordFilter = "all", wordQuery = "";
function renderWords() {
  const f = { all: "全て", fresh: "未学習", learning: "学習中", mastered: "習得", weak: "苦手" };
  view().innerHTML = `
    <input class="search" id="q" placeholder="単語・意味で検索" value="${esc(wordQuery)}" autocapitalize="off" autocorrect="off">
    <div class="filters">${Object.entries(f).map(([k, v]) => `<button data-f="${k}" class="${k === wordFilter ? "on" : ""}">${v}</button>`).join("")}</div>
    <ul class="wlist" id="wl"></ul>`;
  const draw = () => {
    const q = wordQuery.toLowerCase();
    const list = WORDS.filter((w) => {
      const c = card(w.w);
      const pass = { all: true, fresh: c.box === 0, learning: c.box > 0 && c.box < MASTER, mastered: c.box >= MASTER, weak: c.wrong > 0 && c.wrong >= c.correct }[wordFilter];
      return pass && (!q || w.w.includes(q) || w.ja.includes(wordQuery) || w.forms.some((x) => x.includes(q)));
    });
    $("#wl").innerHTML = list.map((w) => { const c = card(w.w); return `<li data-w="${w.w}"><span class="w">${w.w}</span><span class="m">${esc(w.ja)}</span><span class="dots${c.box >= MASTER ? " done" : ""}">${dots(c.box)}</span></li>`; }).join("") || `<li class="muted">該当なし</li>`;
    view().querySelectorAll("#wl li[data-w]").forEach((li) => li.onclick = () => openCard(li.dataset.w));
  };
  $("#q").oninput = (e) => { wordQuery = e.target.value; draw(); };
  view().querySelectorAll(".filters button").forEach((b) => b.onclick = () => { wordFilter = b.dataset.f; renderWords(); });
  draw();
}

function renderSettings() {
  const recent = [...state.history].reverse().slice(0, 14);
  view().innerHTML = `
    <section class="panel">
      <h2>最近の学習</h2>
      ${recent.length ? `<table class="hist">${recent.map((h) => `<tr><td>${h.day}</td><td>${h.passages}段落</td><td>${h.ok}/${h.blanks}</td><td>${mmss(h.secs)}</td></tr>`).join("")}</table>` : `<p class="muted">まだ記録がありません</p>`}
    </section>
    <section class="panel">
      <h2>設定</h2>
      <label>1日の新出語数 <select id="npd">${[5, 10, 15, 20, 30].map((n) => `<option ${n === state.settings.newPerDay ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    </section>
    <section class="panel">
      <h2>Mac ⇄ iPhone の進捗移行</h2>
      <p class="muted small" style="margin-top:0">進捗は端末ごとに保存されます。片方で「コピー」し、メモや AirDrop でもう片方に送って「読み込む」に貼り付けてください（読み込むと上書きされます）。</p>
      <div class="row"><button class="btn sub" id="copy">進捗をコピー</button><button class="btn sub" id="dl">ファイルで保存</button></div>
      <textarea id="imp" placeholder="ここに進捗データを貼り付け" style="margin-top:10px"></textarea>
      <div class="row" style="margin-top:10px"><button class="btn sub" id="load">読み込む</button><label class="btn sub" style="text-align:center">ファイルから<input type="file" id="file" accept=".json,application/json" hidden></label></div>
      <p id="msg" class="small" role="status"></p>
    </section>
    <section class="panel">
      <h2>リセット</h2>
      <button class="btn sub" id="reset" style="color:var(--ng)">学習記録をすべて消す</button>
    </section>
    <p class="muted small">収録 ${WORDS.length}語 / ${PASSAGES.length}段落。素材: TST Prep Academic Vocabulary List・Essential Word Parts List（個人学習用）。</p>`;
  const msg = (t) => { $("#msg").textContent = t; };
  $("#npd").onchange = (e) => { state.settings.newPerDay = +e.target.value; save(); };
  const dump = () => JSON.stringify({ app: "toefl-anki", v: 1, at: Date.now(), state });
  $("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText(dump()); msg("コピーしました"); }
    catch { $("#imp").value = dump(); $("#imp").select(); msg("自動コピーできないため、上の欄の文字を手動でコピーしてください"); }
  };
  $("#dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([dump()], { type: "application/json" }));
    a.download = `toefl-anki-${dayKey()}.json`; a.click();
  };
  const importText = (txt) => {
    try {
      const d = JSON.parse(txt);
      if (d.app !== "toefl-anki" || !d.state?.cards) throw new Error();
      if (!confirm("現在の進捗を読み込んだデータで上書きします。よろしいですか？")) return;
      state = { ...blankState(), ...d.state }; save(); msg("読み込みました"); setTimeout(() => setTab("home"), 600);
    } catch { msg("データの形式が正しくありません"); }
  };
  $("#load").onclick = () => importText($("#imp").value);
  $("#file").onchange = async (e) => { const f = e.target.files[0]; if (f) importText(await f.text()); };
  $("#reset").onclick = () => {
    if (!confirm("学習記録をすべて消します。元に戻せません。よろしいですか？")) return;
    state = blankState(); save(); setTab("home");
  };
}

// ---------- 起動 ----------
async function init() {
  load();
  try {
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
    const { batches } = await get("data/index.json");
    const parts = await Promise.all(batches.map((b) => Promise.all([get(`data/words/${b}.json`), get(`data/passages/${b}.json`)])));
    WORDS = parts.flatMap(([w]) => w);
    PASSAGES = parts.flatMap(([, p]) => p);
    PASSAGES.forEach((p) => { p.heads = tokens(p.text).filter((x) => x.head).map((x) => x.head); });
    WMAP = Object.fromEntries(WORDS.map((x) => [x.w, x]));
  } catch {
    view().innerHTML = `<p class="panel">データを読み込めませんでした。一度オンラインで開いてください。</p>`;
    return;
  }
  document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  const net = () => { $("#offline").hidden = navigator.onLine; };
  addEventListener("online", net); addEventListener("offline", net); net();
  setTab("home");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
init();
