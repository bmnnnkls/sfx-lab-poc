import { createDemoProject } from '@core'
import { describe, expect, it } from 'vitest'
import { projectExpandedOf, useLibraryStore } from './library-store'
import { useProjectStore } from './project-store'

describe('library store', () => {
  it("keeps what is open under This project for the project it was opened in; another project's starts collapsed", () => {
    useProjectStore.getState().resetProject(createDemoProject())
    const first = useProjectStore.getState().documentEpoch
    useLibraryStore.getState().setProjectExpanded(new Set(['project', 'p:m']))
    expect([...projectExpandedOf(useLibraryStore.getState(), first)]).toEqual(['project', 'p:m'])
    // An edit keeps it; loading a project doesn't.
    useProjectStore.getState().setTempo(100)
    expect(projectExpandedOf(useLibraryStore.getState(), useProjectStore.getState().documentEpoch).size).toBe(2)
    useProjectStore.getState().replaceProject(createDemoProject())
    expect(projectExpandedOf(useLibraryStore.getState(), useProjectStore.getState().documentEpoch).size).toBe(0)
  })
})
