# VideoIA Backend — Guía de Despliegue en Render

## ⚠️ IMPORTANTE: Este backend usa Node.js + Express, NO FastAPI

El backend está construido con **Node.js 18** y **Express 4**, no con Python/FastAPI.
Render ejecutará el `Dockerfile` que instala Node.js + ffmpeg automáticamente.

---

## 📁 Archivos que debes subir a GitHub

Crea un repositorio llamado `videoia-backend` y sube estos 5 archivos:

```
videoia-backend/
├── Dockerfile          ← Instala Node 18 + ffmpeg
├── package.json        ← Dependencias de Node
├── server.js           ← Código del servidor (endpoints)
├── render.yaml         ← Configuración para Render (opcional)
└── README.md           ← Este archivo (opcional)
```

**NO subas un archivo `.env`** con tus claves API. Las claves se configuran
en Render directamente, no en GitHub.

---

## 🚀 Paso a paso para desplegar en Render

### Paso 1: Crear repositorio en GitHub
1. Ve a https://github.com
2. Crea un repositorio nuevo llamado `videoia-backend`
3. Selecciona **Public**
4. Toca "Create repository"

### Paso 2: Subir los archivos
1. En tu repositorio, toca "Add file" → "Upload files"
2. Sube los 5 archivos listados arriba
3. Commit message: `Initial backend deploy`
4. Toca "Commit changes"

### Paso 3: Crear servicio en Render
1. Ve a https://dashboard.render.com
2. Crea una cuenta (puedes usar "Sign up with GitHub")
3. Toca el botón azul "New +" → "Web Service"
4. Conecta tu cuenta de GitHub
5. Busca y selecciona el repositorio `videoia-backend`
6. Render detectará automáticamente el `Dockerfile`

### Paso 4: Configurar el servicio
Rellena estos campos exactamente:

| Campo | Valor |
|-------|-------|
| **Name** | `videoia-backend` |
| **Runtime** | `Docker` (Render lo detecta automáticamente) |
| **Plan** | `Free` |

### Paso 5: Variables de entorno
Desplázate hasta "Environment Variables" y añade:

```
PUBLIC_URL=https://videoia-backend-XXXX.onrender.com
```

> Nota: La URL exacta la obtendrás DESPUÉS del primer deploy.
> Por ahora puedes dejarla vacía o poner un valor temporal.

**Opcional — solo si quieres voz real:**
```
ELEVENLABS_API_KEY=sk_tu_key_aqui
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

**Opcional — solo si quieres guiones GPT-4o:**
```
OPENAI_API_KEY=sk-tu_key_aqui
```

> Sin estas claves, el backend funciona igual con Pollinations.ai (gratis).

### Paso 6: Deploy
1. Toca "Create Web Service"
2. Espera 3-5 minutos mientras Render construye la imagen Docker
   (instala Node.js 18 + ffmpeg)
3. Verás los logs en tiempo real

### Paso 7: Obtener tu URL
Cuando termine el deploy (estado verde "Live"):
1. Verás una URL como: `https://videoia-backend-abc123.onrender.com`
2. **Copia esta URL exacta**
3. Ve a Settings → Environment Variables
4. Edita `PUBLIC_URL` con tu URL real
5. Guarda (Render reiniciará automáticamente)

---

## 🔍 Cómo probar que el backend funciona

### Prueba 1: Health Check
Abre en tu navegador:
```
https://tu-url.onrender.com/api/health
```

Debe devolver:
```json
{
  "status": "ok",
  "timestamp": "2026-08-15T...",
  "ffmpeg": true
}
```

### Prueba 2: Generar guion
Envía una petición POST:
```bash
curl -X POST https://tu-url.onrender.com/api/script \
  -H "Content-Type: application/json" \
  -d '{"idea":"Un gato astronauta en Marte","style":"cyberpunk","duration":15}'
```

Debe devolver un array de escenas con text y prompt.

### Prueba 3: Verificar ffmpeg
El health check indica `"ffmpeg": true` cuando ffmpeg está instalado.
En los logs de Render verás la instalación de ffmpeg durante el build.

---

## 📊 Limitaciones del plan gratuito de Render

| Aspecto | Límite | Impacto |
|---------|--------|---------|
| **Tiempo de inactividad** | 15 min sin tráfico → el servidor "duerme" | Primer request tarda 30-60s en despertar |
| **RAM** | 512 MB | Suficiente para videos de 15-30 segundos |
| **Disco** | Ephemeral (se borra al reiniciar) | Archivos generados se pierden al dormir |
| **CPU** | Compartida | ffmpeg tarda 10-30 segundos en convertir |
| **Timeout** | 100 segundos por request | Videos de hasta ~45 segundos |
| **Ancho de banda** | 100 GB/mes | Suficiente para uso personal |

---

## 🔗 Conectar con la PWA

1. Despliega la PWA en GitHub Pages
2. Abre la PWA en Chrome Android
3. Toca "Configurar Backend"
4. Pega tu URL de Render
5. Toca "Probar Conexión"
