/**
 * The app's icons: SVG shapes on a 24-pixel grid, drawn with a 2-pixel stroke in the text's colour (`Icon`).
 *
 * Most are Lucide's (https://lucide.dev, lucide-static 1.70.0, ISC licence: LICENSE-lucide beside this file), copied
 * as data so the bundle carries only these. Our own, drawn on the same grid, are marked *ours*. To add one, copy its
 * shape from Lucide's icon-nodes.json, or draw it on the grid, and give it a name by what it means here.
 */

export type IconShape = readonly (readonly ['path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse', Readonly<Record<string, string>>])[]

export const ICONS = {
  // Views
  session: [['rect', { width: '7', height: '7', x: '3', y: '3', rx: '1' }], ['rect', { width: '7', height: '7', x: '14', y: '3', rx: '1' }], ['rect', { width: '7', height: '7', x: '14', y: '14', rx: '1' }], ['rect', { width: '7', height: '7', x: '3', y: '14', rx: '1' }]],
  arrangement: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M21 9H3' }], ['path', { d: 'M21 15H3' }]],
  wave: [['path', { d: 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2' }]],
  library: [['path', { d: 'm16 6 4 14' }], ['path', { d: 'M12 6v14' }], ['path', { d: 'M8 8v12' }], ['path', { d: 'M4 4v16' }]],
  tracks: [['path', { d: 'M3 5h.01' }], ['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 19h.01' }], ['path', { d: 'M8 5h13' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 19h13' }]],
  // Regions
  'panel-left': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M9 3v18' }]],
  'panel-bottom': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M3 15h18' }]],
  'panel-right': [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M15 3v18' }]],
  maximize: [['path', { d: 'M15 3h6v6' }], ['path', { d: 'm21 3-7 7' }], ['path', { d: 'm3 21 7-7' }], ['path', { d: 'M9 21H3v-6' }]],
  restore: [['path', { d: 'm14 10 7-7' }], ['path', { d: 'M20 10h-6V4' }], ['path', { d: 'm3 21 7-7' }], ['path', { d: 'M4 14h6v6' }]],
  // Transport
  play: [['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }]],
  stop: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }]],
  record: [['circle', { cx: '12', cy: '12', r: '10' }]],
  loop: [['path', { d: 'm17 2 4 4-4 4' }], ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }], ['path', { d: 'm7 22-4-4 4-4' }], ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }]],
  metronome: [['path', { d: 'M12 11.4V9.1' }], ['path', { d: 'm12 17 6.59-6.59' }], ['path', { d: 'm15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2' }], ['circle', { cx: '20', cy: '9', r: '2' }]],
  // Editing and menus
  undo: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }]],
  redo: [['path', { d: 'm15 14 5-5-5-5' }], ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }]],
  edit: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
  settings: [['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  more: [['circle', { cx: '12', cy: '12', r: '1' }], ['circle', { cx: '19', cy: '12', r: '1' }], ['circle', { cx: '5', cy: '12', r: '1' }]],
  close: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  add: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  grip: [['circle', { cx: '9', cy: '12', r: '1' }], ['circle', { cx: '9', cy: '5', r: '1' }], ['circle', { cx: '9', cy: '19', r: '1' }], ['circle', { cx: '15', cy: '12', r: '1' }], ['circle', { cx: '15', cy: '5', r: '1' }], ['circle', { cx: '15', cy: '19', r: '1' }]],
  'move-horizontal': [['path', { d: 'm18 8 4 4-4 4' }], ['path', { d: 'M2 12h20' }], ['path', { d: 'm6 8-4 4 4 4' }]],
  'move-vertical': [['path', { d: 'M12 2v20' }], ['path', { d: 'm8 18 4 4 4-4' }], ['path', { d: 'm8 6 4-4 4 4' }]],
  'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
  'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  eye: [['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  'eye-off': [['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }], ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }], ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }], ['path', { d: 'm2 2 20 20' }]],
  reset: [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
  // Library
  instrument: [['path', { d: 'M10 13v4' }], ['path', { d: 'M14 13v4' }], ['path', { d: 'M18 13v4' }], ['path', { d: 'M2 13h20' }], ['path', { d: 'M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z' }], ['path', { d: 'M6 13v4' }]],
  'audio-effect': [['path', { d: 'M2 10v3' }], ['path', { d: 'M6 6v11' }], ['path', { d: 'M10 3v18' }], ['path', { d: 'M14 8v7' }], ['path', { d: 'M18 5v13' }], ['path', { d: 'M22 10v3' }]],
  'note-effect': [['path', { d: 'M16 5H3' }], ['path', { d: 'M11 12H3' }], ['path', { d: 'M11 19H3' }], ['path', { d: 'M21 16V5' }], ['circle', { cx: '18', cy: '16', r: '3' }]],
  'midi-clip': [['path', { d: 'M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35' }], ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }], ['path', { d: 'M8 20v-7l3 1.474' }], ['circle', { cx: '6', cy: '20', r: '2' }]],
  'audio-clip': [['path', { d: 'M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343' }], ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }], ['path', { d: 'M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0' }]],
  sample: [['path', { d: 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2' }]],
  module: [['path', { d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' }], ['path', { d: 'm3.3 7 8.7 5 8.7-5' }], ['path', { d: 'M12 22V12' }]],
  project: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  factory: [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
  warning: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
  // Node categories
  'category-sources': [['path', { d: 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2' }]],
  'category-controls': [['path', { d: 'M10 5H3' }], ['path', { d: 'M12 19H3' }], ['path', { d: 'M14 3v4' }], ['path', { d: 'M16 17v4' }], ['path', { d: 'M21 12h-9' }], ['path', { d: 'M21 19h-5' }], ['path', { d: 'M21 5h-7' }], ['path', { d: 'M8 10v4' }], ['path', { d: 'M8 12H3' }]],
  'category-indicators': [['path', { d: 'm12 14 4-4' }], ['path', { d: 'M3.34 19a10 10 0 1 1 17.32 0' }]],
  'category-modulation': [['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }]],
  'category-math': [['path', { d: 'M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2' }]],
  'category-logic': [['rect', { x: '14', y: '14', width: '4', height: '6', rx: '2' }], ['rect', { x: '6', y: '4', width: '4', height: '6', rx: '2' }], ['path', { d: 'M6 20h4' }], ['path', { d: 'M14 10h4' }], ['path', { d: 'M6 14h2v6' }], ['path', { d: 'M14 4h2v6' }]],
  'category-analysis': [['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }], ['path', { d: 'M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7' }]],
  'category-effects': [['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }], ['path', { d: 'M20 2v4' }], ['path', { d: 'M22 4h-4' }], ['circle', { cx: '4', cy: '20', r: '2' }]],
  'category-routing': [['circle', { cx: '6', cy: '19', r: '3' }], ['path', { d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' }], ['circle', { cx: '18', cy: '5', r: '3' }]],
  'category-modules': [['path', { d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z' }], ['path', { d: 'm7 16.5-4.74-2.85' }], ['path', { d: 'm7 16.5 5-3' }], ['path', { d: 'M7 16.5v5.17' }], ['path', { d: 'M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z' }], ['path', { d: 'm17 16.5-5-3' }], ['path', { d: 'm17 16.5 4.74-2.85' }], ['path', { d: 'M17 16.5v5.17' }], ['path', { d: 'M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z' }], ['path', { d: 'M12 8 7.26 5.15' }], ['path', { d: 'm12 8 4.74-2.85' }], ['path', { d: 'M12 13.5V8' }]],
  // ours: a low-pass response, flat then falling
  'category-filters': [['path', { d: 'M2 9h9c3 0 5 1.5 6.5 4.5L21 20' }]],
  // Switching and routing (the engine PI)
  power: [['path', { d: 'M12 2v10' }], ['path', { d: 'M18.4 6.6a9 9 0 1 1-12.77.04' }]],
  sleep: [['path', { d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401' }]],
  dormant: [['path', { d: 'M10.1 2.182a10 10 0 0 1 3.8 0' }], ['path', { d: 'M13.9 21.818a10 10 0 0 1-3.8 0' }], ['path', { d: 'M17.609 3.721a10 10 0 0 1 2.69 2.7' }], ['path', { d: 'M2.182 13.9a10 10 0 0 1 0-3.8' }], ['path', { d: 'M20.279 17.609a10 10 0 0 1-2.7 2.69' }], ['path', { d: 'M21.818 10.1a10 10 0 0 1 0 3.8' }], ['path', { d: 'M3.721 6.391a10 10 0 0 1 2.7-2.69' }], ['path', { d: 'M6.391 20.279a10 10 0 0 1-2.69-2.7' }]],
  split: [['path', { d: 'M16 3h5v5' }], ['path', { d: 'M8 3H3v5' }], ['path', { d: 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3' }], ['path', { d: 'm15 9 6-6' }]],
  merge: [['path', { d: 'm8 6 4-4 4 4' }], ['path', { d: 'M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22' }], ['path', { d: 'm20 22-5-5' }]],
  modulation: [['circle', { cx: '19', cy: '5', r: '2' }], ['circle', { cx: '5', cy: '19', r: '2' }], ['path', { d: 'M5 17A12 12 0 0 1 17 5' }]],
  link: [['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }], ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]],
  unlink: [['path', { d: 'm18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71' }], ['path', { d: 'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71' }], ['line', { 'x1': '8', 'x2': '8', 'y1': '2', 'y2': '5' }], ['line', { 'x1': '2', 'x2': '5', 'y1': '8', 'y2': '8' }], ['line', { 'x1': '16', 'x2': '16', 'y1': '19', 'y2': '22' }], ['line', { 'x1': '19', 'x2': '22', 'y1': '16', 'y2': '16' }]],
  // ours: a signal going round a part
  bypass: [['path', { d: 'M2 17h3' }], ['path', { d: 'M19 17h3' }], ['rect', { x: '8', y: '13', width: '8', height: '8', rx: '1' }], ['path', { d: 'M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9' }]],
} as const satisfies Record<string, IconShape>

export type IconName = keyof typeof ICONS
