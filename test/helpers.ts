import type { Document } from '@shared/types'

export function makeDoc(over: Partial<Document> = {}): Document {
  const ts = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'Dokument',
    category_id: 'sonstiges',
    status: 'done',
    status_message: null,
    ocr_text: null,
    ocr_source: null,
    relative_path: 'Dokumente/x.pdf',
    file_hash: crypto.randomUUID(),
    original_filename: 'x.pdf',
    mime_type: 'application/pdf',
    doc_date: null,
    sender: null,
    amount: null,
    classifier_source: null,
    classifier_response: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over
  }
}
