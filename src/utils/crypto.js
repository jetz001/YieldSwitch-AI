import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// It is recommended to set strong base64 32-byte string as ENCRYPTION_KEY in .env.local
const keyEnv = process.env.ENCRYPTION_KEY;
const ENCRYPTION_KEY = keyEnv ? Buffer.from(keyEnv, 'base64') : crypto.randomBytes(32);
const IV_LENGTH = 16;

if (ENCRYPTION_KEY.length !== 32) {
  console.error(`[CRYPTO ERROR] ENCRYPTION_KEY length must be 32 bytes. Current length: ${ENCRYPTION_KEY.length}`);
}

export function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('[CRYPTO] Encryption failed:', error.message);
    return null;
  }
}

export function decrypt(hash) {
  if (!hash) return null;
  
  try {
    const parts = hash.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted hash format');
    }
    
    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null; // Return null rather than crashing if user keys are malformed
  }
}
