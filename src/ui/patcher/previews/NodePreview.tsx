import styles from './NodePreview.module.css'
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, type Preview, type Shape } from './types'

const path = (points: ReadonlyArray<readonly [number, number]>): string => points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

const draw = (shape: Shape, key: number) => {
  switch (shape.kind) {
    case 'line':
      return <path key={key} d={path(shape.points)} className={shape.tone === 'dim' ? styles.dim : styles.main} fill="none" />
    case 'area':
      return (
        <path
          key={key}
          d={`${path(shape.points)} L${shape.points.at(-1)?.[0] ?? 0} ${shape.baseline} L${shape.points[0]?.[0] ?? 0} ${shape.baseline} Z`}
          className={shape.tone === 'dim' ? styles.dim : styles.area}
        />
      )
    case 'rect':
      return (
        <rect
          key={key}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={1.5}
          className={shape.filled ? styles.fill : styles.outline}
        />
      )
    case 'dot':
      return <circle key={key} cx={shape.x} cy={shape.y} r={3.5} className={styles.dot} />
  }
}

interface NodePreviewProps {
  preview: Preview
  /** Something that moves is wired to a parameter: the picture shows the stored value, and says so. */
  moving: boolean
}

/** The small picture on a card: plain shapes in a fixed box, so it needs no measuring and costs nothing when nothing changes. */
export const NodePreview = ({ preview, moving }: NodePreviewProps) => (
  <div className={styles.preview} data-testid="card-picture" data-moving={moving || undefined}>
    <svg viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} role="img" aria-label="What this node does with its settings">
      {preview.shapes.map(draw)}
    </svg>
    {moving && (
      <span className={styles.moving} data-tooltip="A wire carries a moving signal into a setting: the picture shows the stored value, not the movement.">
        ~
      </span>
    )}
  </div>
)
