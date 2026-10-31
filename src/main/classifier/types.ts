export interface DeadlineHint {
  type: string
  due_date: string | null
  amount: number | null
  notice_days: number | null
  description: string
}

export interface ClassificationResult {
  category_id: string
  confidence: number
  title: string | null
  sender: string | null
  doc_date: string | null
  amount: number | null
  deadlines: DeadlineHint[]
  source: 'ollama' | 'rules'
  raw_response?: string
  prompt?: string
}

export interface Classifier {
  classify(text: string, signal?: AbortSignal): Promise<ClassificationResult>
}
