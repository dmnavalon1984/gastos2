#!/usr/bin/env bash
# Sube todas las env vars desde .env.local a Vercel (production + preview + development).
#
# Uso (UNA sola vez por sesión):
#   bash scripts/upload-env-to-vercel.sh
#
# La primera vez te va a pedir:
#   - Login a Vercel (te abre el browser)
#   - Linkear con el proyecto (elige "gastos2" o el nombre que le pusiste)

set -e

cd "$(dirname "$0")/.."

# 1. Verificar que vercel CLI esté instalado
if ! command -v vercel &> /dev/null; then
  echo "📦 Instalando vercel CLI globalmente..."
  npm install -g vercel
fi

# 2. Login (idempotente — si ya estás logueado, sigue de largo)
if ! vercel whoami &> /dev/null; then
  echo "🔐 Login a Vercel (te abre el browser)..."
  vercel login
fi

echo "✅ Logueado como: $(vercel whoami)"
echo ""

# 3. Link al proyecto (idempotente — si ya está linkeado, sigue)
if [ ! -f ".vercel/project.json" ]; then
  echo "🔗 Linkeando con tu proyecto Vercel..."
  echo "   (elige el proyecto 'gastos2' que ya creaste)"
  vercel link
fi

echo "✅ Proyecto linkeado"
echo ""

# 4. Leer .env.local y subir cada variable
if [ ! -f ".env.local" ]; then
  echo "❌ No existe .env.local — abortar"
  exit 1
fi

echo "📤 Subiendo variables a Vercel..."

# Variables que NO deben subirse al .env de Vercel (son placeholders locales)
SKIP_VARS=("NEXTAUTH_URL" "APP_BASE_URL" "TELEGRAM_ALLOWED_CHAT_ID")

# Leer .env.local línea por línea
while IFS= read -r line; do
  # saltar comentarios y líneas vacías
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue

  # extraer KEY y VALUE
  if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    # quitar comillas dobles externas si existen
    value="${value#\"}"
    value="${value%\"}"

    # Skip vars
    skip=0
    for s in "${SKIP_VARS[@]}"; do
      if [ "$key" = "$s" ]; then skip=1; break; fi
    done
    if [ $skip -eq 1 ]; then
      echo "  ⏭️  SKIP $key (se setea después con la URL real de Vercel)"
      continue
    fi

    if [ -z "$value" ]; then
      echo "  ⚠️  VACÍA $key — saltando"
      continue
    fi

    # Borrar si ya existe (vercel env add da error si ya existe)
    vercel env rm "$key" production -y 2>/dev/null || true
    vercel env rm "$key" preview -y 2>/dev/null || true
    vercel env rm "$key" development -y 2>/dev/null || true

    # Agregar a los 3 environments
    printf "%s" "$value" | vercel env add "$key" production 2>&1 | tail -1
    printf "%s" "$value" | vercel env add "$key" preview 2>&1 | tail -1
    printf "%s" "$value" | vercel env add "$key" development 2>&1 | tail -1
    echo "  ✅ $key"
  fi
done < .env.local

echo ""
echo "✨ Listo. Variables cargadas. Ahora trigger redeploy:"
echo "   vercel --prod"
echo ""
echo "O simplemente esperá al próximo push a main."
