import type { ExtractTextResult, UploadError, UploadErrorCode } from './types'
import { detectFileType } from './detect-file-type'
import { extractDocxFile } from './extractors/docx'
import { extractMarkdownFile } from './extractors/markdown'
import { extractPdfFile } from './extractors/pdf'
import { extractTextFile } from './extractors/text'
import { normalizeExtractedText } from './normalize'

export const IMPORT_FILE_ACCEPT = '.txt,.md,.markdown,.doc,.docx,.pdf'
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_UPLOAD_TEXT_LENGTH = 2_000_000

function createUploadError(code: UploadErrorCode, message: string): UploadError {
  return { code, message }
}

function fail(code: UploadErrorCode, message: string): ExtractTextResult {
  return {
    ok: false,
    error: createUploadError(code, message),
  }
}

function unsupportedTypeMessage() {
  return 'Unsupported file type. Use txt, md, markdown, docx, or text-based pdf.'
}

function fileTooLargeMessage() {
  return 'File is too large. Maximum supported size is 10MB.'
}

function emptyTextMessage() {
  return 'No readable text found in file.'
}

function textTooLongMessage() {
  return 'Extracted text is too long for analysis input.'
}

export async function extractTextFromFile(file: File): Promise<ExtractTextResult> {
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES)
    return fail('ERR_FILE_TOO_LARGE', fileTooLargeMessage())

  const detectedType = detectFileType(file)
  if (detectedType === 'unknown')
    return fail('ERR_UNSUPPORTED_TYPE', unsupportedTypeMessage())
  if (detectedType === 'doc') {
    return fail(
      'ERR_DOC_LEGACY_NOT_SUPPORTED',
      'Legacy .doc is not supported. Please convert it to .docx.',
    )
  }

  let rawText = ''
  try {
    if (detectedType === 'txt')
      rawText = await extractTextFile(file)
    else if (detectedType === 'markdown')
      rawText = await extractMarkdownFile(file)
    else if (detectedType === 'docx')
      rawText = await extractDocxFile(file)
    else if (detectedType === 'pdf')
      rawText = await extractPdfFile(file)
  }
  catch {
    if (detectedType === 'docx')
      return fail('ERR_DOCX_PARSE_FAILED', 'Failed to parse .docx content.')
    if (detectedType === 'pdf')
      return fail('ERR_PDF_PARSE_FAILED', 'Failed to parse PDF content.')
    return fail('ERR_FILE_READ_FAILED', 'Failed to read file.')
  }

  const text = normalizeExtractedText(rawText)
  if (detectedType === 'pdf' && text.length < 20) {
    return fail(
      'ERR_PDF_NO_TEXT_LAYER',
      'This PDF appears to be image/scanned. Text-based PDF is required.',
    )
  }
  if (text.length === 0)
    return fail('ERR_EMPTY_EXTRACTED_TEXT', emptyTextMessage())
  if (text.length > MAX_UPLOAD_TEXT_LENGTH)
    return fail('ERR_TEXT_TOO_LONG', textTooLongMessage())

  return {
    ok: true,
    fileName: file.name,
    detectedType,
    text,
    warnings: [],
  }
}
