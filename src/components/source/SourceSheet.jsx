import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  ImageOff,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  MonitorPlay,
  Plus,
  Presentation,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SHOWABLE_IMAGE } from '../../lib/parsePptx.js'
import { blocksOf, countMatches, sectionStrings, shownTitle } from '../../lib/sourceBlocks.js'
import { unitOf } from '../../lib/sourceRefs.js'
import { Blocks, Rich } from './Blocks.jsx'
import { createUrlStore } from './objectUrls.js'
import './sourceSheet.css'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const TEXT_WIDTH = 720 // px, the reading width of the text view at 100%
const PAGE_WIDTH = 900 // px, the widest a page is drawn at 100%
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))

// The source viewer: the lecture slide by slide (or page by page), as a side
// drawer on wide screens and a bottom sheet on phones, with thumbnails, search
// and previous/next. PDFs are drawn with pdf.js (a canvas plus a selectable
// text layer); PowerPoints, pasted, scanned and video notes show their
// extracted structure, with the slides' own pictures. Everything is read from
// the file on this device, and freed when the viewer closes.
//
// `target` ({ refs, nonce }) names the slides or pages to show: the viewer
// scrolls to the first and highlights them all.
export default function SourceSheet({ source, target, onClose }) {
  const canShowPages = Boolean((source.file && source.type === 'pdf') || source.photos?.length)
  const [mode, setMode] = useState(canShowPages ? 'pages' : 'text')
  const drawer = useMediaQuery(DRAWER_QUERY)
  const [expanded, setExpanded] = useState(false)
  const [showThumbs, setShowThumbs] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 200)
  const [hitIndex, setHitIndex] = useState(0)
  const [current, setCurrent] = useState(target?.refs?.[0] ?? null)
  const [dragY, setDragY] = useState(0)
  const [width, setWidth] = useState(0)
  const scroller = useRef(null)
  const content = useRef(null)
  const sheet = useRef(null)
  const unit = unitOf(source)
  const highlighted = useMemo(() => new Set(target?.refs ?? []), [target])

  const pdf = usePdf(canShowPages && source.type === 'pdf' ? source.file : null)
  const urls = useMemo(() => createUrlStore(), [])
  useEffect(() => () => urls.dispose(), [urls])
  const zip = useZip(source.type === 'pptx' ? source.file : null)

  const close = useHistoryEntry(onClose)
  useSheetFocus(sheet, close)

  // The scroll area's width, so pages and text fit it.
  useLayoutEffect(() => {
    const el = scroller.current
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // What's listed: every page of the PDF (or every photo), or the extracted sections.
  const items = useMemo(() => {
    if (mode === 'pages' && source.type === 'pdf') {
      return pdf.sizes ? pdf.sizes.map((size, i) => ({ index: i + 1, size })) : []
    }
    if (mode === 'pages') return source.photos.map((photo, i) => ({ index: i + 1, photo }))
    return source.sections.map((section) => {
      const blocks = blocksOf(section)
      const label = labelFor(source, section.index)
      return { index: section.index, section, blocks, label, title: shownTitle(section, blocks, label) }
    })
  }, [mode, source, pdf.sizes])
  const ready = width > 0 && (mode === 'text' || source.type !== 'pdf' || Boolean(pdf.sizes))

  const scrollToSection = useCallback((n, smooth = true) => {
    const box = scroller.current
    const all = [...box.querySelectorAll('[data-src]')]
    // The page itself, else the nearest one after it (unreadable scan pages
    // have no section).
    const el = all.find((e) => Number(e.dataset.src) === n) ?? all.find((e) => Number(e.dataset.src) > n) ?? all.at(-1)
    if (!el) return null
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8
    // Long jumps are instant: gliding past a hundred slides is slow, and
    // pictures loading on the way would move the target.
    const near = Math.abs(top - box.scrollTop) < box.clientHeight * 3
    box.scrollTo({ top, behavior: smooth && near && !reducedMotion() ? 'smooth' : 'auto' })
    return el
  }, [])

  // Open at the referenced slides; switching views, or a width change that
  // resizes every page (a scrollbar appearing, the drawer widening, rotating
  // a phone), keeps your place.
  const place = useRef(target?.refs?.[0] ?? null)
  useLayoutEffect(() => {
    if (ready && place.current !== null) scrollToSection(place.current, false)
  }, [ready, mode, width, scrollToSection])

  // Which section is at the top, for "Slide 4 of 20".
  const wanted = useRef(null)
  const scrolledByHand = () => (wanted.current = null)
  const onScroll = useRafCallback(() => {
    const box = scroller.current
    const top = box.getBoundingClientRect().top + box.clientHeight * 0.3
    let at = null
    for (const el of box.querySelectorAll('[data-src]')) {
      if (el.getBoundingClientRect().top > top) break
      at = Number(el.dataset.src)
    }
    at ??= Number(box.querySelector('[data-src]')?.dataset.src) || null
    // A page picked with a thumbnail or Next stays current while it's on
    // screen (the last pages can't scroll up to the top), until you scroll.
    if (wanted.current !== null) {
      const el = box.querySelector(`[data-src="${wanted.current}"]`)
      const r = el?.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      if (r && r.top < b.bottom && r.bottom > b.top) at = wanted.current
    }
    place.current = at
    setCurrent(at)
  })

  // Search: count matches per section (the same text the marks are drawn
  // on), then step through them in order.
  const pageTexts = usePageTexts(pdf.doc, mode === 'pages' && source.type === 'pdf' && q.length > 0)
  const counts = useMemo(() => {
    if (!q) return []
    if (mode === 'pages') {
      if (source.type !== 'pdf') return []
      return items.map(({ index }) => [index, (pageTexts.get(index) ?? []).reduce((n, s) => n + countPlain(s, q), 0)])
    }
    return items.map((it) => [it.index, sectionStrings(it.title, it.blocks, it.section.notes).reduce((n, s) => n + countMatches(s, q), 0)])
  }, [q, mode, items, pageTexts, source.type])
  const hits = useMemo(() => counts.flatMap(([index, n]) => Array.from({ length: n }, (_, j) => ({ index, j }))), [counts])
  const searching = mode === 'pages' && source.type === 'pdf' && q && pdf.doc && pageTexts.size < (pdf.sizes?.length ?? 0)
  const textHasHits = useMemo(
    () =>
      mode === 'pages' &&
      q &&
      source.sections.some((s) => sectionStrings(s.title, blocksOf(s), s.notes).some((str) => countMatches(str, q) > 0)),
    [mode, q, source.sections],
  )

  const goToHit = useCallback(
    (k) => {
      const hit = hits[k]
      if (!hit) return
      setHitIndex(k)
      const el = scrollToSection(hit.index, false)
      if (!el) return
      // Pages draw (and get their marks) as they come into view.
      let tries = 0
      const find = () => {
        const marks = el.querySelectorAll('mark[data-hit]')
        if (marks.length > hit.j) {
          scroller.current.querySelectorAll('mark[data-current]').forEach((m) => m.removeAttribute('data-current'))
          marks[hit.j].setAttribute('data-current', '')
          marks[hit.j].scrollIntoView({ block: 'center', inline: 'nearest' })
        } else if (++tries < 120) requestAnimationFrame(find)
      }
      requestAnimationFrame(find)
    },
    [hits, scrollToSection],
  )

  // A new search jumps to its first match.
  const searchedFor = useRef('')
  useEffect(() => {
    const key = `${q}|${mode}`
    if (!q || hits.length === 0 || searchedFor.current === key) return
    searchedFor.current = key
    goToHit(0)
  }, [q, mode, hits, goToHit])

  // Zoom keeps the point under the fingers (or the middle of the view) still.
  const pendingAnchor = useRef(null)
  const zoomTo = useCallback(
    (next, anchor) => {
      const box = scroller.current
      setZoom((z) => {
        const target = clampZoom(typeof next === 'function' ? next(z) : next)
        if (target !== z) {
          const ax = anchor?.x ?? box.clientWidth / 2
          const ay = anchor?.y ?? box.clientHeight / 2
          pendingAnchor.current = { ratio: target / z, ax, ay, left: box.scrollLeft, top: box.scrollTop }
        }
        return target
      })
    },
    [],
  )
  useLayoutEffect(() => {
    const a = pendingAnchor.current
    if (!a) return
    pendingAnchor.current = null
    const box = scroller.current
    box.scrollLeft = (a.left + a.ax) * a.ratio - a.ax
    box.scrollTop = (a.top + a.ay) * a.ratio - a.ay
  }, [zoom])
  usePinchZoom(scroller, content, zoom, zoomTo)

  const fitWidth = Math.max(0, width - 24)
  const pageWidth = Math.round(Math.min(fitWidth, PAGE_WIDTH) * zoom)
  const textWidth = Math.min(fitWidth, TEXT_WIDTH * zoom)

  // Drag the handle down to shrink or close, up to expand.
  const drag = useRef(null)
  const onDragStart = (e) => {
    if (drawer || e.target.closest('button, input')) return
    drag.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDragMove = (e) => {
    if (!drag.current) return
    drag.current.dy = e.clientY - drag.current.y
    setDragY(Math.max(-40, drag.current.dy))
  }
  const onDragEnd = () => {
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    setDragY(0)
    if (dy > 110) {
      if (expanded && dy < 260) setExpanded(false)
      else close()
    } else if (dy < -50) setExpanded(true)
  }

  const FileIcon = source.type === 'video' ? MonitorPlay : source.type === 'pptx' ? Presentation : FileText
  const total = mode === 'pages' ? items.length : lastIndex(source)
  const position =
    current === null ? '' : source.type === 'video' ? labelFor(source, current) : `${unit} ${current} of ${total}`

  // Previous / next: the neighbour of the page or slide at the top.
  const order = useMemo(() => items.map((it) => it.index), [items])
  const at = current === null ? -1 : order.findIndex((n) => n >= current)
  const goTo = (n) => {
    if (n === undefined) return
    wanted.current = n
    place.current = n
    setCurrent(n)
    scrollToSection(n)
  }
  const step = (delta) => goTo(order[at === -1 ? 0 : Math.min(order.length - 1, Math.max(0, at + delta))])
  const matchesBy = useMemo(() => new Map(counts.filter(([, n]) => n > 0)), [counts])

  const panelStyle = drawer
    ? { width: expanded ? 'min(calc(100vw - 2rem), 84rem)' : 'min(52rem, 60vw)', transition: 'width 260ms cubic-bezier(0.2,0.8,0.2,1)' }
    : {
        height: expanded ? 'calc(100dvh - 1rem)' : 'min(78dvh, calc(100dvh - 3rem))',
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? 'none' : 'height 260ms cubic-bezier(0.2,0.8,0.2,1), transform 200ms ease-out',
      }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className={`animate-sheet-fade absolute inset-0 ${drawer ? 'bg-stone-950/25' : 'bg-stone-950/40'}`}
        onClick={close}
        aria-hidden
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Source: ${source.fileName}`}
        tabIndex={-1}
        className={`source-viewer absolute flex flex-col overflow-hidden bg-stone-100 shadow-elevated outline-none ${
          drawer
            ? 'animate-drawer-in inset-y-0 right-0 rounded-l-3xl'
            : 'animate-sheet-up inset-x-0 bottom-0 mx-auto max-w-4xl rounded-t-3xl'
        }`}
        style={panelStyle}
      >
        {/* Header: drag handle (sheet only), file, actions */}
        <div
          className={`shrink-0 border-b border-stone-200 bg-white select-none ${drawer ? 'pt-3' : 'touch-none'}`}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {!drawer && (
            <div className="flex justify-center pt-2 pb-1" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-stone-300" />
            </div>
          )}
          <div className="flex items-center gap-2 px-4 pb-2 sm:gap-3">
            <FileIcon className="size-5 shrink-0 text-brand-600 max-sm:hidden" strokeWidth={2} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-900">{source.fileName}</p>
              <p className="text-xs text-stone-500 tabular-nums" aria-live="polite">
                {position}
              </p>
            </div>
            <div className="flex items-center" role="group" aria-label={`Previous or next ${unit.toLowerCase()}`}>
              <IconButton label={`Previous ${unit.toLowerCase()}`} icon={ChevronLeft} onClick={() => step(-1)} disabled={at <= 0} />
              <IconButton
                label={`Next ${unit.toLowerCase()}`}
                icon={ChevronRight}
                onClick={() => step(1)}
                disabled={!order.length || (at !== -1 && at >= order.length - 1)}
              />
            </div>
            <IconButton
              label={searchOpen ? 'Close search' : 'Search'}
              icon={Search}
              pressed={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen)
                if (searchOpen) setQuery('')
              }}
            />
            <IconButton
              label={expanded ? 'Shrink' : 'Expand'}
              icon={expanded ? Minimize2 : Maximize2}
              onClick={() => setExpanded(!expanded)}
              className="max-sm:hidden"
            />
            <IconButton label="Close" icon={X} onClick={close} />
          </div>

          {searchOpen && (
            <SearchBar
              query={query}
              onQuery={(value) => {
                setQuery(value)
                setHitIndex(0)
              }}
              count={hits.length}
              index={hitIndex}
              searching={Boolean(searching)}
              hint={q && !hits.length && !searching && textHasHits ? 'Not on the pages. Try the Text view.' : null}
              onStep={(step) => hits.length && goToHit((hitIndex + step + hits.length) % hits.length)}
              onClose={() => {
                setSearchOpen(false)
                setQuery('')
              }}
            />
          )}

          <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
            <div className="flex items-center gap-1.5">
              <IconButton
                label={showThumbs ? 'Hide thumbnails' : 'Show thumbnails'}
                icon={LayoutGrid}
                small
                pressed={showThumbs}
                onClick={() => setShowThumbs(!showThumbs)}
              />
              {canShowPages ? (
                <div className="inline-flex rounded-lg bg-stone-100 p-0.5 text-xs" role="radiogroup" aria-label="View">
                  {[
                    ['pages', 'Pages'],
                    ['text', 'Text'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      onClick={() => {
                        searchedFor.current = ''
                        setMode(value)
                      }}
                      className={`rounded-md px-3 py-1.5 font-semibold transition ${
                        mode === value ? 'bg-white text-stone-900 shadow-card' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
            ) : null}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <IconButton label="Zoom out" icon={Minus} small onClick={() => zoomTo((z) => z / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} />
              <button
                type="button"
                onClick={() => zoomTo(1)}
                className="h-8 min-w-14 rounded-lg px-1.5 text-xs font-semibold text-stone-700 tabular-nums hover:bg-stone-100"
                aria-label={`Zoom ${Math.round(zoom * 100)}%. Reset to 100%`}
              >
                {Math.round(zoom * 100)}%
              </button>
              <IconButton label="Zoom in" icon={Plus} small onClick={() => zoomTo((z) => z * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} />
            </div>
          </div>
        </div>

        {/* Thumbnails (a rail beside the pages in the drawer, a strip above them
            in the sheet), then the pages or sections. */}
        <div className={`flex min-h-0 flex-1 ${drawer ? 'flex-row' : 'flex-col'}`}>
          {showThumbs && items.length > 0 && (
            <Thumbnails
              items={items}
              mode={mode}
              source={source}
              pdf={pdf}
              zip={zip}
              urls={urls}
              current={current}
              highlighted={highlighted}
              matches={matchesBy}
              vertical={drawer}
              onPick={goTo}
            />
          )}
          <div
            ref={scroller}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
            style={{ touchAction: 'pan-x pan-y' }}
            onTouchStart={scrolledByHand}
            onKeyDown={scrolledByHand}
            onWheel={(e) => {
              scrolledByHand()
              if (!e.ctrlKey) return
              e.preventDefault()
              const box = scroller.current.getBoundingClientRect()
              zoomTo((z) => z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - box.left, y: e.clientY - box.top })
            }}
          >
            <div ref={content} className="min-w-full p-3 pb-10" style={{ width: mode === 'pages' ? pageWidth + 24 : undefined }}>
              {pdf.error && mode === 'pages' && (
                <p className="mx-auto max-w-md rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
                  This PDF couldn’t be drawn. The Text view still shows what was read from it.
                </p>
              )}
              {mode === 'pages' && !ready && !pdf.error && <PageSkeleton />}
  
              {mode === 'pages' && source.type === 'pdf' && pdf.doc && (
                <div className="space-y-4">
                  {items.map(({ index, size }) => (
                    <PageFrame key={index} index={index} label={`Page ${index}`} highlighted={highlighted.has(index)} width={pageWidth}>
                      <PdfPage doc={pdf.doc} n={index} size={size} width={pageWidth} query={q} getText={pdf.getText} root={scroller} />
                    </PageFrame>
                  ))}
                </div>
              )}
  
              {mode === 'pages' && source.photos && (
                <div className="space-y-4">
                  {items.map(({ index, photo }) => (
                    <PageFrame key={index} index={index} label={`Page ${index}`} highlighted={highlighted.has(index)} width={pageWidth}>
                      <LazyImage
                        root={scroller}
                        urls={urls}
                        urlKey={`photo:${index}`}
                        getBlob={() => photo}
                        alt={`Page ${index} of your notes`}
                        className="rounded-lg bg-white shadow-card"
                      />
                    </PageFrame>
                  ))}
                </div>
              )}
  
              {mode === 'text' && (
                <div className="mx-auto space-y-3" style={{ width: textWidth / zoom, zoom }}>
                  {items.map((it) => (
                    <TextSection
                      key={it.index}
                      item={it}
                      query={q}
                      highlighted={highlighted.has(it.index)}
                      renderImage={(block) => <SlideImage block={block} zip={zip} urls={urls} root={scroller} />}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Wide screens get the side drawer; phones and small tablets the bottom sheet.
const DRAWER_QUERY = '(min-width: 1024px)'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// ——— Thumbnails ———

const THUMB_W = 92 // px, in the drawer's rail
const THUMB_H = 64 // px, in the sheet's strip

// One small preview per page or slide; the current one is outlined and kept in
// view, the ones the viewer was opened at carry a dot, and pages with search
// matches show how many. Thumbnails draw only while near the visible part of
// the rail, like the pages themselves.
function Thumbnails({ items, mode, source, pdf, zip, urls, current, highlighted, matches, vertical, onPick }) {
  const rail = useRef(null)
  const unit = mode === 'pages' ? 'Page' : unitOf(source)

  useEffect(() => {
    const box = rail.current
    const el = box?.querySelector(`[data-thumb="${current}"]`)
    if (!el) return
    // Scroll only the rail (scrollIntoView would also move the panel).
    if (vertical) {
      const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2
      box.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' })
    } else {
      const left = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2
      box.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' })
    }
  }, [current, vertical])

  return (
    <nav
      ref={rail}
      aria-label={`${unit}s`}
      className={`shrink-0 overscroll-contain bg-white/70 ${
        vertical
          ? 'flex w-[124px] flex-col gap-3 overflow-y-auto border-r border-stone-200 px-3 py-3'
          : 'flex gap-2 overflow-x-auto border-b border-stone-200 px-3 py-2'
      }`}
    >
      {items.map((it) => {
        const n = it.index
        const aspect = thumbAspect(it, mode, source)
        const width = vertical ? THUMB_W : Math.round(THUMB_H * aspect)
        const height = vertical ? Math.round(THUMB_W / aspect) : THUMB_H
        const hits = matches.get(n)
        const isCurrent = current === n
        return (
          <button
            key={n}
            type="button"
            data-thumb={n}
            onClick={() => onPick(n)}
            aria-label={`${unit} ${n}${it.title ? `: ${it.title}` : ''}${hits ? `, ${hits} matches` : ''}`}
            aria-current={isCurrent ? 'true' : undefined}
            className="group relative flex shrink-0 flex-col items-center gap-1 rounded-lg outline-none"
          >
            <span
              className={`relative block overflow-hidden rounded-md bg-white ring-1 transition ${
                isCurrent ? 'ring-2 ring-brand-500' : 'ring-stone-200 group-hover:ring-stone-400'
              } group-focus-visible:ring-2 group-focus-visible:ring-brand-500`}
              style={{ width, height }}
            >
              <ThumbContent item={it} mode={mode} source={source} pdf={pdf} zip={zip} urls={urls} width={width} root={rail} />
              {hits > 0 && (
                <span className="absolute top-1 right-1 rounded-full bg-amber-400 px-1.5 text-[10px] leading-4 font-bold text-amber-950 tabular-nums">
                  {hits}
                </span>
              )}
            </span>
            <span
              className={`flex items-center gap-1 text-[11px] leading-none font-semibold tabular-nums ${
                isCurrent ? 'text-brand-700' : 'text-stone-500'
              }`}
            >
              {highlighted.has(n) && <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />}
              {n}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function thumbAspect(item, mode, source) {
  if (mode === 'pages' && item.size) return item.size.width / item.size.height
  if (mode === 'pages') return 3 / 4 // photos
  return source.type === 'pptx' ? 4 / 3 : 3 / 4
}

function ThumbContent({ item, mode, source, pdf, zip, urls, width, root }) {
  if (mode === 'pages' && source.type === 'pdf') {
    return pdf.doc ? <PdfThumb doc={pdf.doc} n={item.index} size={item.size} width={width} root={root} /> : null
  }
  if (mode === 'pages') {
    return (
      <LazyImage
        root={root}
        urls={urls}
        urlKey={`photo:${item.index}`}
        getBlob={() => item.photo}
        alt=""
        fill
        className="object-cover"
      />
    )
  }
  // Text view: the slide's first picture if it has one, else its title.
  const picture = item.blocks.find((b) => b.type === 'image' && SHOWABLE_IMAGE(b.mime))
  if (picture && zip) {
    return (
      <LazyImage
        root={root}
        urls={urls}
        urlKey={picture.path}
        getBlob={async () => new Blob([await zip.file(picture.path).async('arraybuffer')], { type: picture.mime })}
        alt=""
        fill
        className="object-cover"
      />
    )
  }
  return (
    <span className="line-clamp-4 block p-1.5 text-left text-[9px] leading-tight font-semibold text-stone-600">
      {item.title || item.section.text.slice(0, 80)}
    </span>
  )
}

// A page drawn small, only while near the visible part of the rail.
function PdfThumb({ doc, n, size, width, root }) {
  const holder = useRef(null)
  const near = useNear(holder, root, '200px')
  useEffect(() => {
    const el = holder.current
    if (!near) {
      for (const canvas of el.querySelectorAll('canvas')) canvas.width = 0
      el.replaceChildren()
      return
    }
    let alive = true
    let task = null
    ;(async () => {
      const page = await doc.getPage(n)
      if (!alive) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: (width / size.width) * ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.className = 'size-full'
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
      await task.promise
      if (!alive) return void (canvas.width = 0)
      el.replaceChildren(canvas)
    })().catch(() => {})
    return () => {
      alive = false
      task?.cancel()
    }
  }, [near, doc, n, size, width])
  useEffect(
    () => () => {
      for (const canvas of holder.current?.querySelectorAll('canvas') ?? []) canvas.width = 0
    },
    [],
  )
  return <span ref={holder} className="block size-full" aria-hidden />
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const lastIndex = (source) => source.sections.at(-1)?.index ?? source.sections.length
const labelFor = (source, index) =>
  source.type === 'video' ? (source.sections.find((s) => s.index === index)?.title ?? `Section ${index}`) : `${unitOf(source)} ${index}`

function countPlain(text, query) {
  if (!text) return 0
  const hay = text.toLowerCase()
  const needle = query.toLowerCase()
  let n = 0
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) n++
  return n
}

function IconButton({ label, icon: Icon, onClick, pressed, small, disabled, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`flex shrink-0 items-center justify-center rounded-lg text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40 aria-pressed:bg-brand-50 aria-pressed:text-brand-700 ${
        small ? 'size-8' : 'size-10'
      } ${className}`}
    >
      <Icon className="size-[18px]" strokeWidth={2.25} aria-hidden />
    </button>
  )
}

function SearchBar({ query, onQuery, count, index, searching, hint, onStep, onClose }) {
  const input = useRef(null)
  useEffect(() => input.current?.focus(), [])
  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-1 rounded-xl bg-stone-100 pr-1 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-400">
        <Search className="ml-3 size-4 shrink-0 text-stone-400" aria-hidden />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onStep(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          placeholder="Search the lecture"
          aria-label="Search the lecture"
          enterKeyHint="search"
          className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-stone-400 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="shrink-0 px-1 text-xs text-stone-500 tabular-nums" role="status">
          {query.trim() ? (searching ? 'Searching…' : count ? `${index + 1} of ${count}` : 'No matches') : ''}
        </span>
        <IconButton label="Previous match" icon={ChevronUp} small onClick={() => onStep(-1)} disabled={!count} />
        <IconButton label="Next match" icon={ChevronDown} small onClick={() => onStep(1)} disabled={!count} />
      </div>
      {hint && <p className="mt-1.5 px-1 text-xs text-stone-500">{hint}</p>}
    </div>
  )
}

function PageFrame({ index, label, highlighted, width, children }) {
  return (
    <section data-src={index} aria-label={label} className="mx-auto scroll-mt-2" style={{ width }}>
      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-stone-500">
        {label}
        {highlighted && <SourceBadge />}
      </p>
      <div className={`rounded-lg transition ${highlighted ? 'source-flash ring-4 ring-brand-400/80' : ''}`}>{children}</div>
    </section>
  )
}

function SourceBadge() {
  return <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">Source</span>
}

function TextSection({ item, query, highlighted, renderImage }) {
  const { index, section, blocks, label, title } = item
  return (
    <section
      data-src={index}
      aria-label={label}
      className={`rounded-2xl bg-white p-4 shadow-card ring-1 transition sm:p-5 ${
        highlighted ? 'source-flash ring-2 ring-brand-400' : 'ring-stone-200/80'
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600 tabular-nums">{label}</span>
        {highlighted && <SourceBadge />}
      </header>
      {title && (
        <h2 className="mb-3 text-lg leading-snug font-bold text-stone-900">
          <Rich text={title} query={query} />
        </h2>
      )}
      {blocks.length ? (
        <Blocks blocks={blocks} query={query} renderImage={renderImage} />
      ) : (
        <p className="text-sm text-stone-500 italic">No text here.</p>
      )}
      {section.notes && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-950 ring-1 ring-amber-200">
          <p className="mb-1 text-xs font-semibold tracking-[0.06em] text-amber-800 uppercase">Speaker notes</p>
          <p className="whitespace-pre-line">
            <Rich text={section.notes} query={query} />
          </p>
        </div>
      )}
    </section>
  )
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4" aria-label="Loading pages">
      {[0, 1].map((i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-stone-200/70" />
      ))}
    </div>
  )
}

// ——— PDF pages ———

// Opens the PDF with pdf.js while the Pages view is showing. Page sizes are
// read up front so every page's space is reserved before it's drawn, which
// keeps "scroll to page 14" accurate.
function usePdf(file) {
  const [state, setState] = useState({ doc: null, sizes: null, error: null })
  const texts = useRef(new Map())
  useEffect(() => {
    if (!file) return
    let alive = true
    let destroy = null
    texts.current = new Map()
    import('../../lib/pdfjs.js')
      .then(({ loadPdf }) => loadPdf(file))
      .then(async (pdf) => {
        destroy = pdf.destroy
        if (!alive) return destroy()
        const sizes = []
        for (let n = 1; n <= pdf.doc.numPages; n++) {
          const page = await pdf.doc.getPage(n)
          const { width, height } = page.getViewport({ scale: 1 })
          sizes.push({ width, height })
          if (!alive) return
        }
        setState({ doc: pdf.doc, sizes, error: null })
      })
      .catch((error) => alive && setState({ doc: null, sizes: null, error }))
    return () => {
      alive = false
      setState({ doc: null, sizes: null, error: null })
      destroy?.()
    }
  }, [file])

  const getText = useCallback(
    (n) => {
      if (!texts.current.has(n)) texts.current.set(n, state.doc.getPage(n).then((page) => page.getTextContent()))
      return texts.current.get(n)
    },
    [state.doc],
  )
  return { ...state, getText }
}

// Every page's text strings (as the text layer lays them out), read in the
// background once a search starts.
function usePageTexts(doc, active) {
  const [texts, setTexts] = useState(() => new Map())
  useEffect(() => setTexts(new Map()), [doc])
  useEffect(() => {
    if (!doc || !active) return
    let alive = true
    ;(async () => {
      const found = new Map(texts)
      for (let n = 1; n <= doc.numPages && alive; n++) {
        if (found.has(n)) continue
        const page = await doc.getPage(n)
        const content = await page.getTextContent()
        found.set(
          n,
          content.items.filter((it) => 'str' in it).map((it) => it.str),
        )
        if (alive && (n % 10 === 0 || n === doc.numPages)) setTexts(new Map(found))
      }
    })().catch(() => {})
    return () => {
      alive = false
    }
    // `texts` is read once as the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, active])
  return texts
}

// Phones run out of canvas memory fast: cap each page's pixels.
const MAX_CANVAS_PIXELS = 8_000_000

// One PDF page: drawn when it comes near the screen, freed when it's far
// away. The text layer on top makes the text selectable and searchable.
function PdfPage({ doc, n, size, width, query, getText, root }) {
  const frame = useRef(null)
  const holder = useRef(null)
  const layer = useRef(null)
  const [drawn, setDrawn] = useState(0)
  const near = useNear(frame, root, '120% 0px')
  const scale = width / size.width
  const height = Math.round(size.height * scale)

  useEffect(() => {
    if (!near) return
    let alive = true
    let task = null
    let textLayer = null
    ;(async () => {
      const { pdfjs } = await import('../../lib/pdfjs.js')
      const page = await doc.getPage(n)
      if (!alive) return
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)))
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.className = 'absolute inset-0 size-full'
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
      await task.promise
      if (!alive) return void (canvas.width = 0)

      const textDiv = document.createElement('div')
      textDiv.className = 'textLayer'
      textLayer = new pdfjs.TextLayer({ textContentSource: await getText(n), container: textDiv, viewport })
      await textLayer.render()
      if (!alive) return void (canvas.width = 0)

      // Swap in the new drawing only now, so zooming never flashes blank.
      for (const old of holder.current.querySelectorAll('canvas')) old.width = 0
      holder.current.replaceChildren(canvas, textDiv)
      layer.current = textLayer
      setDrawn((d) => d + 1)
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') console.warn(`Page ${n}:`, err)
    })
    return () => {
      alive = false
      task?.cancel()
      textLayer?.cancel()
    }
  }, [near, scale, doc, n, getText])

  // Far away: give the memory back.
  useEffect(() => {
    if (near) return
    const el = holder.current
    for (const canvas of el.querySelectorAll('canvas')) canvas.width = 0
    el.replaceChildren()
    layer.current = null
  }, [near])
  useEffect(
    () => () => {
      for (const canvas of holder.current?.querySelectorAll('canvas') ?? []) canvas.width = 0
    },
    [],
  )

  // Search marks inside the text layer's spans.
  useEffect(() => {
    const tl = layer.current
    if (!tl) return
    tl.textDivs.forEach((div, i) => markText(div, tl.textContentItemsStr[i] ?? '', query))
  }, [query, drawn])

  return (
    <div
      ref={frame}
      className="pdf-page relative overflow-hidden rounded-lg bg-white shadow-card"
      style={{ width, height, '--scale-factor': scale }}
    >
      <div ref={holder} className="absolute inset-0" />
    </div>
  )
}

function markText(div, text, query) {
  if (!query) {
    if (div.firstElementChild) div.textContent = text
    return
  }
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  let at = lower.indexOf(needle)
  if (at === -1) {
    if (div.firstElementChild) div.textContent = text
    return
  }
  const parts = []
  let last = 0
  for (; at !== -1; at = lower.indexOf(needle, at + needle.length)) {
    if (at > last) parts.push(text.slice(last, at))
    const mark = document.createElement('mark')
    mark.dataset.hit = ''
    mark.textContent = text.slice(at, at + needle.length)
    parts.push(mark)
    last = at + needle.length
  }
  if (last < text.length) parts.push(text.slice(last))
  div.replaceChildren(...parts)
}

// ——— Pictures ———

// The PowerPoint's zip, opened once for its pictures (ppt/media/…).
function useZip(file) {
  const [zip, setZip] = useState(null)
  useEffect(() => {
    if (!file) return
    let alive = true
    import('jszip')
      .then(({ default: JSZip }) => JSZip.loadAsync(file))
      .then((z) => alive && setZip(z))
      .catch((err) => console.warn('Couldn’t open the slides’ pictures:', err))
    return () => {
      alive = false
      setZip(null)
    }
  }, [file])
  return zip
}

function SlideImage({ block, zip, urls, root }) {
  const style = { aspectRatio: block.aspect ?? 4 / 3 }
  if (!SHOWABLE_IMAGE(block.mime)) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">
        <ImageOff className="size-4 shrink-0" aria-hidden />
        {block.alt ? `${block.alt} (a picture format browsers can’t show)` : 'A picture in a format browsers can’t show'}
      </p>
    )
  }
  if (!zip) return <div className="mx-auto max-h-96 max-w-full animate-pulse rounded-xl bg-stone-100" style={style} />
  return (
    <LazyImage
      root={root}
      urls={urls}
      urlKey={block.path}
      getBlob={async () => new Blob([await zip.file(block.path).async('arraybuffer')], { type: block.mime })}
      alt={block.alt || 'Picture from the slide'}
      aspect={block.aspect}
      className="mx-auto max-h-[28rem] rounded-xl bg-white object-contain ring-1 ring-stone-200"
    />
  )
}

// Loads its picture only when it's near the screen, and hands the object URL
// back when it's far away (createUrlStore revokes it once nobody needs it).
// `fill` makes it cover its box (thumbnails) instead of sizing to the picture.
function LazyImage({ root, urls, urlKey, getBlob, alt, aspect, fill = false, className }) {
  const box = useRef(null)
  const near = useNear(box, root, '150% 0px')
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [ratio, setRatio] = useState(aspect ?? null)

  useEffect(() => {
    if (!near) return
    let alive = true
    urls
      .acquire(urlKey, getBlob)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      setUrl(null)
      urls.release(urlKey)
    }
    // getBlob is recreated each render; urlKey identifies the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, urlKey, urls])

  return (
    <div
      ref={box}
      className={fill ? 'size-full' : 'w-full'}
      style={fill ? undefined : { aspectRatio: ratio ?? 3 / 4, maxHeight: aspect ? '28rem' : undefined }}
    >
      {failed ? (
        <p className="flex h-full items-center justify-center gap-2 text-xs text-stone-500">
          <ImageOff className="size-4" aria-hidden /> This picture couldn’t be opened
        </p>
      ) : url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => !aspect && setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          onError={() => setFailed(true)}
          className={`size-full ${className}`}
        />
      ) : (
        <div className="size-full animate-pulse rounded-xl bg-stone-100" />
      )}
    </div>
  )
}

// ——— Behaviour ———

function useNear(ref, root, margin) {
  // Without IntersectionObserver (very old browsers), everything loads.
  const [near, setNear] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: margin })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, root, margin])
  return near
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function useRafCallback(fn) {
  const latest = useRef(fn)
  useLayoutEffect(() => {
    latest.current = fn
  })
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  return useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => latest.current())
  }, [])
}

// Two-finger pinch: the content scales live with a CSS transform, and the
// real zoom (pages redrawn sharp) is applied when the fingers lift.
function usePinchZoom(scrollerRef, contentRef, zoom, zoomTo) {
  const zoomRef = useRef(zoom)
  useLayoutEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  useEffect(() => {
    const box = scrollerRef.current
    let pinch = null
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e) => {
      if (e.touches.length !== 2) return
      const rect = box.getBoundingClientRect()
      const x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      pinch = { d0: dist(e.touches), x, y, ratio: 1 }
      const content = contentRef.current
      content.style.transformOrigin = `${box.scrollLeft + x}px ${box.scrollTop + y}px`
      content.style.willChange = 'transform'
    }
    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const z = zoomRef.current
      pinch.ratio = clampZoom(z * (dist(e.touches) / pinch.d0)) / z
      contentRef.current.style.transform = `scale(${pinch.ratio})`
    }
    const onEnd = () => {
      if (!pinch) return
      const { ratio, x, y } = pinch
      pinch = null
      const content = contentRef.current
      content.style.transform = ''
      content.style.willChange = ''
      if (Math.abs(ratio - 1) > 0.02) zoomTo((z) => z * ratio, { x, y })
    }
    box.addEventListener('touchstart', onStart, { passive: true })
    box.addEventListener('touchmove', onMove, { passive: false })
    box.addEventListener('touchend', onEnd)
    box.addEventListener('touchcancel', onEnd)
    return () => {
      box.removeEventListener('touchstart', onStart)
      box.removeEventListener('touchmove', onMove)
      box.removeEventListener('touchend', onEnd)
      box.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollerRef, contentRef, zoomTo])
}

// The sheet gets its own history entry, so Back (and Android's back gesture)
// closes it instead of leaving the screen. Returns the close function.
function useHistoryEntry(onClose) {
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    // (StrictMode mounts twice; the entry from the first mount is reused.)
    if (!window.history.state?.sourceSheet) window.history.pushState({ ...window.history.state, sourceSheet: true }, '')
    const onPop = () => {
      if (!window.history.state?.sourceSheet) closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      mounted.current = false
      window.removeEventListener('popstate', onPop)
      // Closed some other way: drop the entry, unless this was StrictMode's
      // test unmount and the sheet is back.
      setTimeout(() => {
        if (!mounted.current && window.history.state?.sourceSheet) window.history.back()
      }, 0)
    }
  }, [])
  return useCallback(() => {
    if (window.history.state?.sourceSheet) window.history.back()
    else closeRef.current()
  }, [])
}

// Focus moves into the sheet and returns where it was; Escape closes; the
// page behind doesn't scroll.
function useSheetFocus(sheetRef, close) {
  useEffect(() => {
    const before = document.activeElement
    sheetRef.current?.focus({ preventScroll: true })
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Tab') {
        // Keep Tab inside the sheet.
        const focusable = sheetRef.current.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')
        if (!focusable.length) return
        const firstEl = focusable[0]
        const lastEl = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.({ preventScroll: true })
    }
  }, [sheetRef, close])
}
