import { isValidValue } from './calc.js';

const PROMPT = `Đây là ảnh chụp trang sổ viết tay, có thể bị xoay ngang hoặc xoay ngược.
Hãy chép lại toàn bộ chữ và số nhìn thấy trong ảnh theo thứ tự đọc, giữ nguyên từng dòng.
Chỉ cần chép, không giải thích, không tính toán.`;

// Tổng thời gian chờ cho mọi lần thử
const TIMEOUT_MS = 60000;
// Thử lần lượt: model đầu nhanh, model sau là dự phòng khi model đầu quá tải
const DEFAULT_MODELS = 'gemini-3.5-flash-lite,gemini-3.5-flash';

function models() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODELS).split(',').map((s) => s.trim()).filter(Boolean);
}

async function callModel({ model, key, image, mimeType, thinking, signal }) {
  const generationConfig = { temperature: 0 };
  // Giảm "suy nghĩ" của model để trả lời nhanh hơn (mặc định có thể mất hơn 20 giây)
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: image } }] }],
      generationConfig,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Gemini (${model}) lỗi ${res.status}: ${body.slice(0, 300)}`);
    err.httpStatus = res.status;
    err.thinkingRejected = res.status === 400 && /thinking/i.test(body);
    throw err;
  }
  const data = JSON.parse(body);
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

export async function readNumbersFromImage({ image, mimeType }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Chưa cấu hình GEMINI_API_KEY trên server');
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const thinking = process.env.GEMINI_THINKING ?? 'low';

  let lastError;
  for (const model of models()) {
    try {
      let text;
      try {
        text = await callModel({ model, key, image, mimeType, thinking, signal });
      } catch (e) {
        // Model không hỗ trợ mức suy nghĩ này thì gọi lại không kèm cấu hình
        if (!e.thinkingRejected) throw e;
        text = await callModel({ model, key, image, mimeType, thinking: '', signal });
      }
      if (!text.trim()) throw new Error(`Gemini (${model}) không trả lời gì`);
      // Lọc các cụm đúng 3 chữ số trong văn bản AI trả về
      const found = text.match(/(?<!\d)\d{3}(?!\d)/g) || [];
      return { raw: text, model, values: found.map(Number).filter(isValidValue) };
    } catch (e) {
      if (signal.aborted) throw new Error(`Gemini không trả lời sau ${TIMEOUT_MS / 1000} giây, hãy thử lại`);
      console.error(e.message);
      lastError = e;
      // Sai key thì thử model khác cũng vô ích
      if (e.httpStatus === 401 || e.httpStatus === 403) break;
    }
  }
  throw lastError;
}
