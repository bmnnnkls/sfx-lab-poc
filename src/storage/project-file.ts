import { type Project, serializeProject } from '@core'

const FILE_EXTENSION = '.sfxlab.json'

/** `My Cool Project!` -> `my-cool-project.sfxlab.json` */
export const projectFileName = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'project'}${FILE_EXTENSION}`
}

/** Saves the project as a file through the browser's normal download flow. */
export const downloadProjectFile = (project: Project): void => {
  const blob = new Blob([serializeProject(project, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = projectFileName(project.name)
  link.click()
  URL.revokeObjectURL(url)
}

/** Opens the file picker; resolves with the file's text, or null if the user cancels. */
export const pickProjectFile = (): Promise<string | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      resolve(file ? file.text() : null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
