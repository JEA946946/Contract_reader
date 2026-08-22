"""OCR must rescue the unreadable and never touch the readable.

Run: python3 tests/test_scanned_fallback.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

_failed = 0


def check(name, ok, why=""):
    global _failed
    if ok:
        print(f"PASS  {name}")
    else:
        _failed += 1
        print(f"FAIL  {name}" + (f"\n        {why}" if why else ""))


from app.parsers import scanned_fallback as sf

# ── The threshold ───────────────────────────────────────────────────────────
check("an empty text layer counts as unreadable", sf.looks_unreadable(""))
check("ten characters counts as unreadable — a scanned contract gave exactly that",
      sf.looks_unreadable("ODYSSEE\nPA"))
check("None counts as unreadable", sf.looks_unreadable(None))
check("a real extraction does not", not sf.looks_unreadable("x" * 500))

# ── The rule that matters ───────────────────────────────────────────────────
calls = []
sf.ocr_text = lambda p: (calls.append(p), "OCR" * 500)[1]

good = "pdfplumber text " * 40
out = sf.with_fallback(Path("/tmp/whatever.pdf"), good)
check("a readable document is returned untouched", out == good,
      "the fallback replaced text that was already fine")
check("and OCR is never even attempted for it", not calls,
      "OCR ran on a document that pdfplumber had already read — that is the "
      "case measured at 22 rows against the fallback's 10")

out = sf.with_fallback(Path("/tmp/scan.pdf"), "ten chars")
check("an unreadable one is rescued", out.startswith("OCR"))
check("and OCR was called once", len(calls) == 1)

# ── Failure must not make things worse ──────────────────────────────────────
sf.ocr_text = lambda p: ""
check("when OCR finds nothing, the original is kept",
      sf.with_fallback(Path("/tmp/x.pdf"), "ten chars") == "ten chars")

def boom(p):
    raise RuntimeError("xberg exploded")

sf.ocr_text = boom
try:
    kept = sf.with_fallback(Path("/tmp/x.pdf"), "ten chars")
    check("an OCR crash does not propagate", kept == "ten chars",
          f"survived but returned {kept!r} instead of the original text")
except RuntimeError:
    check("an OCR crash does not propagate", False,
          "with_fallback let the exception through — a failed rescue must not "
          "break a parse that was already going to fail")
except Exception:
    check("an OCR crash does not propagate", False, "unexpected exception type")

print()
print(f"{_failed} failed." if _failed else "The fallback only fires where nothing else worked.")
sys.exit(1 if _failed else 0)
