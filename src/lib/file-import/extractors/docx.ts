interface MammothModule {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

export async function extractDocxFile(file: File) {
  const mammoth = await import('mammoth') as MammothModule
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value ?? ''
}
