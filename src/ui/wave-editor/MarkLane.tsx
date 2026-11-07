import type { WaveView } from '@core'
import { type Subject, type WaveAudio, type WaveSelection, commitRename, useRenameStore, useWaveEditorStore, waveViewOf } from '@state'
import { type RefObject, memo, useEffect, useMemo, useRef, useState } from 'react'
import { ActionMenu, useActionContext } from '../shared/menu'
import { RenameField } from '../shared/RenameField'
import { useThemeColors } from '../theme/theme-colors'
import { currentView } from './current-view'
import type { Marks } from './mark-geometry'
import type { WaveSnap } from './snap'
import { useMarkGestures } from './use-mark-gestures'
import { xOf } from './wave-geometry'
import styles from './WaveEditor.module.css'

/** Under this height (the folded lane) marks are ticks, without names. */
const FOLDED_PX = 12

interface MarkColors {
  readonly text: string
  readonly dim: string
  readonly accent: string
  readonly loop: string
}

const COLORS = ['--text', '--text-dim', '--accent', '--play'] as const

/** A name inside a band, clipped to it. */
const label = (context: CanvasRenderingContext2D, text: string, from: number, to: number, height: number) => {
  if (to - from < 12) return
  context.save()
  context.beginPath()
  context.rect(from, 0, to - from, height)
  context.clip()
  context.fillText(text, from + 4, height / 2)
  context.restore()
}

/** Draws the marks in view: regions and the loop as bands, markers as flags; folded, all as ticks. */
const drawMarks = (context: CanvasRenderingContext2D, view: WaveView, marks: Marks, height: number, colors: MarkColors, selection: WaveSelection | null) => {
  const folded = height < FOLDED_PX
  const band = (from: number, to: number, fill: string, alpha: number) => {
    const [a, b] = [Math.max(-1, xOf(view, from)), Math.min(view.width + 1, xOf(view, to))]
    if (b < 0 || a > view.width) return null
    context.globalAlpha = alpha
    context.fillStyle = fill
    context.fillRect(a, folded ? height / 2 : 0, Math.max(1, b - a), folded ? height / 2 : height)
    context.globalAlpha = 1
    return [a, b] as const
  }
  for (const region of marks.regions) {
    const selected = selection?.channels === 'both' && selection.from === region.from && selection.to === region.to
    const at = band(region.from, region.to, selected ? colors.accent : colors.dim, selected ? 0.45 : 0.2)
    if (!at) continue
    context.fillStyle = colors.dim
    context.fillRect(Math.round(at[0]), 0, 1, height)
    context.fillRect(Math.round(at[1]) - 1, 0, 1, height)
    if (!folded) {
      context.fillStyle = colors.text
      label(context, region.name, at[0], at[1], height)
    }
  }
  if (marks.loop) {
    const at = band(marks.loop.from, marks.loop.to, colors.loop, 0.3)
    if (at) {
      context.fillStyle = colors.loop
      // Brackets at its edges: a line with a foot top and bottom, pointing in.
      const [a, b] = [Math.round(at[0]), Math.round(at[1]) - 1]
      context.fillRect(a, 0, 1, height)
      context.fillRect(b, 0, 1, height)
      if (!folded) {
        context.fillRect(a, 0, 4, 1)
        context.fillRect(a, height - 1, 4, 1)
        context.fillRect(b - 3, 0, 4, 1)
        context.fillRect(b - 3, height - 1, 4, 1)
        context.fillStyle = colors.text
        label(context, 'Loop', at[0], at[1], height)
      }
    }
  }
  for (const marker of marks.markers) {
    const x = Math.round(xOf(view, marker.frame))
    if (x < -200 || x > view.width) continue
    context.fillStyle = colors.text
    context.fillRect(x, 0, 1, height)
    if (folded) continue
    // A flag: a small square at the top, the name beside it.
    context.fillRect(x, 0, 5, 5)
    context.fillText(marker.name, x + 7, height / 2)
  }
}

/** How the lane's group is named for assistive technology: what it holds. */
const summaryOf = (marks: Marks) => {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return `Marks: ${count(marks.markers.length, 'marker')}, ${count(marks.regions.length, 'region')}${marks.loop ? ', a loop' : ''}`
}

/**
 * The mark lane, under the ruler: the sample's regions and loop as bands and its markers as flags, on one canvas drawn
 * like the ruler (from the view store, in an animation frame, on zoom, scroll, resize and selection), so React renders
 * it only when the marks change. It is one menu trigger whose subject is what the pointer is on (`markAt`), and takes
 * the focus on a press, so a mark's verbs (Delete, F2) and the palette act on it. A rename shows a field over the mark.
 */
export const MarkLane = memo(({ wave, detail, marks, snap }: { wave: WaveAudio; detail: RefObject<HTMLDivElement | null>; marks: Marks; snap: WaveSnap }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const theme = useThemeColors(COLORS)
  const { viewKey, sampleId, pane } = wave
  const [subject, setSubject] = useState<Subject>({ kind: 'sample-selection', sampleId, pane })
  const gestures = useMarkGestures(wave, setSubject, snap)
  const context = useActionContext()
  const renaming = useRenameStore((state) => (state.renaming?.origin === context.origin ? state.renaming.subject : null))

  useEffect(() => {
    let request = 0
    const draw = () => {
      request = 0
      const element = canvas.current
      const drawing = element?.getContext('2d')
      if (!element || !drawing) return
      const ratio = window.devicePixelRatio || 1
      const { clientWidth: width, clientHeight: height } = element
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      drawing.setTransform(ratio, 0, 0, ratio, 0, 0)
      const style = getComputedStyle(element)
      drawing.font = `10px ${style.fontFamily}`
      drawing.textBaseline = 'middle'
      const colors = { text: theme['--text'], dim: theme['--text-dim'], accent: theme['--accent'], loop: theme['--play'] }
      const { selection } = waveViewOf(useWaveEditorStore.getState().views, viewKey)
      drawMarks(drawing, currentView(detail.current, wave), marks, height, colors, selection)
    }
    const schedule = () => {
      if (!request) request = requestAnimationFrame(draw)
    }
    schedule()
    const unsubscribe = useWaveEditorStore.subscribe((state, previous) => {
      if (state.views[viewKey] !== previous.views[viewKey]) schedule()
    })
    const observer = new ResizeObserver(schedule)
    if (canvas.current) observer.observe(canvas.current)
    return () => {
      unsubscribe()
      observer.disconnect()
      if (request) cancelAnimationFrame(request)
    }
  }, [wave, viewKey, detail, marks, theme])

  const named = useMemo(() => {
    // A rename shows in the pane it was asked from.
    if (renaming?.kind === 'sample-marker' && renaming.sampleId === sampleId && renaming.pane === pane) {
      const marker = marks.markers.find((candidate) => candidate.id === renaming.markerId)
      return marker && { subject: renaming, name: marker.name, frame: marker.frame, label: `Name of marker ${marker.name}` }
    }
    if (renaming?.kind === 'sample-region' && renaming.sampleId === sampleId && renaming.pane === pane) {
      const region = marks.regions.find((candidate) => candidate.id === renaming.regionId)
      return region && { subject: renaming, name: region.name, frame: region.from, label: `Name of region ${region.name}` }
    }
    return undefined
  }, [renaming, marks, sampleId, pane])

  return (
    <ActionMenu subject={subject}>
      <div className={styles.markLane} tabIndex={0} role="group" aria-label={summaryOf(marks)} data-testid="mark-lane" {...gestures}>
        <canvas ref={canvas} className={styles.markCanvas} aria-hidden="true" />
        {named && (
          // The lane's own press would take the focus from the field.
          <span className={styles.markRename} style={{ left: Math.max(0, xOf(currentView(detail.current, wave), named.frame)) }} onPointerDown={(event) => event.stopPropagation()}>
            <RenameField
              name={named.name}
              label={named.label}
              select
              onCommit={(typed) => void commitRename(named.subject, typed, context)}
              onDone={() => useRenameStore.getState().stop()}
            />
          </span>
        )}
      </div>
    </ActionMenu>
  )
})
