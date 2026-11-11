/**
 * Normalize / sanitize businesses.receipt_email_config for guest receipts.
 */

const MAX_SUBJECT = 120;
const MAX_HEADER = 80;
const MAX_GREETING = 280;
const MAX_FOOTER = 400;

function clampStr(value, max) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function normalizeHexColor(raw, fallback = '#ffbd59') {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function defaultReceiptEmailConfig(brandFallback) {
  return {
    accentColor: normalizeHexColor(brandFallback, '#ffbd59'),
    subjectTemplate: '',
    headerTitle: '',
    greeting: '',
    footerText: '',
    showLogo: true,
    showZuriBadge: true
  };
}

function normalizeReceiptEmailConfig(raw, brandFallback) {
  const base = defaultReceiptEmailConfig(brandFallback);
  if (!raw || typeof raw !== 'object') return base;
  return {
    accentColor: normalizeHexColor(raw.accentColor ?? raw.accent_color, base.accentColor),
    subjectTemplate: clampStr(raw.subjectTemplate ?? raw.subject_template, MAX_SUBJECT),
    headerTitle: clampStr(raw.headerTitle ?? raw.header_title, MAX_HEADER),
    greeting: clampStr(raw.greeting, MAX_GREETING),
    footerText: clampStr(raw.footerText ?? raw.footer_text, MAX_FOOTER),
    showLogo: raw.showLogo !== false && raw.show_logo !== false,
    showZuriBadge: raw.showZuriBadge !== false && raw.show_zuri_badge !== false
  };
}

function applySubjectTemplate(template, { businessName, ref, isTicketing }) {
  const trimmed = String(template || '').trim();
  if (!trimmed) {
    return isTicketing
      ? `Your ZURI ticket — ${businessName}`
      : `ZURI receipt — Ref ${ref}`;
  }
  return trimmed
    .replace(/\{business\}/gi, businessName)
    .replace(/\{ref\}/gi, ref)
    .replace(/\{type\}/gi, isTicketing ? 'ticket' : 'receipt')
    .slice(0, MAX_SUBJECT);
}

module.exports = {
  defaultReceiptEmailConfig,
  normalizeReceiptEmailConfig,
  applySubjectTemplate,
  normalizeHexColor
};
