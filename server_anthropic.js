require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  res.json({ ok: true, apiKeySet: hasKey });
});

// Main AI analysis endpoint
app.post("/api/analyze", async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    return res.status(500).json({
      error: "API key not configured. Add ANTHROPIC_API_KEY to your .env file.",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 150,
        system: `You are a fast quiz assistant. Analyze the image for a quiz question with answer options.

Rules:
- Reply ONLY with the correct answer in this format: "X) short reason" 
- X = the option letter (A, B, C, D etc.)
- Keep total response under 80 characters
- If no clear question is visible, reply exactly: "No question detected"
- If image is blurry/unclear, reply exactly: "Image unclear - try again"
- Be confident and direct. No preamble.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: "What is the correct answer to this quiz question?",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Anthropic API error:", err);
      return res.status(response.status).json({
        error: err.error?.message || "API request failed",
      });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text?.trim() || "No response";

    res.json({ answer });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Fallback to index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Quiz AI Assistant running at http://localhost:${PORT}`);
  console.log(
    `🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? "✅ Set" : "❌ Missing — add to .env"}\n`
  );
});
