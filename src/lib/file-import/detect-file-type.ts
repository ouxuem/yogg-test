import type { ImportFileType } from './types'

const EXTENSION_TO_TYPE: Record<string, ImportFileType> = {
  doc: 'doc',
  docx: 'docx',
  markdown: 'markdown',
  md: 'markdown',
  pdf: 'pdf',
  txt: 'txt',
}

const MIME_TO_TYPE: Record<string, ImportFileType> = {
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/markdown': 'markdown',
  'text/plain': 'txt',
  'text/x-markdown': 'markdown',
}

function extensionFromName(fileName: string) {
  const normalized = fileName.trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === normalized.length - 1)
    return ''
  return normalized.slice(dotIndex + 1)
}

function normalizeMime(rawMime: string) {
  return rawMime.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function detectFileType(file: Pick<File, 'name' | 'type'>): ImportFileType {
  const extension = extensionFromName(file.name)
  if (extension in EXTENSION_TO_TYPE)
    return EXTENSION_TO_TYPE[extension] ?? 'unknown'

  const mime = normalizeMime(file.type)
  if (mime in MIME_TO_TYPE)
    return MIME_TO_TYPE[mime] ?? 'unknown'

  return 'unknown'
}
