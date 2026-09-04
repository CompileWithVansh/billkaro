/**
 * Sanitization utilities for BillKaro
 * 
 * Specifically tuned for Indian restaurant POS & retail:
 * - Preserves emojis (🍕, ☕, 🍔, 🍨)
 * - Preserves Devanagari, Tamil, Telugu, and all Unicode scripts (हिन्दी, தமிழ், etc.)
 * - Strips invisible zero-width spaces (\u200B)
 * - Strips dangerous non-printable ASCII control characters (\x00, \x1B) that crash thermal printers
 * - Strips raw HTML tags and <script> blocks to prevent Stored XSS in receipts/exports
 */

export function sanitizeText(input, { allowNewlines = false } = {}) {
  if (typeof input !== 'string') return '';

  let cleaned = input
    // 1. Strip zero-width spaces, joiners, and BOM markers
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 2. Strip full <script> and <style> blocks and their contents
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // 3. Strip any remaining HTML tags (e.g. <img ...>, <b>, <iframe ...>)
    .replace(/<[^>]*>/g, '')
    // 4. Strip dangerous non-printable ASCII control characters
    .replace(
      allowNewlines
        ? /[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g // Preserve \n (\x0A) and \r (\x0D)
        : /[\x00-\x1F\x7F]/g,
      ''
    );

  // 5. Normalize internal whitespace unless newlines are allowed
  if (!allowNewlines) {
    cleaned = cleaned.replace(/\s+/g, ' ');
  }

  // 6. Trim leading and trailing whitespace
  return cleaned.trim();
}

/**
 * Sanitizes phone numbers while preserving international formatting:
 * - Keeps +, (), -, spaces, and digits (e.g. "+91 98765 43210", "(022) 2345-6789")
 * - Strips non-printable control characters
 * - Caps maximum length at 20 characters
 */
export function sanitizePhone(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .substring(0, 20);
}
