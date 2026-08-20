const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');
require('dotenv').config();

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Crear carpetas necesarias
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');
const audioDir = path.join(__dirname, 'audio');

[uploadsDir, outputDir, audioDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/output', express.static(outputDir));
app.use('/audio', express.static(audioDir));

// Multer config: guardar archivos en disco (no memoria) para videos grandes
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `upload_${uuidv4()}_${file.originalname}`)
});
const upload = multer({ 
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB max
});

// =====================
// HEALTH CHECK
// =====================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ffmpeg: true
  });
});

// =====================
// GENERAR GUION
// =====================
app.post('/api/script', async (req, res) => {
  try {
    const { idea, style = 'cinematic', duration = 30 } = req.body;
    if (!idea || idea.trim().length < 3) {
      return res.status(400).json({ error: 'La idea es requerida (mínimo 3 caracteres)' });
    }

    const sceneCount = duration <= 15 ? 3 : duration <= 30 ? 5 : 7;
    const sceneDuration = Math.floor(duration / sceneCount);
    let script = [];

    if (process.env.OPENAI_API_KEY) {
      script = await generateScriptOpenAI(idea, style, sceneCount, sceneDuration);
    } else {
      script = await generateScriptPollinations(idea, style, sceneCount, sceneDuration);
    }

    res.json({ script, source: process.env.OPENAI_API_KEY ? 'openai' : 'pollinations' });
  } catch (err) {
    console.error('Error generando guion:', err.message);
    res.status(500).json({ error: 'Error generando guion', detail: err.message });
  }
});

async function generateScriptOpenAI(idea, style, sceneCount, sceneDuration) {
  const prompt = `Eres un director creativo especializado en videos cortos verticales (9:16) para redes sociales.

Crea un guion de ${sceneCount} escenas basado en esta idea: "${idea}"
Estilo visual: ${style}
Cada escena debe durar aproximadamente ${sceneDuration} segundos.

Para cada escena devuelve:
- text: descripción narrativa de lo que ocurre (máximo 15 palabras, impactante)
- prompt: prompt optimizado para generar una imagen con IA (en inglés, detallado, vertical 9:16, estilo ${style})

Responde ÚNICAMENTE con un array JSON válido. Ejemplo:
[
  {"text":"El protagonista despierta en un mundo desconocido","prompt":"A person waking up in an unknown alien world, cinematic lighting, vertical 9:16 composition, ${style} style, highly detailed"}
]

NO incluyas markdown, NO expliques nada, SOLO el array JSON.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1500
    })
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  const content = data.choices[0].message.content;
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const scenes = JSON.parse(clean);

  return scenes.map((s, i) => ({
    id: i + 1,
    text: s.text,
    prompt: s.prompt,
    duration: sceneDuration
  }));
}

async function generateScriptPollinations(idea, style, sceneCount, sceneDuration) {
  const prompt = `Create a ${sceneCount}-scene vertical video script (9:16) for this idea: "${idea}".
Style: ${style}.
Each scene is ${sceneDuration} seconds.

Return ONLY a JSON array like:
[{"text":"Short scene description in Spanish","prompt":"Detailed English image generation prompt, vertical 9:16, ${style} style"}]

NO markdown, NO explanation, ONLY the JSON array.`;

  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      seed: Math.floor(Math.random() * 999999)
    })
  });

  if (!response.ok) throw new Error(`Pollinations error: ${response.status}`);
  const data = await response.json();
  const content = data.choices[0].message.content;
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const scenes = JSON.parse(clean);

  return scenes.map((s, i) => ({
    id: i + 1,
    text: s.text,
    prompt: s.prompt,
    duration: sceneDuration
  }));
}

// =====================
// GENERAR VOZ (TTS)
// =====================
app.post('/api/voice', async (req, res) => {
  try {
    const { text, sceneId } = req.body;
    if (!text || text.trim().length < 2) {
      return res.status(400).json({ error: 'El texto es requerido' });
    }

    let audioUrl, provider;

    if (process.env.ELEVENLABS_API_KEY) {
      const result = await generateVoiceElevenLabs(text, sceneId);
      audioUrl = result.url;
      provider = 'elevenlabs';
    } else if (process.env.OPENAI_API_KEY) {
      const result = await generateVoiceOpenAI(text, sceneId);
      audioUrl = result.url;
      provider = 'openai';
    } else {
      return res.status(400).json({ 
        error: 'No hay proveedor de voz configurado. Añade ELEVENLABS_API_KEY u OPENAI_API_KEY en el .env' 
      });
    }

    res.json({ audioUrl, provider, sceneId, text });
  } catch (err) {
    console.error('Error generando voz:', err.message);
    res.status(500).json({ error: 'Error generando voz', detail: err.message });
  }
});

async function generateVoiceElevenLabs(text, sceneId) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const filename = `voice_${sceneId}_${uuidv4()}.mp3`;
  const filepath = path.join(audioDir, filename);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${errText}`);
  }

  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
  return { url: `${PUBLIC_URL}/audio/${filename}` };
}

async function generateVoiceOpenAI(text, sceneId) {
  const filename = `voice_${sceneId}_${uuidv4()}.mp3`;
  const filepath = path.join(audioDir, filename);

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'alloy',
      response_format: 'mp3'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS ${response.status}: ${errText}`);
  }

  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
  return { url: `${PUBLIC_URL}/audio/${filename}` };
}

// =====================
// GENERAR IMÁGENES (URLs)
// =====================
app.post('/api/images', async (req, res) => {
  try {
    const { scenes } = req.body;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de escenas' });
    }

    const images = scenes.map((scene, i) => {
      const seed = Math.floor(Math.random() * 999999);
      const prompt = encodeURIComponent(scene.prompt || scene.text);
      return {
        sceneId: scene.id || i + 1,
        url: `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1920&seed=${seed}&nologo=true&enhance=true`,
        prompt: scene.prompt || scene.text
      };
    });

    res.json({ images, provider: 'pollinations' });
  } catch (err) {
    console.error('Error generando imágenes:', err.message);
    res.status(500).json({ error: 'Error generando imágenes', detail: err.message });
  }
});

// =====================
// RENDERIZAR VIDEO: Recibe WebM, devuelve MP4
// =====================
app.post('/api/render', upload.single('video'), async (req, res) => {
  const inputPath = req.file?.path;

  if (!inputPath) {
    return res.status(400).json({ error: 'No se recibió archivo de video' });
  }

  const outputName = `video_${uuidv4()}.mp4`;
  const outputPath = path.join(outputDir, outputName);

  try {
    console.log(`[RENDER] Input: ${inputPath} (${fs.statSync(inputPath).size} bytes)`);

    // Verificar que ffmpeg está disponible
    await execPromise('ffmpeg -version');

    // Convertir WebM -> MP4 H.264 + AAC
    // -c:v libx264: codec de video H.264
    // -preset fast: balance velocidad/calidad
    // -crf 23: calidad constante (18-28, 23 es buen balance)
    // -c:a aac: codec de audio AAC
    // -b:a 128k: bitrate de audio
    // -movflags +faststart: permite reproducir antes de descargar completo
    // -pix_fmt yuv420p: compatibilidad máxima con reproductores
    // -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" 
    //   fuerza resolución exacta 1080x1920 con padding si es necesario
    const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" "${outputPath}" -y`;

    console.log(`[RENDER] Ejecutando: ${ffmpegCmd}`);
    const { stdout, stderr } = await execPromise(ffmpegCmd);

    if (stderr) console.log(`[FFMPEG] ${stderr.substring(0, 500)}...`);

    // Verificar que el MP4 se generó
    if (!fs.existsSync(outputPath)) {
      throw new Error('ffmpeg no generó el archivo MP4');
    }

    const stats = fs.statSync(outputPath);
    console.log(`[RENDER] Output: ${outputPath} (${stats.size} bytes)`);

    // Verificar que es un MP4 válido leyendo los primeros bytes
    const fd = fs.openSync(outputPath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const isMP4 = buffer.toString('hex').includes('66747970') || buffer.toString('hex').includes('6d6f6f76');
    console.log(`[RENDER] Firma MP4 válida: ${isMP4}`);

    // Limpiar archivo WebM de entrada
    fs.unlinkSync(inputPath);

    const mp4Url = `${PUBLIC_URL}/output/${outputName}`;

    res.json({ 
      mp4Url, 
      format: 'mp4',
      codec: 'H.264 + AAC',
      resolution: '1080x1920',
      size: stats.size,
      valid: isMP4
    });

  } catch (err) {
    console.error('[RENDER] Error:', err.message);
    // Limpiar archivos temporales
    if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.status(500).json({ 
      error: 'Error renderizando video', 
      detail: err.message 
    });
  }
});

// =====================
// INICIAR SERVIDOR
// =====================
app.listen(PORT, () => {
  console.log(`🚀 VideoIA Backend corriendo en puerto ${PORT}`);
  console.log(`📡 Health check: ${PUBLIC_URL}/api/health`);
  console.log(`🎬 Render MP4: ${PUBLIC_URL}/api/render (POST multipart/video)`);
  console.log(`🔑 Voz: ${process.env.ELEVENLABS_API_KEY ? 'ElevenLabs' : process.env.OPENAI_API_KEY ? 'OpenAI' : 'NO CONFIGURADO'}`);
  console.log(`📝 Guion: ${process.env.OPENAI_API_KEY ? 'OpenAI GPT-4o-mini' : 'Pollinations.ai (gratis)'}`);
});
