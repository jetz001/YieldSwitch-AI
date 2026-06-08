// Stubbed for Edge compatibility
// In production Edge environments, use Web Crypto API (crypto.subtle) instead.

export function encrypt(text) {
  if (!text) return null;
  // Edge runtime stub - no actual encryption performed
  return text;
}

export function decrypt(hash) {
  if (!hash) return null;
  // Edge runtime stub
  return hash;
}
