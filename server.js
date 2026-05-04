require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({ ok: true, apiKeySet: hasKey });
});

// Main AI analysis endpoint
app.post("/api/analyze", async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    return res.status(500).json({
      error: "API key not configured. Add GEMINI_API_KEY to your .env file.",
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a fast quiz assistant.

Rules:
- Reply ONLY with: "X) short reason"
- Max 80 characters
- If no question: "No question detected"
- If unclear: "Image unclear - try again"
- No extra words.`,
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: image, // base64 string (no prefix)
                  },
                },
                {
                  text: "What is the correct answer?",
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.2,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "API request failed",
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "No response";

    res.json({ answer });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Quiz AI Assistant running at http://localhost:${PORT}`);
  console.log(
    `🔑 API Key: ${process.env.GEMINI_API_KEY ? "✅ Set" : "❌ Missing — add to .env"}\n`
  );
});