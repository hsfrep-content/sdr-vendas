function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(rawPhone, defaultCountryCode = '55') {
  const digits = onlyDigits(rawPhone);
  if (!digits) return null;
  return digits.length <= 11 ? `${defaultCountryCode}${digits}` : digits;
}

function toWhatsAppId(rawPhone, defaultCountryCode = '55') {
  const normalized = normalizePhone(rawPhone, defaultCountryCode);
  return normalized ? `${normalized}@c.us` : null;
}

module.exports = { onlyDigits, normalizePhone, toWhatsAppId };
