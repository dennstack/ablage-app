import type { ClassificationResult, Classifier } from './types'

export class FallbackClassifier implements Classifier {
  constructor(
    private primary: Classifier,
    private secondary: Classifier
  ) {}

  async classify(text: string, signal?: AbortSignal): Promise<ClassificationResult> {
    try {
      return await this.primary.classify(text, signal)
    } catch (err) {
      console.warn('primary classifier failed, falling back:', err)
      return this.secondary.classify(text, signal)
    }
  }
}
