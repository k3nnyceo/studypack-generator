import { useEffect, useState } from 'react'
import { splitMath } from '../../lib/sourceBlocks.js'

// KaTeX and its stylesheet load on first use, so pages without maths (and
// the home page) don't pay for them.
let katex = null
let katexPromise = null
function loadKatex() {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
    katex = m.default
    return katex
  })
  return katexPromise
}

function useKatex(needed) {
  const [ready, setReady] = useState(Boolean(katex))
  useEffect(() => {
    if (!needed || katex) return
    let alive = true
    loadKatex().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [needed])
  return ready
}

const texCache = new Map()
function renderTex(tex, display) {
  const key = `${display ? 'D' : 'I'}${tex}`
  if (!texCache.has(key)) {
    texCache.set(key, katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, output: 'htmlAndMathml' }))
  }
  return texCache.get(key)
}

export function Tex({ tex, display = false }) {
  const ready = useKatex(true)
  if (!ready) return <code className="font-mono text-[0.9em] text-stone-600">{tex}</code>
  return (
    <span
      className={display ? 'block overflow-x-auto overflow-y-hidden py-1 text-center' : 'inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle'}
      // KaTeX's own output (trust is off, so \href and the like are inert).
      dangerouslySetInnerHTML={{ __html: renderTex(tex, display) }}
    />
  )
}

// Text with inline maths, and every occurrence of `query` marked. The marks
// carry data-hit so the viewer can step through them in order.
export function Rich({ text, query }) {
  if (!text) return null
  return splitMath(text).map((part, i) =>
    part.tex !== undefined ? <Tex key={i} tex={part.tex} display={part.display} /> : <Highlight key={i} text={part.text} query={query} />,
  )
}

function Highlight({ text, query }) {
  if (!query) return text
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const out = []
  let last = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <mark key={at} data-hit="" className="rounded-sm bg-amber-200 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    )
    last = at + needle.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// One slide or page's blocks (src/lib/sourceBlocks.js). `renderImage` draws
// pictures; without it they're left out.
export function Blocks({ blocks, query, renderImage }) {
  return (
    <div className="space-y-3 text-[0.9375rem] leading-relaxed text-stone-700">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = block.level === 1 ? 'h3' : 'h4'
            return (
              <Tag key={i} className={`font-semibold text-stone-900 ${block.level === 1 ? 'text-lg' : 'text-base'}`}>
                <Rich text={block.text} query={query} />
              </Tag>
            )
          }
          case 'paragraph':
            return (
              <p key={i} className="whitespace-pre-line">
                <Rich text={block.text} query={query} />
              </p>
            )
          case 'list':
            return <List key={i} block={block} query={query} />
          case 'table':
            return <Table key={i} block={block} query={query} />
          case 'math':
            return <Tex key={i} tex={block.tex} display />
          case 'image':
            return renderImage ? <div key={i}>{renderImage(block)}</div> : null
          default:
            return null
        }
      })}
    </div>
  )
}

// Flat items with levels -> nested lists, so indents read as structure.
function nest(items) {
  const root = { children: [] }
  const stack = [{ level: -1, node: root }]
  for (const item of items) {
    while (stack.length > 1 && stack.at(-1).level >= item.level) stack.pop()
    const node = { text: item.text, children: [] }
    stack.at(-1).node.children.push(node)
    stack.push({ level: item.level, node })
  }
  return root.children
}

const MARKERS = { ul: ['list-disc', 'list-[circle]', 'list-[square]'], ol: ['list-decimal', 'list-[lower-alpha]', 'list-[lower-roman]'] }

function List({ block, query }) {
  return <NestedList nodes={nest(block.items)} ordered={block.ordered} depth={0} query={query} />
}

function NestedList({ nodes, ordered, depth, query }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={`space-y-1 pl-5 marker:text-stone-400 ${MARKERS[Tag][Math.min(depth, 2)]} ${depth ? 'mt-1' : ''}`}>
      {nodes.map((node, i) => (
        <li key={i}>
          <Rich text={node.text} query={query} />
          {node.children.length > 0 && <NestedList nodes={node.children} ordered={ordered} depth={depth + 1} query={query} />}
        </li>
      ))}
    </Tag>
  )
}

function Table({ block, query }) {
  const [head, ...rest] = block.rows
  const body = block.header ? rest : block.rows
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
      <table className="w-full border-collapse text-left text-sm">
        {block.header && head && (
          <thead className="bg-stone-50">
            <tr>
              {head.map((cell, i) => (
                <th key={i} colSpan={cell.span} scope="col" className="border-b border-stone-200 px-3 py-2 font-semibold whitespace-pre-line text-stone-900">
                  <Rich text={cell.text} query={query} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-stone-100">
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} colSpan={cell.span} className="px-3 py-2 align-top whitespace-pre-line">
                  <Rich text={cell.text} query={query} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
