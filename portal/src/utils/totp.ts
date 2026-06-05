import crypto from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(str: string): Buffer {
  const s = str.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function hotpCode(key: Buffer, counter: number): string {
  const buf = Buffer.allocUnsafe(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24
    | (hmac[offset + 1] & 0xff) << 16
    | (hmac[offset + 2] & 0xff) << 8
    | (hmac[offset + 3] & 0xff)) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateURI(opts: { issuer: string; label: string; secret: string }): string {
  const { issuer, label, secret } = opts;
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function verifySync(opts: { token: string; secret: string; epochTolerance?: number }): { valid: boolean } {
  const { token, secret, epochTolerance = 0 } = opts;
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30);
  const window = Math.ceil(epochTolerance / 30);
  for (let w = -window; w <= window; w++) {
    if (hotpCode(key, step + w) === token) return { valid: true };
  }
  return { valid: false };
}
