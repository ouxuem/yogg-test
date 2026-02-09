export type ImportFileType = 'txt' | 'markdown' | 'docx' | 'doc' | 'pdf' | 'unknown'

export type UploadErrorCode
  = | 'ERR_UNSUPPORTED_TYPE'
    | 'ERR_DOC_LEGACY_NOT_SUPPORTED'
    | 'ERR_FILE_TOO_LARGE'
    | 'ERR_FILE_READ_FAILED'
    | 'ERR_DOCX_PARSE_FAILED'
    | 'ERR_PDF_PARSE_FAILED'
    | 'ERR_PDF_NO_TEXT_LAYER'
    | 'ERR_EMPTY_EXTRACTED_TEXT'
    | 'ERR_TEXT_TOO_LONG'

export interface UploadError {
  code: UploadErrorCode
  message: string
}

export type ExtractTextResult
  = | {
    ok: true
    fileName: string
    detectedType: Exclude<ImportFileType, 'unknown' | 'doc'>
    text: string
    warnings: string[]
  }
  | {
    ok: false
    error: UploadError
  }
