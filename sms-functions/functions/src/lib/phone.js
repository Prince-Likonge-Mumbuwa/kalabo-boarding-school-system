// Zambian phone validation + carrier detection
// Normalizes: "0961234567" → "+260961234567"
// Detects carrier from prefix: MTN 96/76, AIRTEL 97/77, ZAMTEL 95/75, ZedMobile 98/78

const getCarrier = (phone) => {
  if (!phone) return 'UNKNOWN';
  if (/^260(96|76)/.test(phone)) return 'MTN';
  if (/^260(97|77)/.test(phone)) return 'AIRTEL';
  if (/^260(95|75)/.test(phone)) return 'ZAMTEL';
  if (/^260(98|78)/.test(phone)) return 'ZedMobile';
  return 'OTHER';
};

const validateZambianNumber = (phone) => {
  if (!phone) return null;

  let cleaned = String(phone).trim().replace(/[\s\-()]+/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('0')) cleaned = '260' + cleaned.substring(1);
  if (!cleaned.startsWith('260')) cleaned = '260' + cleaned;

  const pattern = /^260(75|76|77|78|95|96|97|98)\d{7}$/;
  if (!pattern.test(cleaned)) return null;

  return { number: '+' + cleaned, carrier: getCarrier(cleaned) };
};

module.exports = { getCarrier, validateZambianNumber };