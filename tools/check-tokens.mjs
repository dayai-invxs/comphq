#!/usr/bin/env node
// pnpm check:tokens — the app owns colour and font, and nothing else.
//
// Six mechanisms, all reading the installed @mond-design-system/tokens
// package rather than a list kept here. The template is the source of truth
// for what a brand may set; a token added or renamed upstream shows up as a
// failure instead of silently falling through to the mond default.
//
//   1. brand-comphq.css re-declares every colour and font token the template
//      declares. The template says a missing alias falls through silently,
//      which is exactly the kind of drift nobody notices until a screenshot.
//   2. brand-comphq.css declares no geometry. Shape and size belong to the
//      system: a brand that moves a radius rung moves components that have
//      nothing to do with each other.
//   3. The contrast pairs the package holds its own defaults to are re-proved
//      against the brand's values, in both themes. A brand that re-points
//      every colour has re-opened every one of those questions.
//   4. The pre-paint block in index.html holds a literal colour, because it is
//      the only styling that exists before the stylesheet lands. It is checked
//      against the token it mirrors, so the two cannot drift apart.
//   5. No app stylesheet outside the brand file writes a raw colour or a raw
//      length. Those are token references or they are drift. Two exceptions:
//      a @media prelude, which is resolved before custom properties exist and
//      so must carry one of the system's --mds-bp-* literals; and an art
//      file named in ART — a sheet holding a scene's own measured palette.
//      It may name values and may not apply them, so the sheets that draw
//      with it stay under this rule. The list is empty since the hero scene
//      was removed; the mechanism stays for the next scene.
//   6. Every --* an app stylesheet reads resolves to one something declares.
//      A misspelt token fails nowhere: the declaration is dropped and the
//      element keeps whatever it would have had, which is a layout nobody
//      chose and no error to find it by.
//   7. The brand palette is declared once, as --comphq-* primitives in the
//      brand file, and the --mds-* tokens point at it. A primitive is a
//      swatch, not a role: it does not flip with the theme, and no app
//      stylesheet reads one — components ask for a role, the brand file
//      decides which swatch fills it.

import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { root } from './pg.mjs'

// Resolved through apps/web, which is the workspace that depends on the
// package. Hardcoding a node_modules path would break the first time pnpm
// hoists it somewhere else.
const require = createRequire(join(root, 'apps/web/package.json'))
const TEMPLATE = relative(root, require.resolve('@mond-design-system/tokens/brand-template.css'))
const BRAND = 'apps/web/src/tokens/brand-comphq.css'
const CSS_ROOTS = ['apps/web/src']

// Art files, named here rather than matched by a suffix: an exemption
// nobody can opt into by naming a file is an exemption that stays this size.
const ART = []

// The system's own breakpoints, read from the package that defines them.
// core/layout.css states the rule this check enforces: "a breakpoint is the
// one literal px a component sheet may carry, and every @media prelude in the
// system breaks at one of these."
const LAYOUT = require.resolve('@mond-design-system/tokens/styles.css')
  .replace(/styles\.css$/, 'core/layout.css')
const BREAKPOINTS = [...readFileSync(LAYOUT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--mds-bp-[a-z0-9]+:\s*([^;]+);/g)]
  .map((m) => m[1].trim())
if (BREAKPOINTS.length === 0) throw new Error(`no --mds-bp-* found in ${LAYOUT}`)

const problems = []
const note = (file, msg) => problems.push(`${file}: ${msg}`)

// ─── The template's own split between colour/font and geometry ──────────
// Everything before the geometry banner is settable colour and font.
// Everything after it is shape and size, and is the system's.
function splitTemplate(text) {
  const start = text.indexOf(':root {')
  const geometry = text.indexOf('── geometry')
  const end = text.indexOf('\n}', start)
  if (start < 0 || geometry < 0 || end < 0) {
    throw new Error(`${TEMPLATE} no longer has the shape this check reads`)
  }
  return {
    colour: declared(text.slice(start, geometry)),
    geometry: declared(text.slice(geometry, end)),
  }
}

function declared(text) {
  return [...text.matchAll(/^\s*(--mds-[a-z0-9-]+):/gm)].map((m) => m[1])
}

const template = splitTemplate(readFileSync(join(root, TEMPLATE), 'utf8'))

// ─── 1 + 2. The brand file ──────────────────────────────────────────────
const brandPath = join(root, BRAND)
if (!existsSync(brandPath)) {
  console.error(`${BRAND} not found. Copy ${TEMPLATE} and re-point the values.`)
  process.exit(1)
}
// Comments come out before anything is sliced or read: this file slices on
// the literal `[data-theme="dark"]`, and a comment that names the selector
// while explaining why the brand has no dark block would be read as the
// block itself, cutting the light table off at the top of the file.
const decomment = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')
const brandText = decomment(readFileSync(brandPath, 'utf8'))
const light = brandText.slice(0, brandText.indexOf('[data-theme="dark"]') + 1 || undefined)
const lightTokens = new Set(declared(light))

for (const token of template.colour) {
  if (!lightTokens.has(token)) note(BRAND, `${token} is not re-declared — it falls through to the mond default`)
}
for (const token of template.geometry) {
  if (declared(brandText).includes(token)) note(BRAND, `${token} is geometry — move the value into the design system`)
}

// A dark block may only re-point what the light block declares. A token that
// exists in one theme and not the other is a token that changes meaning when
// the theme flips.
const dark = brandText.slice(brandText.indexOf('[data-theme="dark"]'))
for (const token of declared(dark)) {
  if (!lightTokens.has(token)) note(BRAND, `${token} is re-pointed for dark but never declared for light`)
}

// ─── 7. Palette primitives ──────────────────────────────────────────────
const PALETTE = /--comphq-[a-z0-9-]+/
const palette = (text) => [...text.matchAll(/^\s*(--comphq-[a-z0-9-]+):/gm)].map((m) => m[1])
if (palette(light).length === 0) note(BRAND, 'declares no --comphq-* palette — the --mds-* tokens have no swatches to point at')
for (const token of palette(dark)) {
  note(BRAND, `${token} is re-declared for dark — a swatch does not flip, re-point the --mds-* token instead`)
}

// ─── 3. The contrast contract ───────────────────────────────────────────
// The package ships the pairs and the ratios it holds its own defaults to.
// A brand that re-points every one of those tokens has to be re-proved, not
// assumed, so the same file is run against these values.

function values(text) {
  const out = {}
  for (const m of text.matchAll(/^\s*(--(?:mds|comphq)-[a-z0-9-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim()
  return out
}

// var(--x) chains resolve to a literal, or to nothing if the chain leaves the
// file — which is itself a finding, since the light block is meant to be total.
function resolve(token, table, seen = new Set()) {
  const raw = table[token]
  if (raw === undefined || seen.has(token)) return undefined
  const alias = raw.match(/^var\((--(?:mds|comphq)-[a-z0-9-]+)\)$/)
  if (!alias) return raw
  return resolve(alias[1], table, new Set([...seen, token]))
}

function parse(value) {
  const hex = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: 1 }
  }
  const fn = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/)
  if (fn) return { rgb: [1, 2, 3].map((i) => Number(fn[i])), a: fn[4] === undefined ? 1 : Number(fn[4]) }
  return undefined
}

const channel = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a))

function contrast(fg, bg) {
  const front = luminance(over(fg, bg))
  const back = luminance(bg.rgb)
  const [hi, lo] = front > back ? [front, back] : [back, front]
  return (hi + 0.05) / (lo + 0.05)
}

const contract = JSON.parse(
  readFileSync(require.resolve('@mond-design-system/tokens/contrast-contract.json'), 'utf8'),
)

const themes = {
  light: values(light),
  dark: { ...values(light), ...values(dark) },
}

for (const [theme, table] of Object.entries(themes)) {
  for (const pair of contract.contrast) {
    const fgValue = resolve(pair.fg, table)
    const fg = fgValue && parse(fgValue)
    if (!fg) {
      note(BRAND, `${theme}: ${pair.fg} does not resolve to a colour this check can read`)
      continue
    }
    for (const bgToken of pair.bg) {
      const bgValue = resolve(bgToken, table)
      const bg = bgValue && parse(bgValue)
      if (!bg) {
        note(BRAND, `${theme}: ${bgToken} does not resolve to a colour this check can read`)
        continue
      }
      const got = contrast(fg, bg)
      if (got < pair.ratio) {
        note(BRAND, `${theme}: ${pair.fg} on ${bgToken} is ${got.toFixed(2)}:1, contract wants ${pair.ratio}:1`)
      }
    }
  }
}

// ─── 4. The pre-paint block in index.html ──────────────────────────────
// A render-blocking stylesheet still paints after the document, so the page
// shows its own default first. The inline block that covers that gap cannot
// use a custom property — none are defined yet — so it carries a literal, and
// the literal is held to the token it stands in for.
const HTML = 'apps/web/index.html'
const htmlPath = join(root, HTML)
if (!existsSync(htmlPath)) {
  note(HTML, 'not found — the SPA has no document to pre-paint')
} else {
  const inline = [...readFileSync(htmlPath, 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('\n')
  for (const rule of inline.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = rule[1].trim()
    const theme = selector.match(/data-theme=['"]?([a-z]+)/)?.[1] ?? 'light'
    if (!themes[theme]) {
      note(HTML, `${selector} names a theme the brand file does not declare`)
      continue
    }
    for (const decl of rule[2].matchAll(/([a-z-]+):\s*([^;]+);/g)) {
      const [, property, value] = decl
      if (property !== 'background' && property !== 'background-color') {
        note(HTML, `${selector} sets ${property}, which has no token to hold it to — the pre-paint block covers the page background and nothing else`)
        continue
      }
      const want = resolve('--mds-surface-page', themes[theme])
      // Hex is case-insensitive; the palette keeps the export's upper case.
      if (value.trim().toLowerCase() !== want?.toLowerCase()) {
        note(HTML, `${selector} paints ${value.trim()}, but --mds-surface-page in ${theme} is ${want}`)
      }
    }
  }
}

// ─── 5. Raw values in app stylesheets ───────────────────────────────────
const HEX = /#[0-9a-fA-F]{3,8}\b/
const LENGTH = /(?<![\w-])-?\d*\.?\d+(px|rem|em)\b/
const RGB = /\b(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.css')) out.push(full)
  }
  return out
}

for (const cssRoot of CSS_ROOTS) {
  const dir = join(root, cssRoot)
  if (!existsSync(dir)) continue
  for (const file of walk(dir)) {
    const rel = relative(root, file)
    if (rel === BRAND) continue
    // Comments are blanked across the whole file before the scan, keeping the
    // newlines so the line numbers still point at the source. Stripping them
    // per line cannot see a comment opened on an earlier one, and a sentence
    // explaining why a value is not in the stylesheet then reads as the value.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    // An art file may hold a literal only as the value of a custom property.
    // A declaration continued over several lines is part of the property it
    // belongs to, so a line inside one is read the same way as its first.
    const art = ART.includes(rel)
    let inProperty = false
    source.split('\n').forEach((code, i) => {
      const at = `${rel}:${i + 1}`
      if (art) {
        if (/^\s*--[a-z0-9-]+\s*:/.test(code)) inProperty = true
        const names = inProperty
        if (code.trim().endsWith(';')) inProperty = false
        if (names) return
        if (HEX.test(code) || RGB.test(code) || LENGTH.test(code)) {
          note(at, 'raw value outside a custom property — an art file names values, it does not apply them')
        }
        return
      }
      if (HEX.test(code)) note(at, 'raw hex — use a --mds-* token')
      if (PALETTE.test(code)) note(at, 'palette swatch outside the brand file — use the --mds-* role it fills')
      if (RGB.test(code)) note(at, 'raw colour function — use a --mds-* token')
      // A prelude may carry a breakpoint and nothing else, so the lengths
      // are stripped one at a time and only the ones that are not a
      // breakpoint are left to report.
      const lengths = code.includes('@media')
        ? code.replace(new RegExp(BREAKPOINTS.map((b) => b.replace('.', '\\.')).join('|'), 'g'), '')
        : code
      if (LENGTH.test(lengths)) {
        note(at, code.includes('@media')
          ? `raw length in a @media prelude — break at one of ${BREAKPOINTS.join(', ')}`
          : 'raw length — use a --mds-space-* or --mds-radius-* rung')
      }
    })
  }
}

for (const rel of ART) {
  if (!existsSync(join(root, rel))) note(rel, 'named as an art file but not found — remove it from ART or restore it')
}

// ─── 6. Every custom property an app sheet reads is declared somewhere ──
// The two packages declare theirs, the brand file re-points them, and the app
// declares its own alongside. A name in none of those resolves to nothing, and
// CSS drops the declaration without a word.
const DECLARES = /(--[a-z0-9-]+)\s*:/g
const READS = /var\(\s*(--[a-z0-9-]+)/g

function declarationsIn(text) {
  return [...text.matchAll(DECLARES)].map((m) => m[1])
}

const tokensSrc = require.resolve('@mond-design-system/tokens/styles.css').replace(/styles\.css$/, '')
const appCss = CSS_ROOTS.flatMap((cssRoot) => {
  const dir = join(root, cssRoot)
  return existsSync(dir) ? walk(dir) : []
})

const knownProperties = new Set([
  ...walk(tokensSrc).flatMap((f) => declarationsIn(readFileSync(f, 'utf8'))),
  ...declarationsIn(readFileSync(require.resolve('@mond-design-system/react/styles.css'), 'utf8')),
  ...appCss.flatMap((f) => declarationsIn(readFileSync(f, 'utf8'))),
])

for (const file of appCss) {
  const rel = relative(root, file)
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .split('\n')
    .forEach((code, i) => {
      for (const [, name] of code.matchAll(READS)) {
        if (!knownProperties.has(name)) {
          note(`${rel}:${i + 1}`, `var(${name}) resolves to nothing — no package or app stylesheet declares it`)
        }
      }
    })
}

if (problems.length) {
  console.error(`\n✖ ${problems.length} token problem(s)\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}

console.log(`tokens:   ${template.colour.length} re-declared, 0 geometry, ${contract.contrast.length} contrast pairs hold in both themes, 0 raw values`)
console.log('          index.html pre-paints --mds-surface-page')
console.log(`          @media may break at ${BREAKPOINTS.join(', ')}`)
console.log(`          ${palette(light).length} palette swatches, read only by the brand file`)
console.log(`          ${ART.length} art file(s) exempted`)
console.log(`          ${knownProperties.size} custom properties declared, every var() reference resolves`)
