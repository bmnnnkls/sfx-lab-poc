/** Browser file dialogs: saving a download and picking a file. No project knowledge in here. */

export const downloadFile = (fileName: string, mimeType: string, bytes: Uint8Array): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Opens the file picker; resolves with the file's bytes, or null if the user cancels. */
export const pickFile = (accept: string): Promise<Uint8Array | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      resolve(file ? new Uint8Array(await file.arrayBuffer()) : null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
