import { isValidValue } from './calc.js';

const PROMPT = `Đây là ảnh chụp trang sổ viết tay, có thể bị xoay ngang hoặc xoay ngược.
Hãy chép lại toàn bộ chữ và số nhìn thấy trong ảnh theo thứ tự đọc, giữ nguyên từng dòng.
Chỉ cần chép, không giải thích, không tính toán.`;

const TIMEOUT_MS = 55000;

export async function readNumbersFromImage({ image, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Chưa cấu hình GEMINI_API_KEY trên server');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('Gemini phản hồi quá lâu, hãy thử lại');
    throw e;
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini lỗi ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  // Lọc các cụm đúng 3 chữ số trong văn bản AI trả về
  const found = text.match(/(?<!\d)\d{3}(?!\d)/g) || [];
  return found.map(Number).filter(isValidValue);
}
