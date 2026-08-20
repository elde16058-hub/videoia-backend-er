// test-backend.js
// Script para probar el backend de VideoIA
// Uso: node test-backend.js
// O: BACKEND_URL=https://tu-url.onrender.com node test-backend.js

const http = require('http');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const client = url.protocol === 'https:' ? require('https') : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('🧪 Probando backend:', BASE_URL);
  console.log('');

  // Test 1: Health
  console.log('1️⃣  Health Check...');
  const h = await request('/api/health');
  console.log('   Status:', h.status);
  console.log('   Respuesta:', JSON.stringify(h.body, null, 2));
  console.log('');

  // Test 2: Script
  console.log('2️⃣  Generar guion...');
  const s = await request('/api/script', 'POST', {
    idea: 'Un gato astronauta explorando Marte',
    style: 'cyberpunk',
    duration: 15
  });
  console.log('   Status:', s.status);
  console.log('   Escenas:', s.body.script?.length || 0);
  if (s.body.script) {
    s.body.script.forEach((sc, i) => {
      console.log(`   [${i+1}] ${sc.text.substring(0, 60)}...`);
    });
  }
  console.log('');

  // Test 3: Images
  console.log('3️⃣  Generar URLs de imágenes...');
  const img = await request('/api/images', 'POST', {
    scenes: [{ id: 1, text: 'Escena 1', prompt: 'A cat astronaut on Mars, cyberpunk style' }]
  });
  console.log('   Status:', img.status);
  console.log('   Imágenes:', img.body.images?.length || 0);
  console.log('');

  console.log('✅ Tests completados');
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
