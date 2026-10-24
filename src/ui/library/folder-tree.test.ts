import { describe, expect, it } from 'vitest'
import { ancestorsOf, expandedFor, folderRows, ROOT, treeKey } from './folder-tree'

const folder = (id: string, parentId: string | null, trashed = false) => ({ id, name: id.toUpperCase(), parentId, ...(trashed ? { trashed } : {}) })
const item = (id: string, folderId: string | null, trashed = false) => ({ id, folderId, ...(trashed ? { trashed } : {}) })
// a > (b > d), c; e trashed.
const catalog = {
  folders: [folder('a', null), folder('b', 'a'), folder('c', 'a'), folder('d', 'b'), folder('e', null, true)],
  items: [item('1', 'a'), item('2', 'a'), item('3', 'd'), item('4', null), item('5', 'a', true)],
} as unknown as Parameters<typeof folderRows>[0]
const ids = (rows: ReturnType<typeof folderRows>) => rows.map((row) => row.id)

describe('folder tree', () => {
  it('shows the root, then the folders under each expanded row, with levels, counts, and the open path and its folders', () => {
    expect(ids(folderRows(catalog, new Set([ROOT]), null))).toEqual([null, 'a'])
    const rows = folderRows(catalog, new Set([ROOT, 'a', 'b']), 'd')
    expect(ids(rows)).toEqual([null, 'a', 'b', 'd', 'c'])
    expect(rows.map((row) => row.level)).toEqual([1, 2, 3, 4, 3])
    expect(rows.map((row) => row.count)).toEqual([4, 2, 0, 1, 0])
    expect(rows.map((row) => row.essential)).toEqual([true, true, true, true, false])
    expect(folderRows(catalog, new Set([ROOT, 'a', 'b']), 'a').map((row) => row.essential)).toEqual([true, true, true, false, true])
    expect(rows.map((row) => row.hasChildren)).toEqual([true, true, true, false, false])
    expect(rows[3]).toMatchObject({ parentId: 'b', expanded: false })
  })

  it('finds a folder\'s ancestors, nearest first, and survives a cycle', () => {
    expect(ancestorsOf(catalog.folders, 'd')).toEqual(['b', 'a'])
    const cycle = [folder('x', 'y'), folder('y', 'x')] as unknown as typeof catalog.folders
    expect(ancestorsOf(cycle, 'x')).toEqual(['y', 'x'])
  })

  it('moves the open folder with the arrow keys, Home and End', () => {
    const expanded = new Set([ROOT, 'a'])
    const rows = folderRows(catalog, expanded, 'a')
    expect(treeKey(rows, 'a', expanded, 'ArrowDown')).toEqual({ open: 'b' })
    expect(treeKey(rows, 'a', expanded, 'ArrowUp')).toEqual({ open: null })
    expect(treeKey(rows, null, expanded, 'ArrowUp')).toEqual({ open: null })
    expect(treeKey(rows, 'b', expanded, 'End')).toEqual({ open: 'c' })
    expect(treeKey(rows, 'c', expanded, 'Home')).toEqual({ open: null })
    expect(treeKey(rows, 'c', expanded, 'Enter')).toBeUndefined()
  })

  it('expands with Right, then moves into the folder; collapses with Left, then moves to the parent', () => {
    let expanded: ReadonlySet<string> = new Set([ROOT, 'a'])
    const press = (open: string | null, key: string) => treeKey(folderRows(catalog, expanded, open), open, expanded, key)!
    const right = press('b', 'ArrowRight')
    expect(right.open).toBeUndefined()
    expanded = right.expanded!
    expect([...expanded].sort()).toEqual([ROOT, 'a', 'b'].sort())
    expect(press('b', 'ArrowRight')).toEqual({ open: 'd' })
    // A folder without folders in it does nothing.
    expect(press('d', 'ArrowRight')).toEqual({})
    expect(press('d', 'ArrowLeft')).toEqual({ open: 'b' })
    expanded = press('b', 'ArrowLeft').expanded!
    expect(expanded.has('b')).toBe(false)
    expect(press('b', 'ArrowLeft')).toEqual({ open: 'a' })
    expect(press(null, 'ArrowLeft').expanded!.has(ROOT)).toBe(false)
    // The collapsed root has no parent to move to.
    expanded = new Set()
    expect(press(null, 'ArrowLeft')).toEqual({})
  })

  it('expands every sibling with folders in it on *', () => {
    const expanded = new Set([ROOT, 'a'])
    const move = treeKey(folderRows(catalog, expanded, 'c'), 'c', expanded, '*')!
    expect([...move.expanded!].sort()).toEqual([ROOT, 'a', 'b'].sort())
  })

  it('expands the ancestors of a folder opened from elsewhere, and the folder itself when it is clicked', () => {
    const start = new Set([ROOT])
    expect([...expandedFor(catalog.folders, start, 'd')].sort()).toEqual([ROOT, 'a', 'b'].sort())
    expect([...expandedFor(catalog.folders, start, 'b', true)].sort()).toEqual([ROOT, 'a', 'b'].sort())
    // Nothing new to expand keeps the same set, so the tree doesn't render again.
    const all = new Set([ROOT, 'a', 'b'])
    expect(expandedFor(catalog.folders, all, 'd')).toBe(all)
  })
})
