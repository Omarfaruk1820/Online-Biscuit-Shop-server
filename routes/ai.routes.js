import express from "express";
import OpenAI from "openai";

const router = express.Router();

// ============================================================
// OPENAI CLIENT
// ============================================================

const apiKey = process.env.AI_API_KEY;

const openai = apiKey
  ? new OpenAI({
      apiKey,
    })
  : null;

// ============================================================
// AI CHAT
// POST /api/ai/chat
// ============================================================

router.post("/chat", async (req, res) => {
  try {
    // ============================================================
    // CHECK OPENAI CONFIGURATION
    // ============================================================

    if (!openai) {
      console.error("AI_API_KEY is missing from environment variables.");

      return res.status(500).json({
        success: false,
        message: "AI service is not configured correctly.",
      });
    }

    // ============================================================
    // VALIDATE REQUEST
    // ============================================================

    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    // ============================================================
    // OPENAI REQUEST
    // ============================================================

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
    // GET AI RESPONSE
    // ============================================================

    const aiMessage = response?.output_text?.trim();

    if (!aiMessage) {
      console.error("OpenAI returned an empty response.");
      console.dir(response, { depth: null });

      return res.status(502).json({
        success: false,
        message: "AI did not return a response.",
      });
    }

    // ============================================================
    // SERVER-SIDE AI RESPONSE LOG
    // ============================================================

    console.log("========================================");
    console.log("🤖 AI RESPONSE");
    console.log("========================================");
    console.log(aiMessage);
    console.log("========================================");

    // ============================================================
    // SUCCESS RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,
      message: aiMessage,
    });
  } catch (error) {
    // ============================================================
    // ERROR LOG
    // ============================================================

    console.error("========================================");
    console.error("AI CHAT ERROR");
    console.error("========================================");

    console.error("Message:", error?.message);
    console.error("Status:", error?.status);
    console.error("Code:", error?.code);
    console.error("Type:", error?.type);

    console.error("========================================");

    // ============================================================
    // API CREDIT / RATE LIMIT ERROR
    // ============================================================

    if (
      error?.status === 429 ||
      error?.code === "insufficient_quota" ||
      error?.code === "billing_hard_limit_reached"
    ) {
      return res.status(429).json({
        success: false,
        code: "AI_USAGE_LIMIT",
        message: "AI usage limit reached.",
      });
    }

    // ============================================================
    // OTHER OPENAI ERRORS
    // ============================================================

    return res.status(500).json({
      success: false,
      message: "AI service is currently unavailable.",
    });
  }
});

export default router;
