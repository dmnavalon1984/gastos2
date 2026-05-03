# Gastos2 — Control de gastos personal

Bot de Telegram + Dashboard web (Vercel) + Google Sheets + Claude Haiku
para registrar y analizar gastos personales con 4 bancos chilenos.

## Arquitectura

```
┌─────────────┐  push/screenshot/audio  ┌──────────────────┐
│ Notif banco │ ────────────────────► │ Telegram bot     │
└─────────────┘                        └────────┬─────────┘
                                                 │
                  ┌──────────────────────────────┴──────────────┐
                  │                                              │
            ┌─────▼──────┐                              ┌────────▼──────┐
            │ Groq       │ (audio → texto)              │ Claude Haiku  │
            │ Whisper    │                              │ (extrae+cat)  │
            └────────────┘                              └────────┬──────┘
                                                                  │
                                                          ┌───────▼──────┐
                                                          │ Google Sheet │
                                                          │ "Movimientos"│
                                                          └───────┬──────┘
                                                                  │
            ┌─────────────────┐                          ┌────────▼─────────┐
            │ Apps Script     │── lee Gmail PDF cartolas │ Vercel Dashboard │
            │ (cron mensual)  │── concilia y completa    │ (Next.js + auth) │
            └─────────────────┘                          └──────────────────┘
```

## Estado (al deploy)

✅ Google Sheet creada en `Personal/Control de Gastos/Control de Gastos.xlsx`
✅ Repo con código completo de bot, dashboard, Apps Script
⏳ Falta: deploy a Vercel + service account + OAuth + setup webhook + Apps Script

## Pasos de despliegue (orden estricto)

### 1. Convertir el xlsx a Google Sheet nativo

1. Abre Google Drive en el navegador
2. Ve a `Personal/Control de Gastos/`
3. Click derecho sobre `Control de Gastos.xlsx` → **Abrir con → Google Sheets**
4. Una vez abierto: **Archivo → Guardar como Google Sheets**
5. Borra el `.xlsx` viejo (deja solo la versión nativa)
6. Copia el ID de la URL: `https://docs.google.com/spreadsheets/d/`**`<ESTE_ID>`**`/edit`

### 2. Service Account para Sheets API

1. Ve a https://console.cloud.google.com/
2. Crea un proyecto nuevo: **`control-gastos-2026`**
3. Habilita **Google Sheets API**: APIs & Services → Library → buscar "Sheets API" → Enable
4. **APIs & Services → Credentials → Create Credentials → Service Account**
   - Nombre: `gastos-sheets-bot`
   - Skip los roles (no necesita)
   - Done
5. Click en el service account creado → tab **Keys** → **Add Key → JSON**
6. Se descarga un JSON. Ábrelo y guarda:
   - `client_email` (ej: `gastos-sheets-bot@control-gastos-2026.iam.gserviceaccount.com`)
   - `private_key` (la string completa con `\n`)
7. **IMPORTANTE — Compartir la planilla**:
   - Abre tu Google Sheet
   - Click en **Compartir** (esquina sup. derecha)
   - Pega el `client_email` del service account → Editor → Enviar

### 3. Subir el repo a GitHub

Desde tu Mac, terminal:

```bash
cd "/Users/diego/Library/CloudStorage/GoogleDrive-diego.martinez@ogr.cl/My Drive/Personal/Control de Gastos/gastos2"
bash scripts/init-and-push.sh
```

El script limpia cualquier `.git` parcial (Google Drive sync a veces lo deja a medias),
hace `git init`, commit y push.

Si falla por SSH (no tienes SSH key), edita el script para que use HTTPS:
- Cambiá `git@github.com:dmnavalon1984/gastos2.git`
- Por `https://github.com/dmnavalon1984/gastos2.git`
- Te va a pedir un Personal Access Token (https://github.com/settings/tokens)

### 4. Deploy a Vercel

1. Ve a https://vercel.com/new
2. Importa `dmnavalon1984/gastos2`
3. Framework: Next.js (auto-detectado)
4. Antes de hacer deploy, agrega estas **Environment Variables** (Settings → Environment Variables):

| Variable | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `8646118361:AAG6...` (tu token) |
| `TELEGRAM_WEBHOOK_SECRET` | `<genera string aleatorio>` |
| `TELEGRAM_ALLOWED_CHAT_ID` | (déjalo vacío inicial — se llena al primer /start) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |
| `GROQ_API_KEY` | `gsk_...` |
| `GROQ_AUDIO_MODEL` | `whisper-large-v3-turbo` |
| `GOOGLE_SHEET_ID` | (el ID que copiaste en el paso 1) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `gastos-sheets-bot@...iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | (pega la private_key completa, incluye `\n` literales) |
| `GOOGLE_OAUTH_CLIENT_ID` | (siguiente paso) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (siguiente paso) |
| `ALLOWED_EMAIL` | `diego@fundacionrida.org` |
| `NEXTAUTH_SECRET` | `<openssl rand -base64 32>` |
| `NEXTAUTH_URL` | `https://gastos2.vercel.app` (la URL final de tu deploy) |
| `APP_BASE_URL` | igual que NEXTAUTH_URL |
| `TIMEZONE` | `America/Santiago` |
| `CRON_SECRET` | `<otro string aleatorio>` |

5. Click **Deploy**. Espera 2-3 minutos.

### 5. Google OAuth (para login del dashboard)

1. Vuelve a https://console.cloud.google.com (mismo proyecto del paso 2)
2. **APIs & Services → OAuth consent screen**:
   - User type: External (sin verificación, solo tú vas a entrar)
   - App name: `Gastos2 Dashboard`
   - User support email: `diego@fundacionrida.org`
   - Developer email: `diego@fundacionrida.org`
   - Save → Test users → Add `diego@fundacionrida.org`
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Name: `Gastos2 web`
   - Authorized redirect URIs: agrega
     - `https://<tu-deploy>.vercel.app/api/auth/callback`
     - `http://localhost:3000/api/auth/callback` (para desarrollo)
4. Copia **Client ID** y **Client Secret** → ponlos en Vercel env vars (paso 4)
5. Re-deploya en Vercel (Deployments → ⋯ → Redeploy)

### 6. Setear el webhook de Telegram

Desde tu Mac (con el repo clonado):

```bash
cd ".../gastos2"

# Edita .env.local: cambia APP_BASE_URL a la URL real de Vercel
nano .env.local
# APP_BASE_URL=https://gastos2.vercel.app

npm install
npm run set-webhook
```

Debería responder:
```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

### 7. Primer mensaje al bot

1. Abre Telegram → busca tu bot por username (el que pusiste en `@BotFather`)
2. Envía `/start`
3. El bot responde con un mensaje de bienvenida y te dice **tu chat_id**
4. Copia ese chat_id → ponlo en `TELEGRAM_ALLOWED_CHAT_ID` en Vercel
5. Redeploy

### 8. Configurar el sueldo fijo

1. Abre la planilla → hoja **Ingresos_Fijos**
2. Edita la fila 2 con tu sueldo líquido real (la celda amarilla)
3. Listo — el día 1 de cada mes se inserta automáticamente

### 9. Apps Script (cartolas mensuales)

1. Abre la planilla → **Extensiones → Apps Script**
2. Borra el `Code.gs` que viene por defecto
3. Pega el contenido de `apps-script/Code.gs` (de este repo)
4. Crea un archivo nuevo `setup.gs` y pega `apps-script/setup.gs`
5. Renombra `appsscript.json` (en el menú Project Settings → Show "appsscript.json"), pega el contenido de `apps-script/appsscript.json`
6. **Project Settings → Script Properties → Add Property**:
   - `ANTHROPIC_API_KEY` = tu key de Anthropic
   - `TELEGRAM_BOT_TOKEN` = tu token
   - `TELEGRAM_CHAT_ID` = tu chat_id
7. **Habilitar Drive API**:
   - En el editor: Services (icono +) → Drive API → Add
8. Ejecuta una vez `setupTriggers()` desde el editor (te va a pedir permisos de Gmail/Drive/Sheets — concédelos)
9. Para probar manualmente sin esperar al día 5: ejecuta `probarManual()`

### 10. Probar end-to-end

1. **Texto**: copia esta notificación de prueba y mándala al bot:
   ```
   Compra por $14.990 en JUMBO con tarjeta ****1234 el día de hoy. Banco de Chile.
   ```
   Deberías recibir:
   - Confirmación de extracción con monto, comercio, categoría sugerida
   - Botones para confirmar/cambiar categoría
   - Al confirmar: aparece en la planilla `Movimientos`

2. **Imagen**: tomá un screenshot de cualquier app bancaria → mándalo al bot
3. **Audio**: graba "almorzé en el peruano de Providencia, gasté veintiocho mil pesos" → mándalo

4. **Dashboard**: abre `https://<tu-deploy>.vercel.app` → login con Google → ves los gastos en vivo

## Costos estimados

- **Vercel**: $0 (Hobby tier, infinito para uso personal)
- **Telegram bot**: $0
- **Google Sheets / Drive / Apps Script**: $0 (incluido en Workspace)
- **Groq Whisper**: ~$0.02 USD/mes con tu volumen de audios
- **Claude Haiku**: ~$1-2 USD/mes (estimado: 50 gastos/mes × ~600 tokens c/u × $1/Mtok)
- **TOTAL: ~USD 1-2 por mes**

## Troubleshooting

- **Bot no responde**: revisar `https://<tu-deploy>.vercel.app/api/telegram/webhook` (debe devolver `{ok: true}`)
- **403 al login**: el email no es `ALLOWED_EMAIL`
- **Sheets devuelve 403**: el service account no fue agregado como Editor en la planilla
- **Cartolas no detectadas**: ajustar el `queryGmail` por banco en `apps-script/Code.gs` (depende del remitente exacto que use el banco)

## Estructura del repo

```
gastos2/
├── src/
│   ├── app/                    # Next.js App Router (dashboard + API routes)
│   │   ├── api/
│   │   │   ├── telegram/webhook/  # Webhook que Telegram llama
│   │   │   ├── cron/monthly/      # Cron mensual (sueldo + resumen)
│   │   │   └── auth/              # OAuth Google
│   │   ├── login/page.tsx
│   │   ├── page.tsx               # Dashboard principal
│   │   └── Charts.tsx             # Componente de gráficos
│   └── lib/
│       ├── anthropic.ts           # Cliente Haiku
│       ├── groq.ts                # Cliente Whisper
│       ├── sheets.ts              # Cliente Google Sheets
│       ├── telegram.ts            # Cliente Telegram API
│       ├── pending.ts             # Almacén de pendientes de confirmación
│       ├── auth.ts                # Sesión por cookie firmada
│       ├── prompts.ts             # Prompts de Haiku
│       ├── budget-alerts.ts       # Detección de superación de presupuesto
│       └── types.ts               # Tipos compartidos
├── apps-script/
│   ├── Code.gs                    # Apps Script para cartolas Gmail
│   ├── setup.gs                   # Helpers
│   └── appsscript.json
├── scripts/
│   ├── set-telegram-webhook.mjs   # Setear webhook de Telegram
│   └── test-extract.mjs           # Probar extracción Haiku sin desplegar
├── docs/                          # Documentación adicional
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vercel.json                    # Config cron Vercel
└── .gitignore
```

## Mantenimiento

- **Cambiar presupuestos**: editar hoja `Presupuestos` directamente
- **Agregar categoría**: agregar fila en `Categorias` y actualizar `src/lib/types.ts` `CATEGORIAS`
- **Limpiar fila ejemplo**: borrar la fila 2 de `Movimientos` (la gris en cursiva)
- **Reglas aprendidas**: el bot las va creando solo. Editá si querés forzar
- **Resetear todo**: borrar movimientos + reiniciar `Reglas_Aprendidas` (deja solo las seed)
