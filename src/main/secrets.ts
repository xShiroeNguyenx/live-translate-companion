import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function secretsFile(): string {
  return join(app.getPath('userData'), 'secrets.bin')
}

export function setApiKey(key: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  writeFileSync(secretsFile(), safeStorage.encryptString(key.trim()))
  return true
}

export function hasApiKey(): boolean {
  return existsSync(secretsFile())
}

export function getApiKey(): string | null {
  try {
    if (!existsSync(secretsFile())) return null
    return safeStorage.decryptString(readFileSync(secretsFile()))
  } catch {
    return null
  }
}
