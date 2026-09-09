import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { fail, readBytes } from './http.ts'

type WebhookConfig = { appId: string; token: string; encodingAesKey: string }
const messageInvalid = (): never => fail(400, 'WECHAT_MESSAGE_INVALID')
const signatureInvalid = (): never => fail(403, 'WECHAT_SIGNATURE_INVALID')
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

function parameters(request: Request) {
  const params = new URL(request.url).searchParams
  const names = new Set<string>()
  for (const [name] of params) {
    if (names.has(name)) return signatureInvalid()
    names.add(name)
  }
  const timestamp = params.get('timestamp') || ''
  const nonce = params.get('nonce') || ''
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300 ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(nonce)) return signatureInvalid()
  return { params, timestamp, nonce }
}

function verifySignature(signature: string | null, values: string[]) {
  if (!signature || !/^[a-f0-9]{40}$/i.test(signature)) return signatureInvalid()
  const expected = createHash('sha1').update([...values].sort().join('')).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return signatureInvalid()
}

function validXmlCodePoint(code: number) {
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff)
}

function decodeXmlText(value: string) {
  if (value.includes('<') || value.includes(']]>')) return messageInvalid()
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return value.replace(/&([^;]*);|&/g, (match, entity: string | undefined) => {
    if (!entity) return messageInvalid()
    if (Object.hasOwn(entities, entity)) return entities[entity]
    const numeric = /^#([0-9]{1,7})$/.exec(entity) || /^#x([a-f0-9]{1,6})$/i.exec(entity)
    if (!numeric) return messageInvalid()
    const code = Number.parseInt(numeric[1], entity[1].toLowerCase() === 'x' ? 16 : 10)
    if (!validXmlCodePoint(code)) return messageInvalid()
    return String.fromCodePoint(code)
  })
}

// WeChat sends a flat <xml> record. A restricted parser avoids DTD/entity
// expansion, recursive structures and duplicate-field ambiguity entirely.
function flatXml(source: string): Record<string, string> {
  if (source.length > 65_536 || /<!DOCTYPE|<!ENTITY/i.test(source)) return messageInvalid()
  for (const char of source) if (!validXmlCodePoint(char.codePointAt(0)!)) return messageInvalid()
  let xml = source.trim()
  if (xml.startsWith('<?xml')) {
    const declaration = /^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>/i.exec(xml)
    if (!declaration) return messageInvalid()
    xml = xml.slice(declaration[0].length).trim()
  }
  if (!xml.startsWith('<xml>') || !xml.endsWith('</xml>')) return messageInvalid()
  const content = xml.slice(5, -6)
  const fields: Record<string, string> = Object.create(null)
  let cursor = 0
  while (cursor < content.length) {
    const whitespace = /^\s*/.exec(content.slice(cursor))![0]
    cursor += whitespace.length
    if (cursor === content.length) break
    const opening = /^<([a-zA-Z_][a-zA-Z0-9_]{0,63})>/.exec(content.slice(cursor))
    if (!opening || Object.hasOwn(fields, opening[1])) return messageInvalid()
    cursor += opening[0].length
    const name = opening[1]
    const closing = `</${name}>`
    let value = ''
    while (!content.startsWith(closing, cursor)) {
      if (content.startsWith('<![CDATA[', cursor)) {
        const end = content.indexOf(']]>', cursor + 9)
        if (end < 0) return messageInvalid()
        value += content.slice(cursor + 9, end)
        cursor = end + 3
      } else {
        const end = content.indexOf('<', cursor)
        if (end < 0 || end === cursor) return messageInvalid()
        value += decodeXmlText(content.slice(cursor, end))
        cursor = end
      }
    }
    fields[name] = value
    cursor += closing.length
  }
  return fields
}

function decrypt(encrypted: string, config: WebhookConfig) {
  if (!encrypted || encrypted.length > 65_536 ||
    !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(encrypted)) return messageInvalid()
  const ciphertext = Buffer.from(encrypted, 'base64')
  if (!ciphertext.length || ciphertext.length % 16 || ciphertext.toString('base64') !== encrypted) return messageInvalid()
  let padded: Buffer
  try {
    const key = Buffer.from(`${config.encodingAesKey}=`, 'base64')
    if (key.length !== 32) return messageInvalid()
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
    // WeChat uses PKCS#7 with a 32-byte block for padding, independently of
    // AES's 16-byte block size. Disable OpenSSL's automatic 16-byte unpadding.
    decipher.setAutoPadding(false)
    padded = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch { return messageInvalid() }
  const padding = padded[padded.length - 1]
  if (padded.length % 32 || padding < 1 || padding > 32 || padding > padded.length ||
    !padded.subarray(padded.length - padding).every(byte => byte === padding)) return messageInvalid()
  const payload = padded.subarray(0, padded.length - padding)
  if (payload.length < 20) return messageInvalid()
  const length = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(16, false)
  if (length > payload.length - 20) return messageInvalid()
  const receivedAppId = payload.subarray(20 + length)
  const expectedAppId = Buffer.from(config.appId)
  if (receivedAppId.length !== expectedAppId.length || !timingSafeEqual(receivedAppId, expectedAppId)) return signatureInvalid()
  try { return utf8.decode(payload.subarray(20, 20 + length)) } catch { return messageInvalid() }
}

function echoResponse(echo: string) {
  if (!echo || echo.length > 512 || /[\u0000-\u001f\u007f]/.test(echo)) return messageInvalid()
  return new Response(echo, { headers: { 'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } })
}

export function verifyWechatServer(request: Request, config: WebhookConfig): Response {
  const { params, timestamp, nonce } = parameters(request)
  const echo = params.get('echostr') || ''
  if (!echo || echo.length > 512) return messageInvalid()
  if (params.has('encrypt_type') || params.has('msg_signature')) {
    if (params.get('encrypt_type') !== 'aes') return signatureInvalid()
    verifySignature(params.get('msg_signature'), [config.token, timestamp, nonce, echo])
    return echoResponse(decrypt(echo, config))
  }
  verifySignature(params.get('signature'), [config.token, timestamp, nonce])
  return echoResponse(echo)
}

export async function readWechatEvent(request: Request, config: WebhookConfig): Promise<Record<string, string>> {
  const { params, timestamp, nonce } = parameters(request)
  if (params.get('encrypt_type') !== 'aes') return signatureInvalid()
  let source: string
  try { source = utf8.decode(await readBytes(request, 65_536)) } catch { return messageInvalid() }
  const envelope = flatXml(source)
  if (!envelope.Encrypt) return messageInvalid()
  verifySignature(params.get('msg_signature'), [config.token, timestamp, nonce, envelope.Encrypt])
  const message = flatXml(decrypt(envelope.Encrypt, config))
  const allowed = ['MsgType', 'Event', 'EventKey', 'FromUserName', 'ToUserName', 'CreateTime', 'Ticket']
  return Object.fromEntries(allowed.filter(name => Object.hasOwn(message, name)).map(name => [name, message[name]]))
}
