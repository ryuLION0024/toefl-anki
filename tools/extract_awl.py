"""AWL PDF から見出し語・品詞・派生形を抽出して tools/awl_raw.json に保存する。"""
import json, re, sys
import pypdf

src = sys.argv[1]
r = pypdf.PdfReader(src)
text = " ".join((p.extract_text() or "") for p in r.pages[5:])
import unicodedata
text = unicodedata.normalize("NFKC", text)
text = re.sub(r"\s+", " ", text)
text = text.replace("Academic Vocabulary List for the TOEFL® Test 570 of the Most Common Academic Words", " ")
text = text.replace("WORD VERB NOUN ADJECTIVE ADVERB", " ")
text = text.replace("The Academic Word Family List", " ")
TOK = r"(?:adj|adv|n|v|prep|conj|conjunction|preposition)"
pat = re.compile(r"(?<!, )([a-z][a-z\-]*) \((" + TOK + r"(?:[./ ]+" + TOK + r")*[./]*)\)")
ms = list(pat.finditer(text))
out = []
for i, m in enumerate(ms):
    end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
    rest = text[m.end():end].strip()
    head = m.group(1)
    stem = head[:max(3, len(head) - 3)]
    forms = sorted({w for w in re.findall(r"[a-z][a-z\-]+", rest) if w != head and (w.startswith(stem) or stem in w)})
    if any(o["word"] == head for o in out):
        continue
    out.append({"word": head, "pos": m.group(2), "forms": forms})
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(len(out), "headwords")
