/**
 * Helpers de setup. Ejecutar una sola vez después de pegar el código.
 */

function setupTriggers() {
  // Limpiar triggers anteriores del proyecto
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === "procesarCartolasMensuales") {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Trigger día 5 de cada mes a las 7am
  ScriptApp.newTrigger("procesarCartolasMensuales")
    .timeBased()
    .onMonthDay(5)
    .atHour(7)
    .create();

  Logger.log("✅ Trigger creado: procesarCartolasMensuales — día 5 de cada mes 7am");
}

function probarManual() {
  // Para probar sin esperar el día 5
  procesarCartolasMensuales();
}

function configurarPropiedades() {
  // Helper: edita los valores y ejecuta UNA VEZ
  const props = PropertiesService.getScriptProperties();
  // ⚠️ Edita estos valores antes de correr esta función
  // props.setProperty("ANTHROPIC_API_KEY", "sk-ant-...");
  // props.setProperty("TELEGRAM_BOT_TOKEN", "XXX:YYY");
  // props.setProperty("TELEGRAM_CHAT_ID", "123456789");
  Logger.log("Propiedades actuales:");
  const all = props.getProperties();
  for (const k in all) {
    Logger.log(`  ${k}: ${all[k].slice(0, 8)}...`);
  }
}
