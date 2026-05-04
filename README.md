# QuizAI — Real-Time Camera Quiz Assistant

Point your second device at a quiz screen and get AI-powered answers in real time.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up your API key
```bash
cp .env.example .env
```
Open `.env` and replace `your_api_key_here` with your actual Anthropic API key.
Get one at: https://console.anthropic.com

### 3. Start the server
```bash
npm start
```

### 4. Open the app
- On your phone/tablet: open `http://YOUR_COMPUTER_IP:3000`
- On same machine: open `http://localhost:3000`

> **Tip:** To find your computer's IP on your local network:
> - Mac/Linux: `ifconfig` or `ip addr`  
> - Windows: `ipconfig`
> Then open `http://192.168.x.x:3000` on your phone

---

## How to Use

1. **Enable Camera** — allow camera access when prompted
2. Point the device at your quiz screen
3. Tap the **camera button** (right side) for a one-shot capture, OR
4. Toggle **AUTO** to scan automatically every N seconds
5. The answer appears at the **bottom** of the screen

---

## Settings

| Setting | Description |
|---|---|
| Scan Interval | How often to auto-scan (1–10 seconds) |
| Change Sensitivity | How much screen change triggers a new scan (lower = more sensitive) |
| Answer Cooldown | Pause after each answer before re-scanning |
| Camera Zoom | Digital zoom on the video feed |
| Camera Source | Switch between available cameras |
| Image Quality | JPEG quality sent to AI (higher = better but slower) |

---

## Architecture

```
[Camera Feed] → [Pixel Diff Check] → (changed?) → [Capture JPEG]
                                                         ↓
                                              [POST /api/analyze]
                                                         ↓
                                           [Anthropic Claude API]
                                                         ↓
                                              [Answer displayed]
```

- **Backend:** Node.js + Express — proxies image to Anthropic API (keeps your API key secure)
- **Frontend:** Vanilla HTML/CSS/JS — no frameworks, no build step
- **AI Model:** Claude claude-opus-4-5 (vision)

---

## File Structure

```
quiz-ai/
├── server.js          ← Node.js backend
├── package.json
├── .env               ← Your API key (create from .env.example)
├── .env.example
└── public/
    ├── index.html     ← App UI
    ├── css/
    │   └── style.css
    └── js/
        └── app.js     ← All frontend logic
```

---

## Tips for Best Results

- **Lighting:** Avoid glare on the screen — angle the camera slightly
- **Focus:** Lock focus on your device after pointing at the screen
- **Distance:** 30–60cm from the screen works best
- **Sensitivity:** If auto mode fires too often, increase the diff threshold
- **Manual mode:** Use the camera button if auto doesn't detect a new question

---

## Troubleshooting

**Camera not working?**
- Make sure you're on HTTPS or localhost (browsers require this for camera)
- Check that no other app is using the camera

**"API key not set" error?**
- Make sure `.env` exists with your real key (not the placeholder)
- Restart the server after editing `.env`

**Slow responses?**
- Lower image quality in settings
- Check your internet connection
