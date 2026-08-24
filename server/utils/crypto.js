/**
 * OAuth token encryption for server-side storage.
 * The master key is explicitly supplied as 32 bytes / 64 hexadecimal
 * characters. There is no derived, generated, or machine-specific fallback.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';
const ENCRYPTED_TOKEN_PATTERN = /^enc:v1:([a-f0-9]{24}):([a-f0-9]{32}):([a-f0-9]+)$/i;

export class TokenEncryptionKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TokenEncryptionKeyError';
  }
}

export function getEncryptionKey() {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (typeof rawKey !== 'string' || !/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    throw new TokenEncryptionKeyError(
      'TOKEN_ENCRYPTION_KEY must be explicitly configured as exactly 64 hexadecimal characters'
    );
  }

  const key = Buffer.from(rawKey, 'hex');
  if (key.length !== 32) {
    throw new TokenEncryptionKeyError('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function isEncryptedToken(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(ENCRYPTED_TOKEN_PATTERN);
  if (!match) return false;
  return Buffer.from(match[1], 'hex').length === IV_LENGTH
    && Buffer.from(match[2], 'hex').length === AUTH_TAG_LENGTH
    && Buffer.from(match[3], 'hex').length > 0;
}

export function encryptToken(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;
  if (isEncryptedToken(plaintext)) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(ciphertext, customKey = null) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext || '';
  if (!isEncryptedToken(ciphertext)) return ciphertext;

  const [, ivHex, authTagHex, dataHex] = ciphertext.match(ENCRYPTED_TOKEN_PATTERN);
  try {
    const key = customKey || getEncryptionKey();
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid AES-256-GCM key');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof TokenEncryptionKeyError) throw error;
    throw new Error('Token decryption failed');
  }
}
