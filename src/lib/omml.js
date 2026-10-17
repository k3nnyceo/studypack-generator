// Office Math (OMML), the XML PowerPoint and Word use for equations, to LaTeX
// for KaTeX. Covers the structures lecture slides use: fractions, scripts,
// roots, sums and integrals, brackets, functions, accents, matrices and
// equation arrays. Anything unknown falls back to its contents.

export const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

const NARY = { '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge' }
const ACCENTS = { '̂': '\\hat', '̃': '\\tilde', '̇': '\\dot', '̈': '\\ddot', '⃗': '\\vec', '̄': '\\bar', '̅': '\\bar', '̌': '\\check', '́': '\\acute', '̀': '\\grave', '̆': '\\breve' }
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'deg', 'dim', 'gcd', 'arg', 'ker', 'Pr'])
const ESCAPES = { '\\': '\\backslash ', '{': '\\{', '}': '\\}', '#': '\\#', '%': '\\%', '&': '\\&', _: '\\_', $: '\\$', '~': '\\sim ', '^': '\\wedge ' }
const DELIMS = { '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle' }

const kids = (node) => Array.from(node?.children ?? []).filter((c) => c.namespaceURI === NS_M)
const child = (node, name) => kids(node).find((c) => c.localName === name)
const prop = (node, prName, name) => child(child(node, prName), name)?.getAttributeNS(NS_M, 'val') ?? child(child(node, prName), name)?.getAttribute('m:val')
const arg = (node, name) => group(convertChildren(child(node, name)))
const group = (tex) => `{${tex}}`

export function ommlToLatex(node) {
  if (node.localName === 'oMathPara') {
    const lines = kids(node).filter((c) => c.localName === 'oMath').map(convertChildren)
    return lines.length > 1 ? `\\begin{gathered}${lines.join('\\\\')}\\end{gathered}` : (lines[0] ?? '')
  }
  return convertChildren(node).trim()
}

function convertChildren(node) {
  return node ? kids(node).map(convert).join('') : ''
}

function convert(node) {
  switch (node.localName) {
    case 'r':
      return run(node)
    case 'f': {
      const type = prop(node, 'fPr', 'type')
      if (type === 'lin') return `${arg(node, 'num')}/${arg(node, 'den')}`
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}${arg(node, 'num')}${arg(node, 'den')}`
      return `\\frac${arg(node, 'num')}${arg(node, 'den')}`
    }
    case 'sSup':
      return `${arg(node, 'e')}^${arg(node, 'sup')}`
    case 'sSub':
      return `${arg(node, 'e')}_${arg(node, 'sub')}`
    case 'sSubSup':
      return `${arg(node, 'e')}_${arg(node, 'sub')}^${arg(node, 'sup')}`
    case 'sPre':
      return `{}_${arg(node, 'sub')}^${arg(node, 'sup')}${arg(node, 'e')}`
    case 'rad': {
      const hideDegree = prop(node, 'radPr', 'degHide')
      const degree = convertChildren(child(node, 'deg'))
      return hideDegree === '1' || hideDegree === 'on' || !degree ? `\\sqrt${arg(node, 'e')}` : `\\sqrt[${degree}]${arg(node, 'e')}`
    }
    case 'nary': {
      const chr = prop(node, 'naryPr', 'chr') ?? '∫'
      const op = NARY[chr] ?? chr
      const sub = convertChildren(child(node, 'sub'))
      const sup = convertChildren(child(node, 'sup'))
      return `${op}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''}${arg(node, 'e')}`
    }
    case 'd': {
      const open = prop(node, 'dPr', 'begChr') ?? '('
      const close = prop(node, 'dPr', 'endChr') ?? ')'
      const sep = prop(node, 'dPr', 'sepChr') ?? '|'
      const parts = kids(node).filter((c) => c.localName === 'e').map(convertChildren)
      return `\\left${delim(open)}${parts.join(sep === '|' ? '\\mid ' : delim(sep))}\\right${delim(close)}`
    }
    case 'func': {
      const name = convertChildren(child(node, 'fName')).trim()
      const plain = name.replace(/\\mathrm\{(\w+)\}/, '$1')
      const op = FUNCTIONS.has(plain) ? `\\${plain}` : /^\w+$/.test(plain) ? `\\operatorname{${plain}}` : name
      return `${op}${arg(node, 'e')}`
    }
    case 'limLow': {
      const base = convertChildren(child(node, 'e')).trim()
      const op = FUNCTIONS.has(base.replace(/\\mathrm\{(\w+)\}/, '$1')) ? `\\${base.replace(/\\mathrm\{(\w+)\}/, '$1')}` : group(base)
      return `${op}_${arg(node, 'lim')}`
    }
    case 'limUpp':
      return `\\overset${arg(node, 'lim')}${arg(node, 'e')}`
    case 'acc': {
      const chr = prop(node, 'accPr', 'chr') ?? '̂'
      return `${ACCENTS[chr] ?? '\\hat'}${arg(node, 'e')}`
    }
    case 'bar':
      return `${prop(node, 'barPr', 'pos') === 'bot' ? '\\underline' : '\\overline'}${arg(node, 'e')}`
    case 'groupChr': {
      const chr = prop(node, 'groupChrPr', 'chr') ?? '⏟'
      return `${chr === '⏞' ? '\\overbrace' : '\\underbrace'}${arg(node, 'e')}`
    }
    case 'borderBox':
      return `\\boxed${arg(node, 'e')}`
    case 'box':
    case 'phant':
      return arg(node, 'e')
    case 'm': {
      const rows = kids(node)
        .filter((c) => c.localName === 'mr')
        .map((row) => kids(row).filter((c) => c.localName === 'e').map(convertChildren).join(' & '))
      return `\\begin{matrix}${rows.join('\\\\')}\\end{matrix}`
    }
    case 'eqArr': {
      const rows = kids(node).filter((c) => c.localName === 'e').map(convertChildren)
      return `\\begin{aligned}${rows.join('\\\\')}\\end{aligned}`
    }
    case 'oMath':
    case 'e':
      return convertChildren(node)
    default:
      // Property elements (rPr, fPr, ctrlPr…) carry no content.
      return node.localName.endsWith('Pr') ? '' : convertChildren(node)
  }
}

// A run of text. Upright multi-letter words ("max", "kN") stay upright.
function run(node) {
  const raw = kids(node)
    .filter((c) => c.localName === 't')
    .map((t) => t.textContent)
    .join('')
  if (!raw) return ''
  // Words written inside an equation ("Specific weight, γ = …") keep their spaces.
  if (/\p{L}{2,}\s+\p{L}/u.test(raw) && /^[\p{L}\p{N}\s,.;:()'/=+-]+$/u.test(raw)) {
    const words = plainMath(raw)
    if (!words.includes('\\')) return `\\text{${words}}`
  }
  const text = plainMath(raw.replace(/[\\{}#%&_$~^]/g, (c) => ESCAPES[c]))
  const style = prop(node, 'rPr', 'sty')
  if ((style === 'p' || style === 'b') && /^[A-Za-z ]{2,}$/.test(text)) return `\\mathrm{${text}}`
  return text
}

// Office writes maths letters as Unicode mathematical alphanumerics ("𝑧",
// "𝜌"), which KaTeX can't read; they become plain letters (italic is the
// default in maths anyway). A few symbols KaTeX lacks get their commands.
const GREEK = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇αβγδεζηθικλμνξοπρςστυφχψω∂ϵϑϰϕϱϖ'
const SYMBOLS = { '∆': '\\Delta ', 'ℎ': 'h', 'ℏ': '\\hbar ', '−': '-', '∙': '\\cdot ', '⋅': '\\cdot ', '′': "'", '″': "''", '…': '\\ldots ', '⋯': '\\cdots ' }

export function plainMath(text) {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp >= 0x1d400 && cp <= 0x1d6a3) {
      const i = (cp - 0x1d400) % 52
      out += String.fromCharCode(i < 26 ? 65 + i : 97 + i - 26)
    } else if (cp >= 0x1d6a8 && cp <= 0x1d7c9) {
      out += [...GREEK][(cp - 0x1d6a8) % 58]
    } else if (cp >= 0x1d7ce && cp <= 0x1d7ff) {
      out += String((cp - 0x1d7ce) % 10)
    } else {
      out += SYMBOLS[ch] ?? ch
    }
  }
  return out
}

function delim(chr) {
  if (chr === '') return '.'
  return DELIMS[chr] ?? chr
}
