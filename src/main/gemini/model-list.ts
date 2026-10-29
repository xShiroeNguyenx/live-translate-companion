import { GoogleGenAI, type Model } from '@google/genai'
import { pickLiveModels, type GeminiApiVersion, type LiveModelInfo } from '../../shared/gemini-api'

const MAX_MODELS = 1000

// Hỏi Google danh sách model mà API key này dùng được, lọc ra model chạy được Live API
export async function listLiveModels(
  apiKey: string,
  apiVersion: GeminiApiVersion
): Promise<LiveModelInfo[]> {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } })
  const pager = await ai.models.list({ config: { pageSize: 100 } })
  const all: Model[] = []
  for await (const m of pager) {
    all.push(m)
    if (all.length >= MAX_MODELS) break
  }
  return pickLiveModels(all)
}
