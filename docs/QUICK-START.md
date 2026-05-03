# Quick Start — Resumen de los pasos pendientes

Cuando vuelvas, tienes que hacer estos pasos en orden. Cada uno está
explicado en detalle en `README.md`.

## ✅ Ya está hecho

- Planilla `Control de Gastos.xlsx` en tu carpeta de Drive
- Repo completo de código (bot + dashboard + apps-script)
- Prompts de IA, lógica de extracción, conciliación, presupuestos
- README completo de despliegue

## ⏳ Pendiente — necesita tu interacción manual

| # | Paso | Tiempo | Bloquea |
|---|---|---|---|
| 1 | Convertir xlsx → Google Sheet nativo (un click derecho) | 1 min | todo |
| 2 | Crear service account de Google Cloud + descargar JSON + compartir Sheet | 8 min | bot, dashboard |
| 3 | `git push` el repo a `dmnavalon1984/gastos2` | 2 min | deploy |
| 4 | Deploy a Vercel + 18 env vars | 8 min | bot funcionando |
| 5 | OAuth Google (consent screen + Web client) | 7 min | dashboard auth |
| 6 | `npm run set-webhook` (después que Vercel esté arriba) | 1 min | bot recibe mensajes |
| 7 | `/start` en Telegram → copiar chat_id → pegarlo en Vercel env | 2 min | bot autorizado |
| 8 | Editar sueldo en `Ingresos_Fijos` | 30 seg | resumen mensual real |
| 9 | Apps Script: pegar código + 3 properties + habilitar Drive API + setupTriggers() | 10 min | cartolas mensuales |
| 10 | Probar end-to-end con un mensaje real | 2 min | confianza |

**Total: ~45 minutos de configuración manual.**

## Atajo: orden recomendado en una sola sesión

1. Abre dos pestañas: Vercel + Google Cloud Console
2. Sigue el README sección por sección. Si algo falla, los logs de Vercel
   te dicen exactamente qué env var falta.
3. Cuando termines el paso 7, ya tienes el bot funcionando — el resto (Apps Script)
   es solo para que se procesen las cartolas a fin de mes (no urgente).
