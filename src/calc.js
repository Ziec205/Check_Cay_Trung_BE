// Mỗi số 3 chữ số = số kg x10. 201 -> 20 kg nguyên, dư 0,1 kg.
export function splitValue(v) {
  return { kg: Math.floor(v / 10), remTenths: v % 10 };
}

export function summarize(values) {
  const byKg = {};
  let wholeKg = 0;
  let remTenths = 0;
  for (const v of values) {
    const { kg, remTenths: r } = splitValue(v);
    byKg[kg] = (byKg[kg] || 0) + 1;
    wholeKg += kg;
    remTenths += r;
  }
  return {
    count: values.length,
    byKg,
    wholeKg,
    remKg: remTenths / 10,
    totalKg: (wholeKg * 10 + remTenths) / 10,
  };
}

export function isValidValue(v) {
  return Number.isInteger(v) && v >= 100 && v <= 999;
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
