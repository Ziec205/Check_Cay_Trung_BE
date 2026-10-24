import ExcelJS from 'exceljs';
import { summarize } from './calc.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4D58D' } };

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

function monthLabel(m) {
  const [y, mm] = m.split('-');
  return `${mm}/${y}`;
}

// months: [{ month: 'YYYY-MM', slips: [{ date, values }] }]
export async function buildWorkbook(months) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Trang trại trứng';

  const sum = wb.addWorksheet('Tổng hợp');
  sum.columns = [
    { header: 'Tháng', key: 'm', width: 12 },
    { header: 'Số cây', key: 'c', width: 10 },
    { header: 'Tổng kg nguyên', key: 'w', width: 16 },
    { header: 'Tổng kg dư', key: 'r', width: 14 },
    { header: 'Tổng cộng (kg)', key: 't', width: 16 },
  ];
  styleHeader(sum.getRow(1));

  for (const { month, slips } of months) {
    const s = summarize(slips.flatMap((x) => x.values));
    sum.addRow({ m: monthLabel(month), c: s.count, w: s.wholeKg, r: s.remKg, t: s.totalKg });

    const ws = wb.addWorksheet(`T${monthLabel(month).replace('/', '-')}`);
    ws.columns = [
      { header: 'Loại (kg/cây)', key: 'a', width: 16 },
      { header: 'Số cây', key: 'b', width: 12 },
      { header: 'Kg nguyên', key: 'c', width: 14 },
    ];
    styleHeader(ws.getRow(1));
    for (const kg of Object.keys(s.byKg).map(Number).sort((a, b) => a - b)) {
      ws.addRow({ a: kg, b: s.byKg[kg], c: kg * s.byKg[kg] });
    }
    const total = ws.addRow({ a: 'Tổng', b: s.count, c: s.wholeKg });
    total.font = { bold: true };
    ws.addRow({ a: 'Tổng kg dư', b: s.remKg });
    ws.addRow({ a: 'Tổng cộng (kg)', b: s.totalKg });

    ws.addRow([]);
    const head = ws.addRow(['Ngày', 'Số cây', 'Kg dư', 'Các số đã nhập']);
    styleHeader(head);
    ws.getColumn(4).width = 70;
    for (const slip of [...slips].sort((a, b) => a.date.localeCompare(b.date))) {
      const ss = summarize(slip.values);
      ws.addRow([slip.date.split('-').reverse().join('/'), ss.count, ss.remKg, slip.values.join(' ')]);
    }
  }
  if (!months.length) sum.addRow({ m: 'Chưa có dữ liệu' });
  return wb;
}
