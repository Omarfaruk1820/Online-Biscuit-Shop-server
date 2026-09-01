import express from "express";
import OpenAI from "openai";

const router = express.Router();

// ============================================================
// OPENAI CLIENT
// ============================================================

const apiKey = process.env.AI_API_KEY;

if (!apiKey) {
  throw new Error("AI_API_KEY is missing from environment variables.");
}

const openai = new OpenAI({
  apiKey,
});

// ============================================================
// AI CHAT
// POST /api/ai/chat
// ============================================================

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }
    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      instructions: `
You are the AI shopping assistant for a professional Biscuit Shop e-commerce website.

Help customers with:
- Biscuits
- Cookies
- Cakes
- Bread
- Snacks
- Chanachur
- Chocolate
- Candy
- Chips
- Drinks
- Product recommendations
- General shopping questions

Rules:
- Be friendly and helpful.
- Keep answers concise and easy to understand.
- Do not invent product names.
- Do not invent prices.
- Do not invent stock quantities.
- Do not invent discounts.
- If product information is unavailable, clearly say so.
`,
      input: message.trim(),
    });

    // ============================================================
    // SERVER-SIDE AI RESPONSE LOG
    // ============================================================
    console.log("FULL AI RESPONSE:");
    console.dir(response, { depth: null });
    console.log("========================================");
    console.log("🤖 AI RESPONSE");
    console.log("========================================");
    console.log(response.output_text);
    console.log("========================================");

    const aiMessage = response.output_text?.trim();

    if (!aiMessage) {
      return res.status(502).json({
        success: false,
        message: "AI did not return a response.",
      });
    }

    return res.status(200).json({
      success: true,
      message: aiMessage,
    });
  } catch (error) {
    console.error("AI Chat Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI service is currently unavailable.",
    });
  }
});

export default router;
