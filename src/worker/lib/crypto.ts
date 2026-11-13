const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function generateConfirmationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < bytes.length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `BRB-${code}`;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iterations = 100_000;
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2_sha256$${iterations}$${bytesToHex(salt)}$${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) {
    return false;
  }
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return timingSafeEqual(new Uint8Array(derivedBits), expected);
}

async function deriveAesKey(secretKey: string): Promise<CryptoKey> {
  const rawHash = await crypto.subtle.digest('SHA-256', encoder.encode(secretKey));
  return crypto.subtle.importKey('raw', rawHash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function resolveEncryptionKey(envKey?: string, environment?: string): string {
  if (envKey && envKey.length >= 16) return envKey;
  if (environment === 'production') {
    throw new Error('ENCRYPTION_KEY secret must be configured in production');
  }
  return 'dev-local-only-encryption-key-change-me';
}

export async function encryptSecret(plaintext: string, secretKey: string): Promise<string> {
  if (!plaintext) return '';
  const key = await deriveAesKey(secretKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  return `v1:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(ciphertext: string, secretKey: string): Promise<string> {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith('v1:')) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return '';
  const iv = hexToBytes(parts[1]);
  const data = hexToBytes(parts[2]);
  const key = await deriveAesKey(secretKey);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return decoder.decode(decrypted);
}

export async function verifyHmacSha256(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const sigHex = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!sigHex || sigHex.length !== 64) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return timingSafeEqual(new Uint8Array(mac), hexToBytes(sigHex));
}

export function maskSecret(value?: string | null): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}
