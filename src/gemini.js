import { isValidValue } from './calc.js';

const PROMPT = `Đây là ảnh chụp trang sổ viết tay của một trang trại trứng. Ảnh có thể bị xoay ngang hoặc xoay ngược.
Trên trang có nhiều số gồm đúng 3 chữ số (khoảng 190 đến 215), mỗi số là cân nặng một cây trứng tính theo 0,1 kg (ví dụ 201 là 20,1 kg).
Hãy chép lại TẤT CẢ các số 3 chữ số theo đúng thứ tự đọc (từng hàng, từ trái sang phải, từ trên xuống dưới sau khi đã xoay ảnh về đúng chiều).
Bỏ qua ngày tháng, chữ và các ghi chú. Nếu một số khó đọc, hãy chọn số hợp lý nhất. Không bỏ sót, không thêm số.
Trả về JSON dạng {"values":[...]}.`;

export async function readNumbersFromImage({ image, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Chưa cấu hình GEMINI_API_KEY trên server');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { values: { type: 'ARRAY', items: { type: 'INTEGER' } } },
          required: ['values'],
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini lỗi ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini trả về dữ liệu không đọc được, hãy thử chụp lại');
  }
  return (parsed.values || []).map(Number).filter(isValidValue);
}
