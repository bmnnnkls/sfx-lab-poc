import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exampleProjects } from '../examples'
import type { Patch } from '../patch'
import { type Project, isAudioContent, projectSampleDependencies, usedSampleIds } from '../project'
import { parseProject } from './project-file'

/** `usedSampleIds` and `projectSampleDependencies` as they were before they were built from `SAMPLE_USES`. */
const legacyUsed = (project: Project): string[] => {
  const found = new Set<string>()
  const fromPatch = (patch: Patch) => {
    for (const node of patch.nodes) if (node.sampleId !== undefined) found.add(node.sampleId)
  }
  fromPatch(project.master.fx)
  for (const group of project.groups ?? []) if (group.bus) fromPatch(group.bus.fx)
  for (const module of project.modules) fromPatch(module.patch)
  for (const track of project.tracks) {
    fromPatch(track.fx)
    if (track.kind === 'instrument') fromPatch(track.patch)
    if (track.kind === 'audio') for (const clip of track.clips) if (clip) found.add(clip.sampleId)
  }
  for (const region of project.arrangement ?? []) if (isAudioContent(region.content)) found.add(region.content.sampleId)
  for (const binding of project.sampleBindings ?? []) if (binding.sampleId) found.add(binding.sampleId)
  return [...found]
}

const legacyDependencies = (project: Project): string[] => {
  const found = new Set(legacyUsed(project))
  for (const preset of project.presets ?? []) for (const binding of preset.samples) if (binding.sampleId) found.add(binding.sampleId)
  for (const revision of project.assetRevisions ?? []) for (const id of revision.payload.sampleIds) found.add(id)
  return [...found]
}

const FIXTURES = new URL('./fixtures/', import.meta.url)
const fixtures = readdirSync(FIXTURES).filter((name) => name.endsWith('.sfxlab.json'))

const projects: Array<{ name: string; project: Project }> = [
  ...fixtures.map((name) => {
    const parsed = parseProject(readFileSync(new URL(name, FIXTURES), 'utf8'))
    if (!parsed.ok) throw new Error(`${name}: ${parsed.error}`)
    return { name, project: parsed.project }
  }),
  ...exampleProjects.map((example) => ({ name: example.id, project: example.create() })),
]

describe('the sample uses, built from one list', () => {
  it.each(projects)('give the same arrays as before for $name', ({ project }) => {
    expect(usedSampleIds(project)).toEqual(legacyUsed(project))
    expect(projectSampleDependencies(project)).toEqual(legacyDependencies(project))
  })
})
