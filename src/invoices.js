import express from 'express';
import mongoose from 'mongoose';
import { wrap, badRequest, notFound } from './http.js';

export const EGGS_PER_TREE = 300;

const invoiceSchema = new mongoose.Schema(
  {
    number: { type: String, required: true },
    customer: { type: String, required: true },
    trees: { type: Number, required: true },
    pricePerEgg: { type: Number, required: true },
    // Giờ địa phương dạng "YYYY-MM-DDTHH:mm", lưu nguyên chuỗi để không lệch múi giờ
    issuedAt: { type: String, required: true },
    month: { type: String, required: true, index: true },
  },
  { timestamps: true },
);
const Invoice = mongoose.model('Invoice', invoiceSchema);

function toJson(inv) {
  const eggs = inv.trees * EGGS_PER_TREE;
  return {
    id: String(inv._id),
    number: inv.number,
    customer: inv.customer,
    trees: inv.trees,
    pricePerEgg: inv.pricePerEgg,
    issuedAt: inv.issuedAt,
    eggsPerTree: EGGS_PER_TREE,
    eggs,
    total: eggs * inv.pricePerEgg,
  };
}

function parseBody(body) {
  const customer = String(body?.customer ?? '').trim();
  const trees = Number(body?.trees);
  const pricePerEgg = Number(body?.pricePerEgg);
  const issuedAt = String(body?.issuedAt ?? '');
  if (!customer) throw badRequest('Chưa nhập tên người nhận');
  if (customer.length > 100) throw badRequest('Tên người nhận quá dài');
  if (!Number.isInteger(trees) || trees < 1 || trees > 100000) throw badRequest('Số cây phải là số nguyên lớn hơn 0');
  if (!Number.isInteger(pricePerEgg) || pricePerEgg < 1 || pricePerEgg > 10000000) throw badRequest('Đơn giá phải là số nguyên lớn hơn 0');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(issuedAt) || Number.isNaN(Date.parse(issuedAt))) throw badRequest('Ngày giờ không hợp lệ');
  return { customer, trees, pricePerEgg, issuedAt, month: issuedAt.slice(0, 7) };
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
  const inv = await Invoice.findByIdAndUpdate(req.params.id, parseBody(req.body), { new: true });
  if (!inv) throw notFound('Không tìm thấy hóa đơn');
  res.json(toJson(inv));
}));

invoiceRouter.delete('/:id', wrap(async (req, res) => {
  await Invoice.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));
