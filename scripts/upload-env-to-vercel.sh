#!/usr/bin/env bash
# Sube todas las env vars desde .env.local a Vercel (production + preview + development).
# Usa un Vercel Access Token para AISLAR esta sesión del login global del CLI.
# Esto evita conflictos cuando trabajas con varias cuentas de Vercel.
#
# Pre-requisito (UNA sola vez):
#   1. Loguéate en Vercel como diego@fundacionrida.org
#   2. Ve a https://vercel.com/account/tokens
#   3. Create Token:
#        - Name: claude-gastos2
#        - Scope: Full Account (o el team que contiene el proyecto)
#        - Expiration: 30 días
#   4. Copia el token y guárdalo en este archivo:
#        echo "TU_TOKEN_AQUI" > .vercel-token
#      (el archivo .vercel-token está en .gitignore — no se commitea)
#
# Uso:
#   bash scripts/upload-env-to-vercel.sh

set -e

cd "$(dirname "$0")/.."

# 1. Verificar que vercel CLI esté instalado
if ! command -v vercel &> /dev/null; then
  echo "📦 Instalando vercel CLI globalmente..."
  npm install -g vercel
fi

# 2. Cargar el token
if [ -n "$VERCEL_TOKEN" ]; then
  TOKEN="$VERCEL_TOKEN"
elif [ -f ".vercel-token" ]; then
  TOKEN=$(cat .vercel-token | tr -d '[:space:]')
else
  cat <<EOF
❌ No encontré el token de Vercel.

Para no pisar tu login de otros proyectos, este script usa un token aislado.
Sigue estos pasos UNA sola vez:

  1. Ve a https://vercel.com/account/tokens (logueado como diego@fundacionrida.org)
  2. Create Token:
       - Name: claude-gastos2
       - Scope: Full Account
       - Expiration: 30 days
  3. Copia el token y ejecuta:
       echo "TU_TOKEN_AQUI" > .vercel-token

  4. Vuelve a correr este script.

EOF
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Token vacío"
  exit 1
fi

VFLAG="--token=$TOKEN"

# 3. Verificar token (whoami con scope correcto)
echo "🔐 Verificando token..."
vercel whoami $VFLAG 2>&1 | sed 's/^/  /'
echo ""

# 4. Linkear al proyecto si no está linkeado
if [ ! -f ".vercel/project.json" ]; then
  echo "🔗 Linkeando con tu proyecto Vercel..."
  echo "   (elige el proyecto 'gastos2' de la cuenta diego@fundacionrida.org)"
  vercel link $VFLAG
fi

# Mostrar el proyecto linkeado
if [ -f ".vercel/project.json" ]; then
  PROJECT_NAME=$(grep -o '"projectId":"[^"]*"' .vercel/project.json | cut -d'"' -f4)
  echo "✅ Proyecto linkeado: $PROJECT_NAME"
fi
echo ""

# 5. Leer .env.local y subir cada variable
if [ ! -f ".env.local" ]; then
  echo "❌ No existe .env.local — abortar"
  exit 1
fi

echo "📤 Subiendo variables a Vercel..."

# Variables que NO deben subirse al .env de Vercel (son placeholders locales)
SKIP_VARS=("NEXTAUTH_URL" "APP_BASE_URL" "TELEGRAM_ALLOWED_CHAT_ID")

uploaded=0
skipped=0

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

    # Skip vars de placeholder
    skip=0
    for s in "${SKIP_VARS[@]}"; do
      if [ "$key" = "$s" ]; then skip=1; break; fi
    done
    if [ $skip -eq 1 ]; then
      echo "  ⏭️  SKIP $key (se setea después con la URL real de Vercel)"
      ((skipped++))
      continue
    fi

    if [ -z "$value" ]; then
      echo "  ⚠️  VACÍA $key — saltando"
      ((skipped++))
      continue
    fi

    # Borrar si ya existe (idempotente)
    vercel env rm "$key" production -y $VFLAG 2>/dev/null || true
    vercel env rm "$key" preview -y $VFLAG 2>/dev/null || true
    vercel env rm "$key" development -y $VFLAG 2>/dev/null || true

    # Agregar a los 3 environments
    printf "%s" "$value" | vercel env add "$key" production $VFLAG > /dev/null 2>&1
    printf "%s" "$value" | vercel env add "$key" preview $VFLAG > /dev/null 2>&1
    printf "%s" "$value" | vercel env add "$key" development $VFLAG > /dev/null 2>&1
    echo "  ✅ $key"
    ((uploaded++))
  fi
done < .env.local

echo ""
echo "✨ Resumen: $uploaded variables cargadas, $skipped saltadas."
echo ""
echo "Ahora trigger redeploy con env vars activas:"
echo "  vercel --prod $VFLAG"
echo ""
echo "O simplemente cualquier push a main dispara redeploy automático."
