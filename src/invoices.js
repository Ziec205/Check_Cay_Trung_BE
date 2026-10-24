import express from 'express';
import mongoose from 'mongoose';
import { wrap, badRequest, notFound } from './http.js';

export const EGGS_PER_TREE = 300;
const MAX_LINES = 20;

const lineSchema = new mongoose.Schema(
  {
    eggType: { type: String, required: true },
    trees: { type: Number, required: true },
    pricePerEgg: { type: Number, required: true },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    customer: { type: String, required: true },
    lines: { type: [lineSchema], default: undefined },
    // Hóa đơn cũ (trước khi có loại trứng) chỉ có một dòng lưu ở hai trường này
    trees: Number,
    pricePerEgg: Number,
    // Giờ địa phương dạng "YYYY-MM-DDTHH:mm", lưu nguyên chuỗi để không lệch múi giờ
    issuedAt: { type: String, required: true },
    month: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
const Invoice = mongoose.model('Invoice', invoiceSchema);

function linesOf(inv) {
  if (inv.lines?.length) return inv.lines;
  return [{ eggType: '', trees: inv.trees, pricePerEgg: inv.pricePerEgg }];
}

function toJson(inv) {
  const lines = linesOf(inv).map((l) => {
    const eggs = l.trees * EGGS_PER_TREE;
    return { eggType: l.eggType, trees: l.trees, pricePerEgg: l.pricePerEgg, eggs, amount: eggs * l.pricePerEgg };
  });
  return {
    id: String(inv._id),
    number: inv.number,
    customer: inv.customer,
    issuedAt: inv.issuedAt,
    eggsPerTree: EGGS_PER_TREE,
    lines,
    trees: lines.reduce((s, l) => s + l.trees, 0),
    eggs: lines.reduce((s, l) => s + l.eggs, 0),
    total: lines.reduce((s, l) => s + l.amount, 0),
  };
}

function parseLine(l, i) {
  const n = i + 1;
  const eggType = String(l?.eggType ?? '').trim();
  const trees = Number(l?.trees);
  const pricePerEgg = Number(l?.pricePerEgg);
  if (!eggType) throw badRequest(`Dòng ${n}: chưa nhập loại trứng`);
  if (eggType.length > 60) throw badRequest(`Dòng ${n}: tên loại trứng quá dài`);
  if (!Number.isInteger(trees) || trees < 1 || trees > 100000) throw badRequest(`Dòng ${n}: số cây phải là số nguyên lớn hơn 0`);
  if (!Number.isInteger(pricePerEgg) || pricePerEgg < 1 || pricePerEgg > 10000000) throw badRequest(`Dòng ${n}: đơn giá phải là số nguyên lớn hơn 0`);
  return { eggType, trees, pricePerEgg };
}

function parseBody(body) {
  const customer = String(body?.customer ?? '').trim();
  const issuedAt = String(body?.issuedAt ?? '');
  const lines = body?.lines;
  if (!customer) throw badRequest('Chưa nhập tên người nhận');
  if (customer.length > 100) throw badRequest('Tên người nhận quá dài');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(issuedAt) || Number.isNaN(Date.parse(issuedAt))) throw badRequest('Ngày giờ không hợp lệ');
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('Hóa đơn cần ít nhất một loại trứng');
  if (lines.length > MAX_LINES) throw badRequest(`Một hóa đơn tối đa ${MAX_LINES} loại trứng`);
  return { customer, issuedAt, month: issuedAt.slice(0, 7), lines: lines.map(parseLine) };
}

// Số hóa đơn theo tháng: HD-202610-001
async function nextNumber(month) {
  const prefix = `HD-${month.replace('-', '')}-`;
  const last = await Invoice.findOne({ number: { $regex: `^${prefix}` } }).sort({ number: -1 }).lean();
  const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(3, '0');
}

export const invoiceRouter = express.Router();

// Các tháng có hóa đơn, kèm số hóa đơn và tổng tiền
invoiceRouter.get('/months', wrap(async (req, res) => {
  const all = await Invoice.find().lean();
  const map = new Map();
  for (const inv of all) {
    const m = map.get(inv.month) || { month: inv.month, count: 0, trees: 0, total: 0 };
    const j = toJson(inv);
    m.count += 1;
    m.trees += j.trees;
    m.total += j.total;
    map.set(inv.month, m);
  }
  res.json([...map.values()].sort((a, b) => b.month.localeCompare(a.month)));
}));

// Các loại trứng đã từng nhập, để gợi ý khi gõ
invoiceRouter.get('/egg-types', wrap(async (req, res) => {
  const types = await Invoice.distinct('lines.eggType');
  res.json(types.filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')));
}));

invoiceRouter.get('/', wrap(async (req, res) => {
  const filter = req.query.month ? { month: String(req.query.month) } : {};
  const list = await Invoice.find(filter).sort({ issuedAt: -1, createdAt: -1 }).lean();
  res.json(list.map(toJson));
}));

invoiceRouter.post('/', wrap(async (req, res) => {
  const data = parseBody(req.body);
  const inv = await Invoice.create({ ...data, number: await nextNumber(data.month) });
  res.status(201).json(toJson(inv));
}));

invoiceRouter.put('/:id', wrap(async (req, res) => {
  const inv = await Invoice.findByIdAndUpdate(
    req.params.id,
    { $set: parseBody(req.body), $unset: { trees: 1, pricePerEgg: 1 } },
    { new: true },
  );
  if (!inv) throw notFound('Không tìm thấy hóa đơn');
  res.json(toJson(inv));
}));

invoiceRouter.delete('/:id', wrap(async (req, res) => {
  await Invoice.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));
