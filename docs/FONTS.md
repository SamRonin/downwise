# Font loading & subsetting

DownWise ships two variable fonts as static assets:

| File | Family | Size | Covers |
|---|---|---|---|
| `assets/fonts/Vazirmatn-Variable.woff2` | Vazirmatn | 111 KB | Persian/Arabic script (+ its own Latin) |
| `assets/fonts/Inter-Variable.woff2` | Inter | 48 KB | Latin / Latin-Ext |

## Why CSS-level subsetting

The project has a hard **no-build-step** rule (native ES modules loaded straight by Chrome), so
glyph-level subsetting with a toolchain (`pyftsubset`/`fonttools`) is not part of the pipeline.
Instead, subsetting happens at load time in `src/ui/base.css` via **`unicode-range`**:

- `Vazirmatn` is declared with an Arabic-script range
  (`U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200D, U+2010-2011, U+06F0-06F9`).
- `Inter` is declared with Latin/punctuation/symbol ranges
  (`U+0000-00FF, U+0100-024F, U+0300-036F, U+1E00-1EFF, U+2000-206F, U+2070-209F, U+20A0-20CF, U+2190-21FF, U+2212, U+25A0-25FF, U+2C60-2C7F`).

Browsers fetch a `@font-face` file **only if rendered text intersects its `unicode-range`**, so:

- Persian UI (`data-lang="fa"`) loads **Vazirmatn only**; Latin fragments inside Persian text
  fall through to Inter (which loads only when such characters actually render).
- English UI (`data-lang="en"`) loads **Inter only** — Vazirmatn's 111 KB stay untouched.

Net effect: every page downloads at most the glyphs it really draws, and mixed
Persian/Latin text renders with the correct face per script without any JavaScript.

## Font stacks

```css
--font-fa: 'Vazirmatn', 'Inter', 'Tahoma', 'Segoe UI', sans-serif;
--font-en: 'Inter', 'Vazirmatn', 'Segoe UI', system-ui, sans-serif;
```

Both licenses (SIL OFL) are shipped alongside the binaries in `assets/fonts/`.

## If you ever rebuild the binaries

Keep each file under ~150 KB and re-check the `unicode-range` declarations — the ranges are the
contract. A future optional step (outside the zero-dependency runtime) could subset Vazirmatn to
the Arabic block only (~40 KB); the CSS above already behaves correctly with such a file.
