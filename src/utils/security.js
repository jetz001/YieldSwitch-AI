/**
 * Basic sanitization specifically for text instructions (aiDirectives) and simple settings.
 * Strips HTML tags, script segments, and common XSS patterns.
 */
export function sanitizeInput(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  
  let sanitized = input
    // 1. Limit length
    .substring(0, maxLength)
    // 2. Strip <script>...</script> tags entirely
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
    // 3. Strip any other HTML tags but keep the text inside them (e.g., <div>Hello</div> -> Hello)
    .replace(/<[^>]*>?/gm, '')
    // 4. Remove common JS event handlers (onmouseover, onload, etc.)
    .replace(/\b(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gmi, '');

  return sanitized.trim();
}

/**
 * Validates request payload for basic type and value sanity.
 */
export function validateNumeric(value, min = 0, max = 1000000000) {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return Math.min(Math.max(num, min), max);
}
