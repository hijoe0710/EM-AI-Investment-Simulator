
import { GoogleGenAI } from "@google/genai";
import { TradeRecord } from "../types";

export async function analyzePerformance(records: TradeRecord[], finalBalance: number, initialBalance: number) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const historyStr = records.map(r => 
    `Date: ${r.date} ${r.time}, Action: ${r.type}, Qty: ${r.quantity}, MA Trends: [${r.maTrends.map(t => `${t.period}MA:${t.direction}`).join(', ')}], Profit: ${r.profit ?? 'N/A'}`
  ).join('\n');

  const prompt = `
    You are a professional trading mentor. Analyze the following trading simulation session:
    Initial Balance: ${initialBalance}
    Final Balance: ${finalBalance}
    Total Profit/Loss: ${finalBalance - initialBalance}

    Transaction History:
    ${historyStr}

    Based on this data, please provide:
    1. A brief summary of the performance.
    2. Why the user might have made money (strengths).
    3. Why the user might have lost money (weaknesses).
    4. Strategic advice for future trading.

    Please respond in Traditional Chinese (繁體中文).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "無法生成 AI 分析報告，請稍後再試。";
  }
}
