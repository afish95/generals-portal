// Minimal Web Push sender (RFC 8291 aes128gcm encryption + RFC 8292 VAPID).
// Uses only Node's built-in crypto, so there are no extra dependencies.
import crypto from 'node:crypto'

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string }
export type PushPayload = { title: string; body?: string; url?: string; tag?: string }

const b64u = (buf: Buffer) => buf.toString('base64url')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) =>
  Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))

function vapidAuthHeader(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = fromB64u(publicKey)
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  })
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      })
    )
  )
  const unsigned = `${header}.${claims}`
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`
}

export function encryptPayload(sub: PushSubscriptionRow, plaintext: Buffer) {
  const uaPublic = fromB64u(sub.p256dh)
  const authSecret = fromB64u(sub.auth)
  const ecdh = crypto.createECDH('prime256v1')
  const asPublic = ecdh.generateKeys()
  const shared = ecdh.computeSecret(uaPublic)
  const salt = crypto.randomBytes(16)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = hkdf(authSecret, shared, keyInfo, 32)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])

  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, encrypted])
}

/** Sends one push. Returns the push service's HTTP status (201 = delivered; 404/410 = device gone). */
export async function sendWebPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<number> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'https://app.generalsbaseball.org'
  if (!publicKey || !privateKey) throw new Error('Push keys are not configured')

  const body = encryptPayload(sub, Buffer.from(JSON.stringify(payload)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthHeader(sub.endpoint, publicKey, privateKey, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: new Uint8Array(body),
  })
  return res.status
}
