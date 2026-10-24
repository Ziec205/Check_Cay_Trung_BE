import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { summarize, isValidValue, isValidDate } from './calc.js';
import { readNumbersFromImage } from './gemini.js';
import { buildWorkbook } from './excel.js';

const MAX_MONTHS = 6;

const slipSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    month: { type: String, required: true, index: true },
    values: { type: [Number], required: true },
  },
  { timestamps: true },
);
const Slip = mongoose.model('Slip', slipSchema);

const app = express();
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '10mb' }));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status || e.status >= 500) console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'Lỗi server' });
});

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parseSlipBody(body) {
  const { date, values } = body || {};
  if (!isValidDate(date)) throw badRequest('Ngày không hợp lệ');
  if (!Array.isArray(values) || values.length === 0) throw badRequest('Chưa có số nào');
  const nums = values.map(Number);
  if (!nums.every(isValidValue)) throw badRequest('Mỗi số phải gồm đúng 3 chữ số');
  return { date, month: date.slice(0, 7), values: nums };
}

async function groupedMonths() {
  const slips = await Slip.find().sort({ date: 1, createdAt: 1 }).lean();
  const map = new Map();
  for (const s of slips) {
    if (!map.has(s.month)) map.set(s.month, []);
    map.get(s.month).push({ id: String(s._id), date: s.date, values: s.values });
  }
  return [...map.entries()]
    .map(([month, list]) => ({ month, slips: list }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Thống kê theo tháng (mới nhất trước) + danh sách tháng vượt quá 6 tháng
app.get('/api/months', wrap(async (req, res) => {
  const all = await groupedMonths();
  const months = all.map(({ month, slips }) => ({
    month,
    slipCount: slips.length,
    ...summarize(slips.flatMap((s) => s.values)),
  }));
  res.json({ months, overflow: months.slice(MAX_MONTHS).map((m) => m.month), max: MAX_MONTHS });
}));

app.get('/api/slips', wrap(async (req, res) => {
  const { month } = req.query;
  const filter = month ? { month: String(month) } : {};
  const slips = await Slip.find(filter).sort({ date: -1, createdAt: -1 }).lean();
  res.json(slips.map((s) => ({ id: String(s._id), date: s.date, values: s.values, ...summarize(s.values) })));
}));

app.post('/api/slips', wrap(async (req, res) => {
  const slip = await Slip.create(parseSlipBody(req.body));
  res.status(201).json({ id: String(slip._id) });
}));

app.put('/api/slips/:id', wrap(async (req, res) => {
  const slip = await Slip.findByIdAndUpdate(req.params.id, parseSlipBody(req.body), { new: true });
  if (!slip) throw Object.assign(new Error('Không tìm thấy phiếu'), { status: 404 });
  res.json({ id: String(slip._id) });
}));

app.delete('/api/slips/:id', wrap(async (req, res) => {
  await Slip.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/months/:month', wrap(async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.month)) throw badRequest('Tháng không hợp lệ');
  const r = await Slip.deleteMany({ month: req.params.month });
  res.json({ deleted: r.deletedCount });
}));

app.post('/api/ocr', wrap(async (req, res) => {
  const { image, mimeType } = req.body || {};
  if (!image || !/^image\//.test(mimeType || '')) throw badRequest('Thiếu ảnh');
  try {
    res.json(await readNumbersFromImage({ image, mimeType }));
  } catch (e) {
    throw Object.assign(e, { status: 502 });
  }
}));

app.get('/api/export', wrap(async (req, res) => {
  let months = await groupedMonths();
  if (req.query.month) months = months.filter((m) => m.month === req.query.month);
  months.reverse();
  const wb = await buildWorkbook(months);
  const name = req.query.month ? `trung-${req.query.month}` : 'trung-tat-ca';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

const port = process.env.PORT || 4000;
if (!process.env.MONGODB_URI) {
  console.error('Thiếu MONGODB_URI');
  process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
app.listen(port, () => console.log(`API chạy tại cổng ${port}`));
