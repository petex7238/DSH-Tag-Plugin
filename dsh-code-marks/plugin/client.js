window.__ModuleLoader__.load({
  id: 'dsh-code-marks',
  factory: (require) => {
    'use strict'

    /** The shell's frozen platform module table seeds React for every client bundle. */
    const React = require('react')

    //#region constants
    /** Slot key / tab-type id: one identity for the type, its body and its chip. */
    const TYPE_ID = 'dsh-code-marks'
    /** Tab kind. Free-form: no shipped type holds this kind. */
    const KIND = 'code-marks'
    const STYLE_ID = 'dsh-code-marks-style'
    const PANEL_ATTR = 'data-dsh-cm-panel'
    const TOOLBAR_ATTR = 'data-dsh-cm-toolbar'
    const FLASH_ATTR = 'data-dsh-cm-flash'
    const RAIL_ATTR = 'data-dsh-cm-rail'
    const TIP_ATTR = 'data-dsh-cm-tip'
    const OWN_ATTR = 'data-dsh-cm'
    const LS_TAGS = 'dsh.code-marks.v1.tags'
    const LS_MARKS = 'dsh.code.marks.v2.' // + sessionId
    /** Chat rows this plugin accepts a mark on. Assistant answers carry the code. */
    const MARKABLE_KINDS = new Set(['assistant-step'])
    /** Row identity attributes written by @deepseek-ai/dsh-client-ui-chat. */
    const ROW_SELECTOR = '[data-chat-anchor-key]'
    const HIGHLIGHT_PREFIX = 'dsh-cm-'
    const HOVER_HIGHLIGHT = 'dsh-cm-hover'
    const CONTEXT = 48
    const MAX_MARKS_PER_HIGHLIGHT = 400
    const PALETTE = [
      { id: 'blue', dot: '#3b82f6', wash: 'rgba(59,130,246,.34)' },
      { id: 'green', dot: '#10b981', wash: 'rgba(16,185,129,.32)' },
      { id: 'amber', dot: '#f59e0b', wash: 'rgba(245,158,11,.36)' },
      { id: 'violet', dot: '#8b5cf6', wash: 'rgba(139,92,246,.32)' },
      { id: 'pink', dot: '#ec4899', wash: 'rgba(236,72,153,.30)' },
      { id: 'cyan', dot: '#06b6d4', wash: 'rgba(6,182,212,.32)' },
    ]
    const DEFAULT_TAGS = [
      { name: '核心逻辑', color: 'blue' },
      { name: '疑问', color: 'amber' },
      { name: '易错点', color: 'pink' },
      { name: '待复习', color: 'green' },
    ]
    //#endregion

    //#region utils
    const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

    /** Read a JSON value, tolerating absent or corrupt storage. */
    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return fallback
        const value = JSON.parse(raw)
        return value ?? fallback
      } catch {
        return fallback
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* storage full or blocked: the in-memory copy still works */
      }
    }

    function clampText(text, max) {
      const flat = text.replace(/\s+/g, ' ').trim()
      return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
    }

    function formatWhen(ts) {
      try {
        const d = new Date(ts)
        const pad = (n) => String(n).padStart(2, '0')
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      } catch {
        return ''
      }
    }

    function isCodeQuote(quote) {
      const text = quote.trim()
      if (text.length === 0) return false
      if (text.includes('\n')) return true
      return /[{}<>;=()[\].$#]|=>|\b(function|const|let|var|return|class|def|import|export|SELECT|UPDATE)\b/.test(text) && text.length > 12
    }

    function paletteOf(colorId) {
      return PALETTE.find((entry) => entry.id === colorId) ?? PALETTE[0]
    }
    //#endregion

    //#region store
    /**
     * One immutable snapshot store shared by the panel, the selection toolbar and
     * the highlight layer: tags are global, marks are per Session.
     */
    function createStore() {
      const seed = () => {
        const saved = readJson(LS_TAGS, null)
        if (Array.isArray(saved) && saved.length > 0) {
          return saved
            .filter((tag) => tag && typeof tag.name === 'string' && tag.name.trim() !== '')
            .map((tag, index) => ({
              id: typeof tag.id === 'string' && tag.id !== '' ? tag.id : uid('t'),
              name: String(tag.name).slice(0, 24),
              color: typeof tag.color === 'string' ? tag.color : PALETTE[index % PALETTE.length].id,
            }))
        }
        return DEFAULT_TAGS.map((tag) => ({ id: uid('t'), name: tag.name, color: tag.color }))
      }

      let snapshot = { tags: seed(), marks: {}, loaded: {} }
      const listeners = new Set()

      const commit = (next) => {
        snapshot = next
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            console.warn('[dsh-code-marks] listener failed:', error)
          }
        }
      }

      const persistTags = () => writeJson(LS_TAGS, snapshot.tags)
      const persistMarks = (sessionId) => writeJson(LS_MARKS + sessionId, snapshot.marks[sessionId] ?? [])

      const sanitize = (raw) => {
        if (!Array.isArray(raw)) return []
        const out = []
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue
          if (typeof item.id !== 'string' || typeof item.quote !== 'string' || item.quote === '') continue
          out.push({
            id: item.id,
            tagId: typeof item.tagId === 'string' ? item.tagId : '',
            nodeKey: typeof item.nodeKey === 'string' ? item.nodeKey : '',
            anchorKey: typeof item.anchorKey === 'string' ? item.anchorKey : '',
            turn: Number.isSafeInteger(item.turn) ? item.turn : null,
            groupPart: typeof item.groupPart === 'string' ? item.groupPart : '',
            quote: item.quote.slice(0, 8000),
            prefix: typeof item.prefix === 'string' ? item.prefix.slice(-CONTEXT * 2) : '',
            suffix: typeof item.suffix === 'string' ? item.suffix.slice(0, CONTEXT * 2) : '',
            start: Number.isSafeInteger(item.start) ? item.start : null,
            note: typeof item.note === 'string' ? item.note.slice(0, 400) : '',
            createdAt: Number.isSafeInteger(item.createdAt) ? item.createdAt : Date.now(),
          })
        }
        return out.sort((a, b) => b.createdAt - a.createdAt)
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot() {
          return snapshot
        },
        /** Load one Session's marks the first time anything asks for them. */
        ensureSession(sessionId) {
          if (!sessionId || snapshot.loaded[sessionId]) return
          const known = new Set(snapshot.tags.map((tag) => tag.id))
          const fallbackId = snapshot.tags[0]?.id ?? ''
          let retagged = false
          const marks = sanitize(readJson(LS_MARKS + sessionId, [])).map((mark) => {
            if (known.has(mark.tagId)) return mark
            // A tag deleted while this Session was not loaded: adopt the first tag.
            retagged = true
            return { ...mark, tagId: fallbackId }
          })
          commit({
            ...snapshot,
            marks: { ...snapshot.marks, [sessionId]: marks },
            loaded: { ...snapshot.loaded, [sessionId]: true },
          })
          if (retagged) writeJson(LS_MARKS + sessionId, marks)
        },
        marksOf(sessionId) {
          return snapshot.marks[sessionId] ?? []
        },
        addMark(sessionId, mark) {
          this.ensureSession(sessionId)
          const next = [mark, ...(snapshot.marks[sessionId] ?? [])]
          commit({ ...snapshot, marks: { ...snapshot.marks, [sessionId]: next } })
          persistMarks(sessionId)
          return mark
        },
        patchMark(sessionId, id, patch) {
          const current = snapshot.marks[sessionId] ?? []
          const next = current.map((mark) => (mark.id === id ? { ...mark, ...patch } : mark))
          commit({ ...snapshot, marks: { ...snapshot.marks, [sessionId]: next } })
          persistMarks(sessionId)
        },
        removeMark(sessionId, id) {
          const current = snapshot.marks[sessionId] ?? []
          const next = current.filter((mark) => mark.id !== id)
          commit({ ...snapshot, marks: { ...snapshot.marks, [sessionId]: next } })
          persistMarks(sessionId)
        },
        addTag(name, color) {
          const clean = String(name ?? '').trim().slice(0, 24)
          if (clean === '') return null
          const tag = {
            id: uid('t'),
            name: clean,
            color: color ?? PALETTE[snapshot.tags.length % PALETTE.length].id,
          }
          commit({ ...snapshot, tags: [...snapshot.tags, tag] })
          persistTags()
          return tag
        },
        renameTag(id, name) {
          const clean = String(name ?? '').trim().slice(0, 24)
          if (clean === '') return
          commit({
            ...snapshot,
            tags: snapshot.tags.map((tag) => (tag.id === id ? { ...tag, name: clean } : tag)),
          })
          persistTags()
        },
        recolorTag(id, color) {
          commit({
            ...snapshot,
            tags: snapshot.tags.map((tag) => (tag.id === id ? { ...tag, color } : tag)),
          })
          persistTags()
        },
        removeTag(id) {
          const fallback = snapshot.tags.find((tag) => tag.id !== id)
          if (fallback === undefined) return
          const marks = {}
          for (const [sessionId, list] of Object.entries(snapshot.marks)) {
            marks[sessionId] = list.map((mark) => (mark.tagId === id ? { ...mark, tagId: fallback.id } : mark))
            writeJson(LS_MARKS + sessionId, marks[sessionId])
          }
          commit({ ...snapshot, tags: snapshot.tags.filter((tag) => tag.id !== id), marks })
          persistTags()
        },
      }
    }

    const store = createStore()

    /**
     * The client root context, kept for helpers that run outside React (the
     * selection toolbar, the paging request, tab opening).
     */
    let ctxRef = null
    /** The live edge rail, so store and Session changes can reposition it. */
    let railRef = null
    //#endregion

    //#region chat rows and text geometry
    /** The element that owns `node`, when it is a chat transcript row. */
    function rowOf(node) {
      const element = node === null || node === undefined ? null : node.nodeType === 1 ? node : node.parentElement
      if (element === null) return null
      const row = element.closest(ROW_SELECTOR)
      return row instanceof HTMLElement ? row : null
    }

    /** Whether this row is something the user may mark. */
    function isMarkableRow(row) {
      if (row === null) return false
      const kind = row.dataset.chatFlowKind ?? ''
      if (!MARKABLE_KINDS.has(kind)) return false
      if (row.getAttribute('aria-hidden') === 'true') return false
      return true
    }

    /** Text nodes of one row in document order — the coordinate space of our offsets. */
    function textNodesOf(root) {
      const nodes = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node.nodeValue !== null && node.nodeValue !== '') nodes.push(node)
      }
      return nodes
    }

    /** Whole-row text, matching what `Range#toString()` reports for the same span. */
    function rowText(root) {
      return textNodesOf(root)
        .map((node) => node.nodeValue)
        .join('')
    }

    /** Character length of the row text that precedes `(container, offset)`. */
    function offsetOfPoint(root, container, offset) {
      try {
        const probe = document.createRange()
        probe.setStart(root, 0)
        probe.setEnd(container, offset)
        return probe.toString().length
      } catch {
        return null
      }
    }

    /** A text Range for `[start, end)` in the row's own text space. */
    function rangeAtOffsets(root, start, end) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return null
      const nodes = textNodesOf(root)
      let acc = 0
      let startNode = null
      let startOffset = 0
      let endNode = null
      let endOffset = 0
      for (const node of nodes) {
        const length = node.nodeValue.length
        if (startNode === null && start <= acc + length) {
          startNode = node
          startOffset = start - acc
        }
        if (endNode === null && end <= acc + length) {
          endNode = node
          endOffset = end - acc
        }
        acc += length
        if (startNode !== null && endNode !== null) break
      }
      if (startNode === null || endNode === null) return null
      try {
        const range = document.createRange()
        range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.nodeValue.length)))
        range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.nodeValue.length)))
        return range
      } catch {
        return null
      }
    }
    //#endregion

    //#region quote matching
    /**
     * Locate `quote` inside `text`, preferring the occurrence framed by the saved
     * context. Whitespace is compared loosely because rendered Markdown and the
     * captured text may differ in line breaks.
     */
    function locateQuote(text, quote, prefix, suffix, hint) {
      if (quote === '' || text === '') return null
      // Three tiers, cheapest first: exact, whitespace runs collapsed, all
      // whitespace removed. The last one also survives re-indentation.
      const tiers = [
        { hay: text, needle: quote, map: null },
        { hay: collapseWhitespace(text).text, needle: collapseWhitespace(quote).text, map: collapseWhitespace(text).map },
        { hay: stripWhitespace(text).text, needle: stripWhitespace(quote).text, map: stripWhitespace(text).map },
      ]
      for (const tier of tiers) {
        if (tier.needle === '') continue
        const positions = []
        let from = 0
        while (positions.length <= MAX_MARKS_PER_HIGHLIGHT) {
          const index = tier.hay.indexOf(tier.needle, from)
          if (index < 0) break
          positions.push(index)
          from = index + 1
        }
        if (positions.length === 0) continue
        const ranges = positions.map((position) => {
          if (tier.map === null) return { start: position, end: position + tier.needle.length }
          const rawStart = tier.map[position]
          const rawEnd = tier.map[Math.min(position + tier.needle.length - 1, tier.map.length - 2)] + 1
          return { start: rawStart, end: Math.max(rawEnd, rawStart + 1) }
        })
        const best = pickBest(text, ranges, prefix, suffix, hint)
        if (best !== null) return best
      }
      return null
    }

    /** Collapse whitespace runs, keeping a raw-index map for the expanded text. */
    function collapseWhitespace(text) {
      let out = ''
      const map = []
      let previousSpace = false
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (/\s/.test(char)) {
          if (previousSpace) continue
          previousSpace = true
          map.push(index)
          out += ' '
          continue
        }
        previousSpace = false
        map.push(index)
        out += char
      }
      map.push(text.length)
      return { text: out, map }
    }

    /** Remove every whitespace character, keeping a raw-index map. */
    function stripWhitespace(text) {
      let out = ''
      const map = []
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (/\s/.test(char)) continue
        map.push(index)
        out += char
      }
      map.push(text.length)
      return { text: out, map }
    }

    /** Choose the occurrence whose neighbouring text agrees with the saved context. */
    function pickBest(text, ranges, prefix, suffix, hint) {
      let best = null
      for (const range of ranges) {
        const before = text.slice(Math.max(0, range.start - CONTEXT), range.start)
        const after = text.slice(range.end, range.end + CONTEXT)
        let score = 0
        if (prefix !== '') score += before.endsWith(prefix) ? 6 : agreeRatio(before, prefix) * 4
        if (suffix !== '') score += after.startsWith(suffix) ? 6 : agreeRatio(after, suffix) * 4
        if (Number.isSafeInteger(hint)) score -= Math.min(4, Math.abs(range.start - hint) / 800)
        if (best === null || score > best.score) best = { start: range.start, end: range.end, score }
      }
      return best === null ? null : { start: best.start, end: best.end }
    }

    /** How much of two context strings agree, 0..1, comparing their tails. */
    function agreeRatio(actual, expected) {
      const width = Math.min(actual.length, expected.length, CONTEXT)
      if (width === 0) return 0
      const a = actual.slice(-width)
      const b = expected.slice(-width)
      let same = 0
      for (let index = 0; index < width; index += 1) if (a[index] === b[index]) same += 1
      return same / width
    }
    //#endregion

    //#region anchors
    /** Chat row identity, as written into the transcript by ui-chat. */
    function rowIdentity(row) {
      return {
        nodeKey: row.dataset.chatNodeKey ?? '',
        anchorKey: row.dataset.chatAnchorKey ?? '',
        groupPart: row.dataset.chatGroupPart ?? '',
        turn: Number.isSafeInteger(Number(row.dataset.chatTurn)) ? Number(row.dataset.chatTurn) : null,
      }
    }

    /** Every mounted row, indexed by the two identities a mark can carry. */
    function buildRowIndex() {
      const byAnchor = new Map()
      const byNode = new Map()
      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const anchorKey = row.dataset.chatAnchorKey
        const nodeKey = row.dataset.chatNodeKey
        if (anchorKey !== undefined && !byAnchor.has(anchorKey)) byAnchor.set(anchorKey, row)
        if (nodeKey !== undefined) {
          const list = byNode.get(nodeKey)
          if (list === undefined) byNode.set(nodeKey, [row])
          else list.push(row)
        }
      }
      return { byAnchor, byNode }
    }

    /** The live row for a saved anchor: exact anchor first, then its node. */
    function findRowIn(index, anchor) {
      if (anchor.anchorKey !== '' && index.byAnchor.has(anchor.anchorKey)) return index.byAnchor.get(anchor.anchorKey)
      if (anchor.nodeKey !== '') {
        const candidates = index.byNode.get(anchor.nodeKey)
        if (candidates !== undefined) {
          const exact = candidates.find((row) => (row.dataset.chatGroupPart ?? '') === (anchor.groupPart ?? ''))
          if (exact !== undefined) return exact
          const plain = candidates.find((row) => row.dataset.chatGroupPart === undefined)
          return plain ?? candidates[0]
        }
      }
      return null
    }

    const findRow = (anchor) => findRowIn(buildRowIndex(), anchor)

    /**
     * Resolve one mark against the current DOM: its row plus the marked Range.
     * A Range is rebuilt on every call and never cached — the transcript replaces
     * code-block DOM (plain → shiki) and appends while streaming.
     */
    function resolveMark(mark, index) {
      const row = findRowIn(index ?? buildRowIndex(), mark)
      if (row === null) return { row: null, range: null }
      const text = rowText(row)
      if (text === '') return { row, range: null }
      const located =
        Number.isSafeInteger(mark.start) && mark.start >= 0 && text.slice(mark.start, mark.start + mark.quote.length) === mark.quote
          ? { start: mark.start, end: mark.start + mark.quote.length }
          : locateQuote(text, mark.quote, mark.prefix, mark.suffix, mark.start)
      const range = located === null ? null : rangeAtOffsets(row, located.start, located.end)
      return { row, range }
    }

    /** Capture the current selection as an anchor, or null when it is not markable. */
    function captureSelection(selection) {
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
      const range = selection.getRangeAt(0)
      const start = range.startContainer
      const end = range.endContainer
      const row = rowOf(start) ?? rowOf(end)
      if (row === null || !isMarkableRow(row)) return null
      if (!row.contains(start) || !row.contains(end)) return null
      const quote = range.toString()
      if (quote.trim() === '') return null
      const startOffset = offsetOfPoint(row, start, range.startOffset)
      const endOffset = offsetOfPoint(row, end, range.endOffset)
      if (startOffset === null || endOffset === null || endOffset <= startOffset) return null
      const whole = rowText(row)
      return {
        ...rowIdentity(row),
        quote: quote.slice(0, 8000),
        prefix: whole.slice(Math.max(0, startOffset - CONTEXT), startOffset),
        suffix: whole.slice(endOffset, endOffset + CONTEXT),
        start: startOffset,
        end: endOffset,
      }
    }
    //#endregion

    //#region styles and highlights
    function ensureStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = baseCss()
      document.head.appendChild(style)
    }

    /** Per-tag highlight rules; rewritten whenever the tag list changes. */
    function syncHighlightStyles(tags) {
      const style = document.getElementById(STYLE_ID)
      if (style === null) return
      const rules = tags
        .map((tag) => {
          const palette = paletteOf(tag.color)
          return `::highlight(${highlightName(tag.id)}){background-color:${palette.wash};border-radius:2px;}`
        })
        .join('\n')
      let node = document.getElementById(`${STYLE_ID}-tags`)
      if (node === null) {
        node = document.createElement('style')
        node.id = `${STYLE_ID}-tags`
        document.head.appendChild(node)
      }
      node.textContent = rules
    }

    function highlightName(tagId) {
      return `${HIGHLIGHT_PREFIX}${String(tagId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
    }

    const canHighlight = () => typeof CSS !== 'undefined' && CSS !== null && 'highlights' in CSS

    /**
     * Rebuild every tag highlight for one Session. CSS Custom Highlight keeps the
     * ranges out of the React-owned DOM, so a re-render cannot break a mark.
     */
    function refreshHighlights(sessionId, hoveredId) {
      if (!canHighlight()) return
      const tags = store.getSnapshot().tags
      const marks = store.marksOf(sessionId)
      const buckets = new Map(tags.map((tag) => [tag.id, []]))
      const index = buildRowIndex()
      let hovered = null
      for (const mark of marks.slice(0, MAX_MARKS_PER_HIGHLIGHT)) {
        const resolved = resolveMark(mark, index)
        if (resolved.range === null) continue
        if (mark.id === hoveredId) {
          hovered = resolved.range
          continue
        }
        const bucket = buckets.get(mark.tagId)
        if (bucket === undefined) continue
        bucket.push(resolved.range)
      }
      for (const [tagId, ranges] of buckets) {
        const name = highlightName(tagId)
        if (ranges.length === 0) {
          CSS.highlights.delete(name)
          continue
        }
        CSS.highlights.set(name, new Highlight(...ranges))
      }
      if (hovered !== null) CSS.highlights.set(HOVER_HIGHLIGHT, new Highlight(hovered))
      else CSS.highlights.delete(HOVER_HIGHLIGHT)
    }

    /** A short landing animation over the resolved rects — the "cursor" that lands. */
    function flashRange(range) {
      if (range === null) return
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).slice(0, 6)
      if (rects.length === 0) return
      for (const rect of rects) {
        const marker = document.createElement('div')
        marker.setAttribute(FLASH_ATTR, '')
        marker.setAttribute(OWN_ATTR, '')
        const pad = 2
        marker.style.cssText = [
          'position:fixed',
          'pointer-events:none',
          'z-index:2147483001',
          `top:${rect.top - pad}px`,
          `left:${rect.left - pad}px`,
          `width:${rect.width + pad * 2}px`,
          `height:${rect.height + pad * 2}px`,
          'border-radius:4px',
          'background:rgba(59,130,246,.22)',
          'box-shadow:0 0 0 1px rgba(59,130,246,.55)',
          'animation:dsh-cm-flash .95s ease-out forwards',
        ].join(';')
        document.body.appendChild(marker)
        marker.addEventListener('animationend', () => marker.remove(), { once: true })
        window.setTimeout(() => marker.remove(), 1400)
      }
    }
    //#endregion

    //#region jumping
    /** Identify the transcript's "load earlier" control without reading its hashed class. */
    function findOlderButton() {
      for (const button of document.querySelectorAll('[data-chat-flow] button')) {
        const label = (button.textContent ?? '').trim()
        if (/^(加载更早|Load earlier|Weitere laden|加载更早…|Load older)/i.test(label)) return button
        if (button.closest(ROW_SELECTOR) !== null) continue
        if (button.parentElement?.classList.length === 1) return button
      }
      return null
    }

    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

    /**
     * Ask for one older page. The Session handle is the real API; the rendered
     * "load earlier" control is the fallback for a shell that hides it.
     */
    function requestOlderPage(sessionId) {
      try {
        const session = sessionId === undefined ? undefined : ctxRef?.sessions?.binding?.(sessionId)?.session
        if (session !== undefined && typeof session.loadOlder === 'function') {
          session.loadOlder()
          return true
        }
      } catch {
        /* the binding may reject a Session that is not resident */
      }
      const button = findOlderButton()
      if (button !== null) {
        button.click()
        return true
      }
      return false
    }

    /**
     * A row inside a collapsed process group renders with zero client rects.
     * Expanding the group is a click on its own header, so the shell owns the state.
     */
    function revealCollapsedRow(row) {
      const host = row.closest('[hidden]')
      if (host === null) return false
      const header = host.closest('[data-step-process], [data-chat-group-key]')
      const trigger =
        header?.querySelector('[data-step-process-chevron]')?.closest('button') ??
        header?.querySelector('button') ??
        null
      if (trigger !== null) {
        trigger.click()
        return true
      }
      host.removeAttribute('hidden')
      return true
    }

    /**
     * Bring one mark into view: page history in when needed, scroll the row into
     * the viewport, and flash the exact marked span.
     */
    async function jumpToMark(mark, sessionId) {
      let resolved = resolveMark(mark)
      let attempts = 0
      while (resolved.row === null && attempts < 16) {
        if (!requestOlderPage(sessionId)) break
        attempts += 1
        await wait(240)
        resolved = resolveMark(mark)
      }
      if (resolved.row === null) return { ok: false, reason: 'missing' }
      if (resolved.row.getClientRects().length === 0) {
        revealCollapsedRow(resolved.row)
        await wait(180)
        resolved = resolveMark(mark)
      }
      if (resolved.row === null) return { ok: false, reason: 'missing' }
      try {
        resolved.row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        resolved.row.scrollIntoView()
      }
      await wait(160)
      const refreshed = resolveMark(mark)
      flashRange(refreshed.range)
      if (refreshed.range !== null && typeof window.getSelection === 'function') {
        try {
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(refreshed.range)
        } catch {
          /* selecting is a nicety; a blocked selection must not break the jump */
        }
      }
      return { ok: true, resolved: refreshed.range !== null }
    }
    //#endregion

    //#region selection toolbar
    /**
     * The mark affordance: a floating tag bar over the selection. Built with plain
     * DOM because it lives outside the shell's React tree.
     */
    function createSelectionToolbar(ctx) {
      ensureStyles()
      let toolbar = null
      let pending = null
      let hideTimer = 0

      const currentSession = () => {
        try {
          return ctx.sidebarRight?.mounted?.getSnapshot?.()
        } catch {
          return undefined
        }
      }

      function hide() {
        if (toolbar !== null) {
          toolbar.remove()
          toolbar = null
        }
        pending = null
      }

      function scheduleHide() {
        window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(hide, 120)
      }

      function markWith(tag) {
        if (pending === null) return
        const sessionId = currentSession()
        if (!sessionId) {
          hide()
          return
        }
        const mark = {
          id: uid('m'),
          tagId: tag.id,
          ...pending,
          note: '',
          createdAt: Date.now(),
        }
        store.addMark(sessionId, mark)
        hide()
        try {
          const selection = window.getSelection()
          selection?.removeAllRanges()
        } catch {
          /* ignore */
        }
        refreshHighlights(sessionId, null)
        openPanel()
      }

      function addTagAndMark(input) {
        const tag = store.addTag(input.value)
        if (tag === null) return
        syncHighlightStyles(store.getSnapshot().tags)
        markWith(tag)
      }

      function build(anchorRect) {
        const element = document.createElement('div')
        element.setAttribute(TOOLBAR_ATTR, '')
        element.setAttribute(OWN_ATTR, '')
        element.setAttribute('role', 'toolbar')
        element.setAttribute('aria-label', '标记这段内容')

        const label = document.createElement('span')
        label.className = 'dcm-toolbar-label'
        label.textContent = '标记为'
        element.appendChild(label)

        for (const tag of store.getSnapshot().tags) {
          const chip = document.createElement('button')
          chip.type = 'button'
          chip.className = 'dcm-toolbar-tag'
          chip.title = `标记为「${tag.name}」`
          const dot = document.createElement('i')
          dot.style.background = paletteOf(tag.color).dot
          chip.appendChild(dot)
          chip.appendChild(document.createTextNode(tag.name))
          chip.addEventListener('mousedown', (event) => event.preventDefault())
          chip.addEventListener('click', () => markWith(tag))
          element.appendChild(chip)
        }

        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'dcm-toolbar-add'
        add.title = '新建标签并标记'
        add.textContent = '＋'
        add.addEventListener('mousedown', (event) => event.preventDefault())
        add.addEventListener('click', () => {
          const input = document.createElement('input')
          input.className = 'dcm-toolbar-input'
          input.placeholder = '标签名'
          input.maxLength = 24
          const commit = () => {
            if (input.value.trim() !== '') addTagAndMark(input)
            else hide()
          }
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              hide()
            }
          })
          input.addEventListener('blur', () => window.setTimeout(() => {
            if (toolbar !== null) hide()
          }, 120))
          add.replaceWith(input)
          input.focus()
        })
        element.appendChild(add)

        // Position above the selection, clamped into the viewport. `anchorRect` is
        // the last client rect of the selection, so it already carries a viewport
        // position — no element lookup is involved.
        element.style.visibility = 'hidden'
        document.body.appendChild(element)
        const own = element.getBoundingClientRect()
        const top = anchorRect.top - own.height - 8 < 8 ? anchorRect.bottom + 8 : anchorRect.top - own.height - 8
        const left = Math.min(Math.max(8, anchorRect.left + anchorRect.width / 2 - own.width / 2), window.innerWidth - own.width - 8)
        element.style.top = `${Math.round(top)}px`
        element.style.left = `${Math.round(left)}px`
        element.style.visibility = 'visible'
        return element
      }

      function show(range) {
        const sessionId = currentSession()
        if (!sessionId) return
        const anchor = captureSelection(window.getSelection())
        if (anchor === null) return
        hide()
        pending = anchor
        const rects = range.getClientRects()
        const last = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
        toolbar = build(last)
      }

      const onMouseUp = (event) => {
        if (event.target instanceof Element && event.target.closest(`[${TOOLBAR_ATTR}]`) !== null) return
        if (event.button !== 0) return
        window.setTimeout(() => {
          const selection = window.getSelection()
          if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
            hide()
            return
          }
          const range = selection.getRangeAt(0)
          if (rowOf(range.startContainer) === null) {
            hide()
            return
          }
          show(range)
        }, 0)
      }

      const onPointerDown = (event) => {
        if (event.target instanceof Element && event.target.closest(`[${TOOLBAR_ATTR}]`) !== null) return
        scheduleHide()
      }

      const onKeyDown = (event) => {
        if (event.key === 'Escape') hide()
      }

      const onScroll = () => {
        if (toolbar !== null) hide()
      }

      document.addEventListener('mouseup', onMouseUp, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onScroll)

      return () => {
        document.removeEventListener('mouseup', onMouseUp, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', onScroll)
        window.clearTimeout(hideTimer)
        hide()
      }
    }
    //#endregion

    //#region edge rail
    /**
     * A short deep-blue bar per mark, hugging the upper right edge of the
     * conversation — the same visual language as the shell's own turn ticks
     * (20x2 rounded bar, 10px pitch, right-aligned), so jumping to a mark needs
     * neither the right column nor the transcript's scroll position.
     */
    const RAIL_PITCH = 10

    /** Marks read top-down like a table of contents: turn, then offset in it. */
    function compareMarks(a, b) {
      const turnA = Number.isSafeInteger(a.turn) ? a.turn : Number.MAX_SAFE_INTEGER
      const turnB = Number.isSafeInteger(b.turn) ? b.turn : Number.MAX_SAFE_INTEGER
      if (turnA !== turnB) return turnA - turnB
      const startA = Number.isSafeInteger(a.start) ? a.start : 0
      const startB = Number.isSafeInteger(b.start) ? b.start : 0
      if (startA !== startB) return startA - startB
      return a.createdAt - b.createdAt
    }

    /** Whether the shell is showing a dark surface, by sampling its own background. */
    function isDarkSurface() {
      try {
        const sample = getComputedStyle(document.body).backgroundColor
        const match = /rgba?\(([^)]+)\)/.exec(sample)
        if (match === null) return false
        const parts = match[1].split(',').map((part) => Number.parseFloat(part))
        const [r, g, b] = parts
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false
        // A transparent surface carries no opinion: treat it as light.
        if (parts.length >= 4 && parts[3] === 0) return false
        return (r * 299 + g * 587 + b * 114) / 1000 < 128
      } catch {
        return false
      }
    }

    /** Where the rail belongs: the upper right edge of the conversation column. */
    function railGeometry() {
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (scroller === null) return null
      const rect = scroller.getBoundingClientRect()
      if (rect.width < 240 || rect.height < 200) return null
      const right = Math.max(4, window.innerWidth - rect.right + 4)
      const top = Math.max(72, rect.top + 76)
      // Keep the rail in the column's upper part so it never grows into the
      // shell's own turn ticks (which sit vertically centred); overflow scrolls.
      const cap = Math.max(RAIL_PITCH * 3, Math.floor(rect.height * 0.42))
      const room = Math.min(window.innerHeight - top - 96, cap)
      if (room < RAIL_PITCH * 3) return null
      return { right, top, room }
    }

    function createMarkRail(ctx) {
      ensureStyles()
      const rail = document.createElement('div')
      rail.setAttribute(RAIL_ATTR, '')
      rail.setAttribute(OWN_ATTR, '')
      rail.setAttribute('role', 'navigation')
      rail.setAttribute('aria-label', '标记')
      document.body.appendChild(rail)

      const tip = document.createElement('div')
      tip.setAttribute(TIP_ATTR, '')
      tip.setAttribute(OWN_ATTR, '')
      tip.setAttribute('role', 'tooltip')
      document.body.appendChild(tip)

      let hideTimer = 0
      let visibleMarks = []
      let session = undefined
      let signature = ''

      const sessionOf = () => {
        try {
          return ctx.sidebarRight?.mounted?.getSnapshot?.()
        } catch {
          return undefined
        }
      }

      function hideTip() {
        window.clearTimeout(hideTimer)
        tip.style.display = 'none'
        if (session !== undefined) refreshHighlights(session, null)
      }

      function scheduleHideTip() {
        window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(hideTip, 140)
      }

      function showTip(mark, button) {
        window.clearTimeout(hideTimer)
        const tag = store.getSnapshot().tags.find((entry) => entry.id === mark.tagId)
        const palette = paletteOf(tag?.color)
        tip.textContent = ''

        const head = document.createElement('div')
        head.className = 'dcm-tip-tag'
        const dot = document.createElement('i')
        dot.style.background = palette.dot
        head.appendChild(dot)
        head.appendChild(document.createTextNode(tag?.name ?? '未分类'))
        tip.appendChild(head)

        const quote = document.createElement('div')
        quote.className = `dcm-tip-quote${isCodeQuote(mark.quote) ? ' dcm-tip-quote-code' : ''}`
        quote.textContent = clampText(mark.quote, 220)
        tip.appendChild(quote)

        const meta = document.createElement('div')
        meta.className = 'dcm-tip-meta'
        const bits = []
        if (mark.turn !== null) bits.push(`第 ${mark.turn} 轮`)
        bits.push(formatWhen(mark.createdAt))
        meta.textContent = bits.join(' · ')
        tip.appendChild(meta)

        tip.style.display = 'block'
        tip.style.visibility = 'hidden'
        const bar = button.getBoundingClientRect()
        const own = tip.getBoundingClientRect()
        const left = Math.max(8, bar.left - own.width - 10)
        const top = Math.max(8, Math.min(bar.top + bar.height / 2 - own.height / 2, window.innerHeight - own.height - 8))
        tip.style.left = `${Math.round(left)}px`
        tip.style.top = `${Math.round(top)}px`
        tip.style.visibility = 'visible'
        if (session !== undefined) refreshHighlights(session, mark.id)
      }

      /** A notice borrows the tooltip so a failed jump is never silent. */
      function noticeAt(button, text) {
        tip.textContent = ''
        const line = document.createElement('div')
        line.className = 'dcm-tip-notice'
        line.textContent = text
        tip.appendChild(line)
        tip.style.display = 'block'
        const bar = button.getBoundingClientRect()
        const own = tip.getBoundingClientRect()
        tip.style.left = `${Math.round(Math.max(8, bar.left - own.width - 10))}px`
        tip.style.top = `${Math.round(Math.max(8, Math.min(bar.top - own.height / 2, window.innerHeight - own.height - 8)))}px`
        window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(hideTip, 2600)
      }

      async function activate(mark, button) {
        hideTip()
        const result = await jumpToMark(mark, session)
        if (!result.ok) noticeAt(button, '这段内容还没加载出来：先往上滚一点，再点一次。')
        else if (!result.resolved) noticeAt(button, '已定位到这条消息，但原文已被改写，高亮对不上。')
      }

      function barFor(mark, index) {
        const tag = store.getSnapshot().tags.find((entry) => entry.id === mark.tagId)
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'dcm-rail-bar'
        button.dataset.dcmBar = mark.id
        button.dataset.dcmIndex = String(index)
        button.setAttribute('aria-label', `${tag?.name ?? '未分类'}：${clampText(mark.quote, 48)}`)
        button.addEventListener('pointerenter', () => showTip(mark, button))
        button.addEventListener('pointerleave', () => scheduleHideTip())
        button.addEventListener('focus', () => showTip(mark, button))
        button.addEventListener('blur', () => scheduleHideTip())
        button.addEventListener('click', () => {
          void activate(mark, button)
        })
        return button
      }

      /**
       * Rebuild the bars, but only when the visible set changed: a rebuild
       * replaces the button under the pointer, so a no-op refresh during
       * streaming must not steal the hover. Placement is re-applied every time,
       * which is what makes the rail follow the column while the right pane
       * animates open or closed.
       */
      function refresh(force) {
        observeColumn()
        const next = sessionOf()
        if (next !== session) {
          session = next
          if (session !== undefined) store.ensureSession(session)
        }
        const geometry = railGeometry()
        visibleMarks = session === undefined ? [] : [...store.marksOf(session)].sort(compareMarks)
        const tone = isDarkSurface() ? 'dark' : 'light'
        const shown = visibleMarks.length > 0 && geometry !== null
        if (shown) {
          rail.dataset.tone = tone
          rail.style.display = 'flex'
          rail.style.right = `${Math.round(geometry.right)}px`
          rail.style.top = `${Math.round(geometry.top)}px`
          rail.style.maxHeight = `${Math.min(geometry.room, visibleMarks.length * RAIL_PITCH + 4)}px`
        } else {
          rail.style.display = 'none'
        }
        const structure = `${session ?? '-'}|${tone}|${shown}|${visibleMarks.map((mark) => `${mark.id}:${mark.tagId}`).join(',')}`
        if (!force && structure === signature) return
        signature = structure
        hideTip()
        rail.textContent = ''
        if (!shown) return
        for (const [index, mark] of visibleMarks.entries()) rail.appendChild(barFor(mark, index))
      }

      /** Follow the conversation column itself, not just window resizes. */
      let observedColumn = null
      let columnObserver = null
      function observeColumn() {
        if (typeof ResizeObserver !== 'function') return
        const scroller = document.querySelector('[data-conversation-scroll]')
        if (scroller === observedColumn) return
        if (columnObserver === null) columnObserver = new ResizeObserver(() => refresh())
        if (observedColumn !== null) columnObserver.unobserve(observedColumn)
        observedColumn = scroller
        if (scroller !== null) columnObserver.observe(scroller)
      }

      const onResize = () => refresh()
      window.addEventListener('resize', onResize)
      document.addEventListener('scroll', scheduleHideTip, true)

      refresh()

      return {
        refresh,
        dispose() {
          window.removeEventListener('resize', onResize)
          document.removeEventListener('scroll', scheduleHideTip, true)
          columnObserver?.disconnect()
          columnObserver = null
          observedColumn = null
          window.clearTimeout(hideTimer)
          rail.remove()
          tip.remove()
        },
      }
    }
    //#endregion

    //#region open the panel
    /**
     * Reveal the marks tab for the on-screen Session. `openTab` also expands the
     * column, because content the user cannot see does not count as opened.
     */
    function openPanel() {
      try {
        const controller = ctxRef?.sidebarRight
        if (controller === undefined) return
        // `openTab` throws when no Session surface is mounted; a mark always has one.
        if (controller.mounted?.getSnapshot?.() === undefined) return
        controller.openTab(KIND)
      } catch (error) {
        console.warn('[dsh-code-marks] could not open the marks tab:', error)
      }
    }
    //#endregion

    //#region panel
    /** `useSyncExternalStore` with a fallback for a shell that predates it. */
    const useSyncStore = React.useSyncExternalStore
      ? (subscribe, getSnapshot) => React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      : (subscribe, getSnapshot) => {
          const [value, setValue] = React.useState(getSnapshot)
          React.useEffect(() => {
            setValue(() => getSnapshot())
            return subscribe(() => setValue(() => getSnapshot()))
          }, [subscribe])
          return value
        }

    function useStoreSnapshot(sessionId) {
      const subscribe = React.useCallback((listener) => store.subscribe(listener), [])
      const getSnapshot = React.useCallback(() => store.getSnapshot(), [])
      const snapshot = useSyncStore(subscribe, getSnapshot)
      React.useEffect(() => {
        store.ensureSession(sessionId)
      }, [sessionId])
      return snapshot
    }

    function Panel({ sessionId }) {
      const snapshot = useStoreSnapshot(sessionId)
      const [query, setQuery] = React.useState('')
      const [filterTagId, setFilterTagId] = React.useState(null)
      const [managing, setManaging] = React.useState(false)
      const [draftTag, setDraftTag] = React.useState('')
      const [editingId, setEditingId] = React.useState(null)
      const [editingName, setEditingName] = React.useState('')
      const [noteFor, setNoteFor] = React.useState(null)
      const [noteDraft, setNoteDraft] = React.useState('')
      const [notice, setNotice] = React.useState('')

      const tags = snapshot.tags
      const marks = snapshot.marks[sessionId] ?? []
      const tagById = React.useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

      React.useEffect(() => {
        syncHighlightStyles(tags)
        refreshHighlights(sessionId, null)
      }, [tags, sessionId, marks.length])

      React.useEffect(() => {
        if (notice === '') return undefined
        const timer = window.setTimeout(() => setNotice(''), 2600)
        return () => window.clearTimeout(timer)
      }, [notice])

      const counted = React.useMemo(() => {
        const counts = new Map()
        for (const mark of marks) counts.set(mark.tagId, (counts.get(mark.tagId) ?? 0) + 1)
        return counts
      }, [marks])

      const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        return marks.filter((mark) => {
          if (filterTagId !== null && mark.tagId !== filterTagId) return false
          if (needle === '') return true
          return mark.quote.toLowerCase().includes(needle) || (mark.note ?? '').toLowerCase().includes(needle)
        })
      }, [marks, filterTagId, query])

      async function locate(mark) {
        const result = await jumpToMark(mark, sessionId)
        if (!result.ok) {
          setNotice('这段内容还没加载出来：先往上滚一点让它进入对话，再点一次。')
        } else if (!result.resolved) {
          setNotice('已定位到这条消息，但原文已经被改过，高亮位置对不上了。')
        }
      }

      function onHover(mark, entering) {
        refreshHighlights(sessionId, entering ? mark.id : null)
      }

      function commitRename() {
        // Escape clears the draft and the following blur still commits: an empty
        // name therefore means "keep the old one".
        if (editingId !== null && editingName.trim() !== '') store.renameTag(editingId, editingName)
        setEditingId(null)
        setEditingName('')
      }

      const header = React.createElement(
        'div',
        { className: 'dcm-header' },
        React.createElement('span', { className: 'dcm-title' }, '标记'),
        React.createElement('span', { className: 'dcm-count' }, marks.length === 0 ? '' : String(marks.length)),
        React.createElement('input', {
          className: 'dcm-search',
          value: query,
          placeholder: '搜索标记…',
          spellCheck: false,
          onChange: (event) => setQuery(event.target.value),
        }),
        React.createElement(
          'button',
          {
            type: 'button',
            className: `dcm-icon${managing ? ' dcm-icon-on' : ''}`,
            title: managing ? '收起标签管理' : '管理标签',
            onClick: () => setManaging((value) => !value),
          },
          '⚙',
        ),
      )

      const filters = React.createElement(
        'div',
        { className: 'dcm-filters' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: `dcm-chip${filterTagId === null ? ' dcm-chip-on' : ''}`,
            onClick: () => setFilterTagId(null),
          },
          `全部 ${marks.length}`,
        ),
        ...tags.map((tag) =>
          React.createElement(
            'button',
            {
              key: tag.id,
              type: 'button',
              className: `dcm-chip${filterTagId === tag.id ? ' dcm-chip-on' : ''}`,
              onClick: () => setFilterTagId((current) => (current === tag.id ? null : tag.id)),
            },
            React.createElement('i', { style: { background: paletteOf(tag.color).dot } }),
            `${tag.name} ${counted.get(tag.id) ?? 0}`,
          ),
        ),
      )

      const list =
        visible.length === 0
          ? React.createElement(
              'div',
              { className: 'dcm-empty' },
              React.createElement('p', null, marks.length === 0 ? '还没有标记。' : '没有匹配的标记。'),
              marks.length === 0
                ? React.createElement(
                    'p',
                    { className: 'dcm-empty-hint' },
                    '在对话里用鼠标选中一段代码或一句话，浮出来的标签条里点一个标签，它就会出现在这里。',
                  )
                : null,
            )
          : React.createElement(
              'div',
              { className: 'dcm-list' },
              ...visible.map((mark) => {
                const tag = tagById.get(mark.tagId)
                const palette = paletteOf(tag?.color)
                const editing = noteFor === mark.id
                return React.createElement(
                  'div',
                  {
                    key: mark.id,
                    className: 'dcm-item',
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => locate(mark),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        locate(mark)
                      }
                    },
                    onMouseEnter: () => onHover(mark, true),
                    onMouseLeave: () => onHover(mark, false),
                  },
                  React.createElement(
                    'div',
                    { className: 'dcm-item-top' },
                    React.createElement(
                      'span',
                      { className: 'dcm-tag' },
                      React.createElement('i', { style: { background: palette.dot } }),
                      tag?.name ?? '未分类',
                    ),
                    React.createElement('span', { className: 'dcm-meta' }, mark.turn === null ? '' : `第 ${mark.turn} 轮`),
                    React.createElement('span', { className: 'dcm-meta' }, formatWhen(mark.createdAt)),
                    React.createElement(
                      'span',
                      { className: 'dcm-item-actions' },
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'dcm-mini',
                          title: '写备注',
                          onClick: (event) => {
                            event.stopPropagation()
                            setNoteFor(editing ? null : mark.id)
                            setNoteDraft(mark.note ?? '')
                          },
                        },
                        '✎',
                      ),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'dcm-mini',
                          title: '删除这条标记',
                          onClick: (event) => {
                            event.stopPropagation()
                            store.removeMark(sessionId, mark.id)
                            refreshHighlights(sessionId, null)
                          },
                        },
                        '×',
                      ),
                    ),
                  ),
                  React.createElement(
                    'div',
                    { className: `dcm-quote${isCodeQuote(mark.quote) ? ' dcm-quote-code' : ''}` },
                    clampText(mark.quote, 400),
                  ),
                  editing
                    ? React.createElement(
                        'div',
                        { className: 'dcm-note-edit', onClick: (event) => event.stopPropagation() },
                        React.createElement('input', {
                          className: 'dcm-note-input',
                          value: noteDraft,
                          placeholder: '这条标记要提醒自己什么？',
                          autoFocus: true,
                          maxLength: 400,
                          onChange: (event) => setNoteDraft(event.target.value),
                          onKeyDown: (event) => {
                            if (event.key === 'Enter') {
                              store.patchMark(sessionId, mark.id, { note: noteDraft })
                              setNoteFor(null)
                            } else if (event.key === 'Escape') setNoteFor(null)
                          },
                        }),
                        React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'dcm-btn',
                            onClick: () => {
                              store.patchMark(sessionId, mark.id, { note: noteDraft })
                              setNoteFor(null)
                            },
                          },
                          '保存',
                        ),
                      )
                    : (mark.note ?? '') !== ''
                      ? React.createElement('div', { className: 'dcm-note' }, mark.note)
                      : null,
                )
              }),
            )

      const manager = managing
        ? React.createElement(
            'div',
            { className: 'dcm-manager' },
            React.createElement('div', { className: 'dcm-manager-title' }, '标签'),
            ...tags.map((tag) =>
              React.createElement(
                'div',
                { key: tag.id, className: 'dcm-manager-row' },
                React.createElement('i', { className: 'dcm-dot', style: { background: paletteOf(tag.color).dot } }),
                editingId === tag.id
                  ? React.createElement('input', {
                      className: 'dcm-note-input',
                      value: editingName,
                      autoFocus: true,
                      maxLength: 24,
                      onChange: (event) => setEditingName(event.target.value),
                      onBlur: commitRename,
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') commitRename()
                        else if (event.key === 'Escape') setEditingId(null)
                      },
                    })
                  : React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'dcm-manager-name',
                        title: '改名',
                        onClick: () => {
                          setEditingId(tag.id)
                          setEditingName(tag.name)
                        },
                      },
                      tag.name,
                    ),
                React.createElement(
                  'select',
                  {
                    className: 'dcm-color',
                    value: tag.color,
                    title: '换个颜色',
                    onChange: (event) => {
                      store.recolorTag(tag.id, event.target.value)
                      syncHighlightStyles(store.getSnapshot().tags)
                    },
                  },
                  ...PALETTE.map((entry) =>
                    React.createElement('option', { key: entry.id, value: entry.id }, entry.id),
                  ),
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dcm-mini',
                    title: '删除这个标签（它的标记会转到第一个标签）',
                    onClick: () => {
                      if ((counted.get(tag.id) ?? 0) > 0 && !window.confirm(`「${tag.name}」还有 ${counted.get(tag.id)} 条标记，删除后它们会转到别的标签。继续？`)) return
                      store.removeTag(tag.id)
                      refreshHighlights(sessionId, null)
                    },
                  },
                  '×',
                ),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dcm-manager-row' },
              React.createElement('input', {
                className: 'dcm-note-input',
                value: draftTag,
                placeholder: '新标签名',
                maxLength: 24,
                onChange: (event) => setDraftTag(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  if (store.addTag(draftTag) !== null) setDraftTag('')
                },
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dcm-btn',
                  onClick: () => {
                    if (store.addTag(draftTag) !== null) setDraftTag('')
                  },
                },
                '添加',
              ),
            ),
          )
        : null

      return React.createElement(
        'div',
        { className: 'dcm-root', [PANEL_ATTR]: '' },
        header,
        filters,
        list,
        manager,
        notice === '' ? null : React.createElement('div', { className: 'dcm-notice' }, notice),
      )
    }
    //#endregion

    //#region css
    function baseCss() {
      return `
.dcm-root{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0;height:100%;width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary,#1f2328);background:transparent;}
.dcm-header{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;}
.dcm-title{font-weight:600;font-size:13px;}
.dcm-count{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);min-width:14px;}
.dcm-search{flex:1 1 auto;min-width:0;height:26px;padding:0 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.03));color:inherit;font-size:12px;outline:none;}
.dcm-search:focus{border-color:var(--dsw-alias-brand-primary,#3b82f6);}
.dcm-icon{width:26px;height:26px;flex:0 0 auto;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font-size:13px;line-height:1;}
.dcm-icon:hover{background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.05));}
.dcm-icon-on{color:var(--dsw-alias-brand-primary,#3b82f6);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.05));}
.dcm-filters{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;}
.dcm-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;cursor:pointer;white-space:nowrap;}
.dcm-chip:hover{background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.04));}
.dcm-chip-on{color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.24));background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.05));}
.dcm-chip i,.dcm-tag i{width:7px;height:7px;border-radius:50%;flex:0 0 auto;}
.dcm-list{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 8px 12px;display:flex;flex-direction:column;gap:2px;}
.dcm-item{position:relative;padding:8px 9px;border-radius:9px;cursor:pointer;border:1px solid transparent;}
.dcm-item:hover{background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.04));border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.08));}
.dcm-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-2px;}
.dcm-item-top{display:flex;align-items:center;gap:7px;margin-bottom:4px;}
.dcm-tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);}
.dcm-meta{font-size:10px;color:var(--dsw-alias-label-secondary,#9ca3af);}
.dcm-item-actions{margin-left:auto;display:none;gap:2px;}
.dcm-item:hover .dcm-item-actions{display:inline-flex;}
.dcm-mini{width:20px;height:20px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font-size:12px;line-height:1;}
.dcm-mini:hover{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,#1f2328);}
.dcm-quote{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#4b5563);white-space:pre-wrap;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;}
.dcm-quote-code{font-family:ui-monospace,SFMono-Regular,"Cascadia Code",Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.035));border-radius:6px;padding:5px 7px;}
.dcm-note{margin-top:5px;font-size:11px;color:var(--dsw-alias-state-warn-primary,#b45309);background:rgba(245,158,11,.10);border-radius:6px;padding:4px 6px;}
.dcm-note-edit{display:flex;gap:6px;margin-top:6px;}
.dcm-note-input{flex:1 1 auto;min-width:0;height:24px;padding:0 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.03));color:inherit;font-size:12px;outline:none;}
.dcm-note-input:focus{border-color:var(--dsw-alias-brand-primary,#3b82f6);}
.dcm-btn{height:24px;padding:0 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#1f2328);font-size:12px;cursor:pointer;}
.dcm-btn:hover{border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.24));}
.dcm-empty{padding:18px 14px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1.6;}
.dcm-empty-hint{margin-top:6px;color:var(--dsw-alias-label-secondary,#9ca3af);font-size:11.5px;}
.dcm-manager{border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.10));padding:8px 12px 10px;display:flex;flex-direction:column;gap:5px;max-height:42%;overflow-y:auto;}
.dcm-manager-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280);}
.dcm-manager-row{display:flex;align-items:center;gap:6px;}
.dcm-manager-name{flex:1 1 auto;text-align:left;background:transparent;border:0;color:inherit;font-size:12px;cursor:text;padding:2px 0;}
.dcm-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}
.dcm-color{height:22px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:transparent;color:inherit;font-size:11px;}
.dcm-notice{position:sticky;bottom:0;margin:0 10px 10px;padding:7px 9px;border-radius:8px;background:rgba(245,158,11,.14);color:var(--dsw-alias-label-primary,#1f2328);font-size:11.5px;line-height:1.5;}
[${TOOLBAR_ATTR}],[${TIP_ATTR}]{--dcm-pop-bg:#232324;--dcm-pop-fg:#ececee;--dcm-pop-fg-dim:#c6c6cd;--dcm-pop-fg-faint:#a2a2aa;--dcm-pop-line:rgba(255,255,255,.13);--dcm-pop-hover:rgba(255,255,255,.09);}
/* The two floating surfaces are painted #232324 on purpose, in both themes, so
   their foregrounds are a fixed light palette tuned against that one background. */
[${TOOLBAR_ATTR}]{position:fixed;z-index:2147483002;display:flex;align-items:center;gap:3px;padding:4px;border-radius:10px;background:var(--dcm-pop-bg);border:1px solid var(--dcm-pop-line);box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:12px;color:var(--dcm-pop-fg);}
.dcm-toolbar-label{padding:0 4px 0 6px;color:var(--dcm-pop-fg-faint);font-size:11px;white-space:nowrap;}
.dcm-toolbar-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:7px;border:1px solid transparent;background:transparent;color:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}
.dcm-toolbar-tag:hover{background:var(--dcm-pop-hover);border-color:var(--dcm-pop-line);}
.dcm-toolbar-tag i{width:7px;height:7px;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35);}
.dcm-toolbar-add{width:24px;height:24px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dcm-pop-fg-dim);cursor:pointer;font-size:13px;}
.dcm-toolbar-add:hover{background:var(--dcm-pop-hover);color:var(--dcm-pop-fg);}
.dcm-toolbar-input{width:110px;height:24px;padding:0 7px;border-radius:7px;border:1px solid #4d93f8;background:rgba(255,255,255,.07);color:var(--dcm-pop-fg);font-size:12px;outline:none;}
.dcm-toolbar-input::placeholder{color:var(--dcm-pop-fg-faint);}
/* Edge rail: one 18x2 deep-blue bar per mark, 10px pitch, right-aligned — the
   same shape as the shell's turn ticks, so it reads as part of the transcript. */
[${RAIL_ATTR}]{position:fixed;z-index:2147482980;display:flex;flex-direction:column;align-items:flex-end;width:28px;padding:2px 0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}
[${RAIL_ATTR}]::-webkit-scrollbar{display:none}
.dcm-rail-bar{position:relative;flex:0 0 auto;width:100%;height:10px;padding:0;margin:0;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:flex-end;}
.dcm-rail-bar::after{content:"";display:block;width:18px;height:2px;border-radius:2px;background:#1e3a8a;opacity:.9;transform-origin:100% 50%;transition:width .14s,opacity .14s,background-color .14s;}
[${RAIL_ATTR}][data-tone="dark"] .dcm-rail-bar::after{background:#7aa2ff;opacity:.85;}
.dcm-rail-bar:hover::after,.dcm-rail-bar:focus-visible::after{width:25px;opacity:1;background:#1d4ed8;}
[${RAIL_ATTR}][data-tone="dark"] .dcm-rail-bar:hover::after{background:#a9c8ff;}
.dcm-rail-bar:focus-visible{outline:2px solid #2563eb;outline-offset:2px;border-radius:5px;}
[${TIP_ATTR}]{position:fixed;z-index:2147483003;display:none;max-width:320px;padding:7px 9px;border-radius:9px;background:var(--dcm-pop-bg);border:1px solid var(--dcm-pop-line);box-shadow:0 12px 30px rgba(0,0,0,.5);font-size:12px;line-height:1.45;color:var(--dcm-pop-fg);pointer-events:none;}
.dcm-tip-tag{display:flex;align-items:center;gap:5px;font-weight:600;font-size:11px;margin-bottom:3px;color:var(--dcm-pop-fg);}
.dcm-tip-tag i{width:7px;height:7px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.35);}
.dcm-tip-quote{white-space:pre-wrap;word-break:break-word;color:var(--dcm-pop-fg-dim);font-size:11.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.dcm-tip-quote-code{font-family:ui-monospace,SFMono-Regular,"Cascadia Code",Consolas,monospace;font-size:11px;color:var(--dcm-pop-fg);}
.dcm-tip-meta{margin-top:4px;font-size:10px;color:var(--dcm-pop-fg-faint);}
.dcm-tip-notice{font-size:11.5px;line-height:1.5;color:var(--dcm-pop-fg);}
${CSS_HIGHLIGHT_BASE}
@keyframes dsh-cm-flash{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.02)}}
`
    }

    const CSS_HIGHLIGHT_BASE = `::highlight(${HOVER_HIGHLIGHT}){background-color:rgba(59,130,246,.30);text-decoration:underline 1px rgba(59,130,246,.9);}`
    //#endregion

    //#region plugin
    /**
     * Required browser services: the slot registry, the right column, its tab types
     * and the Session handles that page history in for a far-away mark.
     */
    const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'sessions']

    function apply(ctx) {
      const disposers = []
      ctxRef = ctx
      try {
        ensureStyles()
        syncHighlightStyles(store.getSnapshot().tags)

        // 1. Declare the tab type. The kind is free-form: nothing shipped holds it.
        //    The guide entry is the way back in after the tab is closed; the shipped
        //    terminal type registers one too, so this never becomes the column's
        //    only entry (which would take over its default page).
        disposers.push(
          ctx.effect(
            () =>
              ctx.sidebarRightTabs.register({
                id: TYPE_ID,
                kind: KIND,
                title: () => '标记',
                keepMounted: true,
                guide: [
                  {
                    id: 'open',
                    order: 40,
                    title: () => '标记',
                    description: () => '选中过的代码段和句子都收在这里，点一下跳回去',
                  },
                ],
              }),
            'dsh-code-marks: tab type',
          ),
        )

        // 2. The body, dispatched by the type id above.
        disposers.push(
          ctx.effect(
            () =>
              ctx.slots.inject('sidebar.right.pane.tab', () =>
                ctx.slots.register(
                  {
                    name: 'sidebar.right.pane.tab',
                    key: TYPE_ID,
                    inject: (sessionId) => ({ sessionId }),
                  },
                  Panel,
                ),
              ),
            'dsh-code-marks: tab body',
          ),
        )

        // 3. The chip title, so a restored tab shows the product name, not a stale one.
        disposers.push(
          ctx.effect(
            () =>
              ctx.slots.inject('sidebar.right.pane.tab.title', () =>
                ctx.slots.register(
                  {
                    name: 'sidebar.right.pane.tab.title',
                    key: TYPE_ID,
                  },
                  function MarksTitle() {
                    return React.createElement('span', { className: 'dcm-chip-title' }, '标记')
                  },
                ),
              ),
            'dsh-code-marks: tab title',
          ),
        )

        // 4. Selection toolbar.
        const detachToolbar = createSelectionToolbar(ctx)
        disposers.push(() => detachToolbar())

        // 4b. The deep-blue bar rail on the conversation's upper right edge: jump
        //     to a mark without opening the right column.
        const rail = createMarkRail(ctx)
        railRef = rail
        disposers.push(() => rail.dispose())

        // 5. Keep highlights correct as the transcript streams, scrolls and re-renders.
        let timer = 0
        let currentSession = undefined
        const rehighlight = () => {
          const sessionId = ctx.sidebarRight?.mounted?.getSnapshot?.()
          if (sessionId !== currentSession) currentSession = sessionId
          if (sessionId) refreshHighlights(sessionId, null)
          railRef?.refresh()
        }
        const observer = new MutationObserver(() => {
          window.clearTimeout(timer)
          timer = window.setTimeout(rehighlight, 240)
        })
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        disposers.push(() => {
          observer.disconnect()
          window.clearTimeout(timer)
        })

        let unsubscribeTags = null
        if (typeof ctx.sidebarRight?.mounted?.subscribe === 'function') {
          unsubscribeTags = ctx.sidebarRight.mounted.subscribe(() => {
            rehighlight()
            const sessionId = ctx.sidebarRight.mounted.getSnapshot()
            if (sessionId) store.ensureSession(sessionId)
          })
          disposers.push(() => unsubscribeTags?.())
        }

        let unsubscribeStore = store.subscribe(() => rehighlight())
        disposers.push(() => {
          unsubscribeStore()
        })

        const sessionAtStart = ctx.sidebarRight?.mounted?.getSnapshot?.()
        if (sessionAtStart) store.ensureSession(sessionAtStart)
        rehighlight()

        ctx.effect(
          () => () => {
            for (const dispose of disposers.reverse()) {
              try {
                dispose()
              } catch (error) {
                console.warn('[dsh-code-marks] dispose failed:', error)
              }
            }
            if (canHighlight()) {
              for (const name of [...CSS.highlights.keys()]) {
                if (name.startsWith(HIGHLIGHT_PREFIX)) CSS.highlights.delete(name)
              }
            }
            document.getElementById(STYLE_ID)?.remove()
            document.getElementById(`${STYLE_ID}-tags`)?.remove()
          },
          'dsh-code-marks: lifetime',
        )
      } catch (error) {
        console.error('[dsh-code-marks] activation failed:', error)
        for (const dispose of disposers.reverse()) {
          try {
            dispose()
          } catch {
            /* ignore */
          }
        }
      }
    }
    //#endregion

    return {
      name: 'code-marks',
      inject,
      apply,
      // Exposed for the harness in tools/: pure helpers over a synthetic transcript.
      __test: {
        locateQuote,
        collapseWhitespace,
        stripWhitespace,
        captureSelection,
        resolveMark,
        findRow,
        rowOf,
        isMarkableRow,
        rangeAtOffsets,
        rowText,
        jumpToMark,
        refreshHighlights,
        createMarkRail,
        rail: () => railRef,
        store,
      },
    }
  },
})
