#!/usr/bin/env bash
# Limpia el .git que pudo quedar a medias por la sync de Drive y hace push limpio
# usando HTTPS (más confiable que SSH cuando tienes varias cuentas de GitHub).
#
# Uso:
#   1) Genera un Personal Access Token de la cuenta `dmnavalon1984`:
#      https://github.com/settings/tokens?type=beta
#      → Generate new token (fine-grained)
#      → Repository access: Only select repositories → dmnavalon1984/gastos2
#      → Repository permissions: Contents → Read and write
#      → Generate. Copia el token (empieza con github_pat_...)
#
#   2) bash scripts/init-and-push.sh
#      Cuando pida usuario: dmnavalon1984
#      Cuando pida password: pega el TOKEN (no tu password real)
#
# Si NO existe el repo gastos2 todavía en la cuenta dmnavalon1984, créalo primero:
#   https://github.com/new → owner: dmnavalon1984 → name: gastos2 → Private → Create
#   (NO inicialices con README, .gitignore ni license — repo vacío)

set -e

REPO_HTTPS="https://github.com/dmnavalon1984/gastos2.git"

echo "🧹 Limpiando .git previo (si existe)..."
rm -rf .git

echo "📦 Inicializando repo nuevo..."
git init -b main
git config user.email "diego@fundacionrida.org"
git config user.name "Diego Martínez"

# Apaga la pregunta del fingerprint de SSH por si acaso (no la usaremos)
git config core.sshCommand ""

echo "📝 Commit inicial..."
git add -A
git commit -m "Initial commit: bot Telegram + dashboard Next.js + Apps Script

- src/lib: clientes Anthropic Haiku, Groq Whisper, Google Sheets, Telegram
- src/app/api/telegram/webhook: recibe texto/foto/audio, extrae con Haiku,
  presenta confirmacion con botones inline, escribe a Sheets
- src/app/api/cron/monthly: cron mensual sueldo + resumen IA
- src/app: dashboard con cards, charts (Recharts), presupuestos, login Google OAuth
- apps-script/: cartolas PDF de Gmail (4 bancos) con conciliacion
- 13 categorias iniciales, 28 reglas seed de comercios chilenos"

echo "🌐 Conectando con remoto (HTTPS)..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_HTTPS"

echo "🚀 Push..."
echo "  → Cuando pida usuario, escribe: dmnavalon1984"
echo "  → Cuando pida password, pega tu Personal Access Token (NO tu password real)"
echo ""

git push -u origin main

echo ""
echo "✅ Listo. Repo en https://github.com/dmnavalon1984/gastos2"
