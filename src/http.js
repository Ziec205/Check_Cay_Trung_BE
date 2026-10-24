export const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status || e.status >= 500) console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'Lỗi server' });
});

export function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}
