import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  DEFAULT_SUMMARY_MODEL,
  DEFAULT_TTS_VOICE,
  OUTGOING_DEFAULT_TARGET,
  TTS_VOICES,
  VAD_DEFAULT_THRESHOLD_DB
} from '../shared/constants'
import {
  DEFAULT_API_VERSION,
  DEFAULT_LIVE_MODEL,
  normalizeApiVersion
} from '../shared/gemini-api'
import type { AppSettings } from '../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  targetLanguage: 'vi',
  incomingMode: 'speech',
  playbackEnabled: false,
  playbackDeviceId: '',
  playbackDeviceLabel: '',
  monitorEnabled: false,
  vadThresholdDb: VAD_DEFAULT_THRESHOLD_DB,
  micDeviceId: '',
  micDeviceLabel: '',
  outgoingTargetLanguage: OUTGOING_DEFAULT_TARGET,
  outgoingMode: 'ptt',
  outgoingVadThresholdDb: VAD_DEFAULT_THRESHOLD_DB,
  outgoingDeviceId: '',
  outgoingDeviceLabel: '',
  typedSpeechVoice: DEFAULT_TTS_VOICE,
  overlayFontSize: 22,
  overlayOpacity: 0.85,
  overlayClickThrough: false,
  overlayVisible: true,
  autoSaveEnabled: true,
  autoSaveFormat: 'txt',
  autoSaveDir: '',
  meetingContext: '',
  highlightKeywords: '',
  autoSummary: true,
  summaryModel: DEFAULT_SUMMARY_MODEL,
  apiVersion: DEFAULT_API_VERSION,
  liveModel: DEFAULT_LIVE_MODEL,
  monthlyBudgetUsd: 0,
  minimizeToTray: true
}

// giá trị lạ (settings.json sửa tay, bản cũ) → về mặc định
function normalize(s: AppSettings): AppSettings {
  return {
    ...s,
    apiVersion: normalizeApiVersion(s.apiVersion),
    incomingMode: s.incomingMode === 'text' ? 'text' : 'speech',
    typedSpeechVoice: TTS_VOICES.some((v) => v.id === s.typedSpeechVoice)
      ? s.typedSpeechVoice
      : DEFAULT_TTS_VOICE
  }
}

export class SettingsStore extends EventEmitter {
  private settings: AppSettings

  constructor(private file: string = join(app.getPath('userData'), 'settings.json')) {
    super()
    const loaded = { ...DEFAULT_SETTINGS, ...this.load() }
    this.settings = normalize(loaded)
  }

  private load(): Partial<AppSettings> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<AppSettings>
    } catch {
      return {}
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.settings = normalize({ ...this.settings, ...patch })
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('Không lưu được settings:', err)
    }
    const snapshot = this.get()
    this.emit('change', snapshot)
    return snapshot
  }
}
