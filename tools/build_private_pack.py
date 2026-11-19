"""手元の TST Prep PDF から個人用の練習データ（private/tstprep-pack.json）を作る。

出力ファイルは .gitignore 済み。公開リポジトリには入れず、アプリの
「記録・設定 → TST Prep データを読み込む」から各端末に取り込む。

使い方: python3 tools/build_private_pack.py ~/Desktop/12.英語勉強/TSTprep
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pypdf

SRC = Path(sys.argv[1]).expanduser()
OUT = Path(__file__).resolve().parent.parent / "private" / "tstprep-pack.json"


def clean(t):
    t = unicodedata.normalize("NFKC", t or "")
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    t = re.sub(r"\s+", " ", t)
    # 合字（ﬁ・ﬀ）の抽出で単語が割れた箇所を戻す
    t = re.sub(r"\b(di|con|bene|speci|e|su|o|a|ef|af|suf|signi|identi|pro|in|de|re) (ff|fi|fl)", r"\1\2", t)
    t = t.replace("Transcrip ts", "Transcripts").replace("Sa mple", "Sample")
    t = re.sub(r" ([,.?!])", r"\1", t)
    return t.strip()


def pages(name):
    return [clean(p.extract_text()) for p in pypdf.PdfReader(SRC / name).pages]


def strip_header(t, doc):
    return re.sub(rf"^TST Prep \d+ Your Guide to the TOEFL {doc}\s*", "", t).strip()


def sentences(t):
    return [s for s in re.split(r"(?<=[.?!])\s+(?=[A-Z\"])", t) if s]


pack = {"app": "toefl-anki-pack", "v": 1, "source": "TST Prep", "build": [], "repeat": [], "templates": [], "interview": [], "checklists": []}
problems = []

# ---------------- Writing ----------------
W = pages("your-guide-to-the-toefl-writing.pdf")
w_all = " ".join(strip_header(p, "Writing") for p in W)

# Build a Sentence：例文（“…”）と語句チップから並べ替え問題を作る
names = ["Embedded Question", "Infinitive Included", "Negative Structure", "Relative Clause",
         "Conditional Style", "Adverbial Clause", "Follow-up Question"]
ja_names = ["埋め込み疑問", "不定詞", "否定", "関係詞節", "仮定法・条件", "副詞節", "聞き返し・追加質問"]
bounds = [w_all.find(n) for n in names] + [w_all.find("Write an Email The second")]
for k, n in enumerate(names):
    seg = w_all[bounds[k]:bounds[k + 1]]
    m = re.search(r'For example, "\s*(.+?)\s*"\s*(.+?)\s*(_____.*)$', seg)
    if not m:
        problems.append(f"BaS {n}: 例文が見つからない")
        continue
    example, rest_before, rest = m.group(1).strip(), m.group(2), m.group(3)
    # 文脈文（質問や発言）と、空欄の前に固定で出ている語
    ctx_m = re.match(r"(.+?[?.])\s*(.*)$", rest_before)
    context, pre = (ctx_m.group(1), ctx_m.group(2).strip()) if ctx_m else (rest_before, "")
    after = re.sub(r"(_____[?.]?\s*)+", "\u0000", rest, count=1).split("\u0000", 1)[-1].strip()
    raw = after.split(" / ")
    if len(raw) < 3:
        problems.append(f"BaS {n}: 語句チップが見つからない")
        continue
    # 空欄の後ろの固定文（"the community." など）は最初のチップの前に付いてくる
    pm = re.match(r"^(.*?[.?])\s*(\S.*)$", raw[0])
    post_text, raw[0] = (pm.group(1).strip(" ."), pm.group(2)) if pm else ("", raw[0])
    post_text = post_text.strip()
    chips = [c.strip(" .?") for c in raw if c.strip(" .?")]
    # 最後のチップに後ろの固定文が混ざる場合があるので、例文の末尾と突き合わせる
    ex = example.rstrip(".?! ")
    body = ex[len(pre):].strip() if pre and ex.startswith(pre) else ex
    if post_text and body.lower().endswith(post_text.lower()):
        body = body[: -len(post_text)].strip()
    answer, remaining, pos = [], chips[:], body
    while pos:
        low = pos.lower()
        cand = sorted([c for c in remaining if low == c.lower() or low.startswith(c.lower() + " ")], key=len, reverse=True)
        if not cand:
            break
        answer.append(pos[:len(cand[0])]); remaining.remove(cand[0]); pos = pos[len(cand[0]):].strip()
    if pos:
        problems.append(f"BaS {n}: 例文と語句チップが一致しない（残り: {pos[:30]}）")
        continue
    end = example.strip()[-1] if example.strip()[-1] in ".?" else "."
    pack["build"].append({"id": f"tst-bs{k+1}", "structure": ja_names[k], "context": context.strip(),
                          "pre": pre, "answer": answer, "post": (post_text.rstrip(".?") + end) if post_text else end,
                          "extra": remaining})

# Email の型
m = re.search(r"general structure of the response:\s*(.+?)\s*WARNING", w_all)
if m:
    parts = [p.strip() for p in m.group(1).split("●") if p.strip()]
    pack["templates"].append({"id": "tst-email-structure", "group": "Write an Email", "title": "TST：メールの型",
                              "note": "TST Prep Writing Guide p.6", "text": "\n".join(parts)})
else:
    problems.append("Email の型が見つからない")

# Email の課題と模範解答（課題ページ → 次のページが模範解答）
for k, (qp, ap) in enumerate([(8, 9), (10, 11), (12, 13)], 1):
    q = strip_header(W[qp], "Writing")
    a = strip_header(W[ap], "Writing")
    prompt = re.sub(r"^#\d+\s*", "", q.split("Write as much as")[0]).strip()
    body = re.sub(rf"^Sample Answer #{k}\s*", "", a).strip()
    body = re.sub(r"\s+(Thank you for|Sincerely)", r"\n\1", body)
    body = re.sub(r"^(Dear [^,]+,)\s*", r"\1\n", body)
    pack["templates"].append({"id": f"tst-email-sample{k}", "group": "Write an Email",
                              "title": f"TST：模範メール #{k}", "note": prompt, "text": body})

# Academic Discussion のテンプレート表（行ごとに「型」と「例」に分ける）
seg = w_all[w_all.find("TEMPLATE:"):w_all.find("#1 Your professor")]
rows = ["General opinion on the topic", "Specific reason for your opinion",
        "An example or illustration to support your reason",
        "Acknowledge point of view of one of the speakers and explain why you agree/disagree",
        "Expand on your second reason"]
lines_t, lines_e = [], []
for i, r in enumerate(rows):
    s = seg.find(r)
    e = seg.find(rows[i + 1]) if i + 1 < len(rows) else len(seg)
    if s < 0:
        problems.append(f"AD 表の行が見つからない: {r}")
        continue
    cell = seg[s + len(r):e].strip()
    head = " ".join(cell.split()[:3])
    j = cell.find(head, len(head))
    tmpl, ex = (cell[:j].strip(), cell[j:].strip()) if j > 0 else (cell, "")
    lines_t.append(tmpl); lines_e.append(ex)
pack["templates"].append({"id": "tst-ad-template", "group": "Academic Discussion", "title": "TST：ディスカッションの型",
                          "note": "TST Prep Writing Guide p.13", "text": "\n".join(lines_t)})
pack["templates"].append({"id": "tst-ad-template-ex", "group": "Academic Discussion", "title": "TST：型の使用例",
                          "note": "テンプレート表の Example 列", "text": "\n".join(x for x in lines_e if x)})

# Academic Discussion の模範解答（課題ページの教授の問い → 次ページの解答）
for k, (qp, ap) in enumerate([(15, 16), (17, 18), (19, 20)], 1):
    a = strip_header(W[ap], "Writing")
    a = re.sub(rf"^Academic Discussion Response #{k}\s*", "", a)
    qm = re.match(r'"(.+?)"\s*(.+)$', a)
    question, body = (qm.group(1), qm.group(2)) if qm else ("", a)
    body = re.sub(r"\s*\(\d+ words\)\s*$", "", body).strip()
    pack["templates"].append({"id": f"tst-ad-sample{k}", "group": "Academic Discussion",
                              "title": f"TST：模範投稿 #{k}", "note": question, "text": body})

# 自己チェックリスト
cl = strip_header(W[21], "Writing")
for title, a, b in [("Write an Email", "Write an Email 1.", "Write for an Academic Discussion 1."),
                    ("Academic Discussion", "Write for an Academic Discussion 1.", None)]:
    s = cl.find(a); e = cl.find(b, s + 1) if b else len(cl)
    items = [x.strip(" *") for x in re.split(r"\d+\.\s*✅\s*❌\s*", cl[s:e])[1:]]
    items = [re.sub(r"\s*\*?What can I do better next time\?.*$", "", x) for x in items]
    pack["checklists"].append({"id": f"tst-cl-{title[:5].lower()}", "title": f"TST：{title} チェックリスト", "items": items})

# ---------------- Speaking ----------------
S = pages("your-guide-to-the-toefl-speaking.pdf")
s_all = " ".join(strip_header(p, "Speaking") for p in S)

# Listen and Repeat：本文中の例（オフィスのキッチン）
ctx = re.search(r"(You are welcoming new employees[^.]+\.)", s_all)
quoted = {}
for num, txt in re.findall(r'(\d)\. Listen and repeat only once\. "([^"]+)"', s_all):
    quoted.setdefault(int(num), txt)
if ctx and len(quoted) >= 7:
    pack["repeat"].append({"id": "tst-lr0", "title": "TST：オフィスのキッチン", "context": ctx.group(1),
                           "sentences": [quoted[i] for i in range(1, 8)]})
else:
    problems.append("L&R 例題が見つからない")

# Listen and Repeat：解答編の2セット
key = s_all[s_all.find("Answer Key"):]
contexts = re.findall(r"(You are (?:explaining the layout|being trained)[^.]+\.)", s_all)
titles = ["TST：大学図書館の案内", "TST：スーパーのレジ研修"]
for k in (1, 2):
    m = re.search(rf"Listen and Repeat #{k}\s*(.+?)(?=Listen and Repeat #{k+1}|Take an Interview #1|$)", key)
    if not m:
        problems.append(f"L&R 解答 #{k} が見つからない"); continue
    sents = [x.strip() for x in re.split(r"\s*\d\.\s+", m.group(1)) if x.strip()]
    sents = [re.sub(r"\s*\d+$", "", x) for x in sents][:7]
    pack["repeat"].append({"id": f"tst-lr{k}", "title": titles[k - 1],
                           "context": (contexts[k - 1] if k - 1 < len(contexts) else "") + " Listen and repeat only once.",
                           "sentences": sents})

# Interview：質問タイプ別の例（3トピック × 4問）
qsets = [[], [], []]
for qn in range(1, 5):
    s = s_all.find(f"Question #{qn} asks")
    e = s_all.find(f"Question #{qn+1} asks") if qn < 4 else s_all.find("Take an Interview: Templates")
    bullets = [b.strip(' "') for b in s_all[s:e].split("●")[1:]]
    bullets = [re.sub(r'"?\s*\d+$', "", b).strip(' "') for b in bullets]
    for i in range(min(3, len(bullets))):
        qsets[i].append(bullets[i])
topics = ["チームワーク", "アウトドア活動", "テクノロジー"]
intro = re.search(r"(You have agreed to participate in a research study about teamwork\.[^.]+\.[^.]+\.)", s_all)
for i, qs in enumerate(qsets):
    if len(qs) == 4:
        pack["interview"].append({"id": f"tst-iv{i+1}", "topic": f"TST：{topics[i]}",
                                  "intro": intro.group(1) if (i == 0 and intro) else f"Research interview about {['teamwork','outdoor activities','technology'][i]}.",
                                  "questions": qs})
    else:
        problems.append(f"Interview セット {topics[i]} の質問数が {len(qs)}")

# Interview：型（ステップ）と模範解答（p.13〜16）
labels = ["個人の経験", "好み", "未来の予想", "抽象的な考え"]
tsec = s_all[s_all.find("Take an Interview: Templates and Sample Answers"):s_all.find("Take an Interview: Transitional")]
for qn in range(1, 5):
    s = tsec.find(f"Question #{qn} 1st")
    e = tsec.find(f"Question #{qn+1} 1st") if qn < 4 else len(tsec)
    part = tsec[s:e]
    # 型の終わり：「*Add another ...」の注記、無ければ 4th のステップ末尾の「...」
    add = part.find("*Add another")
    if add >= 0:
        steps_end, rest_start = add, part.find("if necessary.", add) + len("if necessary.")
    else:
        m4 = re.search(r"4th - .*?\.\.\.", part)
        steps_end = rest_start = m4.end() if m4 else len(part)
    steps_txt = part[len(f"Question #{qn} "):steps_end].strip()
    steps = re.split(r"\s+(?=\dnd -|\drd -|\dth -)", steps_txt)
    rest = re.sub(r"\s*\d+$", "", part[rest_start:].strip())
    ss, prompt, seen_q = sentences(rest), [], False
    for x in ss:
        if not seen_q or x.endswith("?") or x.startswith("Explain"):
            prompt.append(x); seen_q = seen_q or x.endswith("?")
        else:
            break
    answer = " ".join(ss[len(prompt):])
    pack["templates"].append({"id": f"tst-int-q{qn}", "group": "Take an Interview", "title": f"TST：Q{qn}（{labels[qn-1]}）の型",
                              "note": "TST Prep Speaking Guide", "text": "\n".join(steps)})
    pack["templates"].append({"id": f"tst-int-sample-q{qn}", "group": "Take an Interview", "title": f"TST：Q{qn} 模範解答",
                              "note": " ".join(prompt), "text": answer})

# Interview：解答編の模範解答（チームワーク4問）
ak = key[key.find("Take an Interview #1"):]
for qn, (q, a) in enumerate(re.findall(r"\d\.\s+(.+?)\s+Sample Answer\s+(.+?)(?=\s+\d\.\s+[A-Z]|$)", ak), 1):
    a = re.sub(r"\s*\d+$", "", a).strip()
    pack["templates"].append({"id": f"tst-int-key{qn}", "group": "Take an Interview", "title": f"TST：チームワーク Q{qn} 模範解答",
                              "note": q.strip(), "text": a})

# つなぎ言葉の一覧
bank = s_all[s_all.find("Function Words and Phrases"):s_all.find("Take an Interview: How to Grade")]
funcs = ["Adding Information", "Giving Examples", "Giving Opinions", "Emphasizing Points",
         "Showing Cause and Effect", "Contrasting Ideas", "Ordering Information", "Concluding Stance"]
lines = []
for i, f in enumerate(funcs):
    s = bank.find(f); e = bank.find(funcs[i + 1]) if i + 1 < len(funcs) else len(bank)
    if s >= 0:
        lines.append(f + ": " + re.sub(r"\s*\d+$", "", bank[s + len(f):e].strip()))
pack["templates"].append({"id": "tst-transitions", "group": "つなぎ言葉", "title": "TST：つなぎ言葉の一覧",
                          "note": "TST Prep Speaking Guide p.17", "text": "\n".join(lines)})

# Speaking の自己チェックリスト
for pid, title, start in [(10, "Listen and Repeat", "Question Notes"), (20, "Take an Interview", "Question Notes")]:
    t = strip_header(S[pid], "Speaking")
    t = t[t.find(start) + len(start):]
    t = t.split("*Note")[0]
    items = [x.strip() for x in re.split(r"(?=Did I |What can I )", t) if x.strip()]
    pack["checklists"].append({"id": f"tst-cl-{title[:6].lower().replace(' ', '')}", "title": f"TST：{title} チェックリスト", "items": items})

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(pack, ensure_ascii=False, indent=1))
print(f"書き出し: {OUT}")
for k in ("build", "repeat", "templates", "interview", "checklists"):
    print(f"  {k}: {len(pack[k])}")
for p in problems:
    print("  要確認:", p)
