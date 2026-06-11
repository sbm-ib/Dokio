const KEY_STORAGE = 'paperliss_ek'

async function getKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(KEY_STORAGE)
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))))
  return key
}

export async function encrypt(text: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(text)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const buf = new Uint8Array(12 + cipher.byteLength)
  buf.set(iv, 0)
  buf.set(new Uint8Array(cipher), 12)
  return btoa(String.fromCharCode(...buf))
}

export async function decrypt(enc: string): Promise<string> {
  const key = await getKey()
  const buf = Uint8Array.from(atob(enc), c => c.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12))
  return new TextDecoder().decode(decrypted)
}

export function maskSecu(value: string): string {
  if (value.length < 4) return '•••'
  return '•'.repeat(value.length - 4) + value.slice(-4)
}

export function maskIban(value: string): string {
  const clean = value.replace(/\s/g, '')
  if (clean.length < 8) return '•••'
  return clean.slice(0, 4) + '•'.repeat(Math.max(0, clean.length - 8)) + clean.slice(-4)
}
