import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("✅ Backend Chatterbox aktif");
});

// Fungsi untuk menunggu hasil dari Replicate
async function waitForPrediction(predictionUrl, token) {
  let status = "processing";
  let output = null;
  let attempts = 0;

  while (status === "processing" || status === "starting") {
    const res = await fetch(predictionUrl, {
      headers: { Authorization: `Token ${token}` },
    });
    const data = await res.json();
    status = data.status;
    output = data.output;

    if (status === "failed" || status === "canceled") {
      throw new Error(`Prediksi gagal dengan status: ${status}`);
    }

    if (status === "succeeded") {
      return output;
    }

    // tunggu 2 detik sebelum cek ulang
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
    if (attempts > 15) throw new Error("Waktu tunggu terlalu lama.");
  }

  return output;
}

// Endpoint generate voice
app.post("/generate-voice", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Teks tidak boleh kosong" });

    // 1️⃣ Kirim request ke Replicate
    const response = await fetch(
      "https://api.replicate.com/v1/models/resemble-ai/chatterbox/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { prompt: text, voice: "Rachel" },
        }),
      }
    );

    const prediction = await response.json();
    console.log("🟡 Prediction Created:", prediction);

    if (!prediction || !prediction.urls?.get) {
      return res.status(500).json({ error: "Gagal membuat prediksi awal", prediction });
    }

    // 2️⃣ Tunggu hasilnya selesai diproses
    const output = await waitForPrediction(prediction.urls.get, process.env.REPLICATE_API_TOKEN);
    console.log("✅ Prediction Finished:", output);

    // 3️⃣ Kirim hasil audio URL ke frontend (versi fix)
    let audioUrl = null;

    if (Array.isArray(output)) {
      audioUrl = output[0];
    } else if (typeof output === "string") {
      audioUrl = output;
    } else if (output && output.audio) {
      audioUrl = output.audio;
    }

    if (!audioUrl) {
      return res.status(500).json({ error: "Tidak ada output audio dari Replicate", output });
    }

    res.json({ audio_url: audioUrl });
  } catch (error) {
    console.error("❌ Error generate voice:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
});
