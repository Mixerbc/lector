/**
 * Netlify Function: proxy para NewsAPI.
 * Evita llamadas directas desde el navegador (restricción plan Developer).
 *
 * Query params:
 *   - mode=top     → top-headlines (requiere category)
 *   - mode=everything → everything (requiere q)
 *
 * En local: carga .env de la raíz del proyecto con dotenv.
 * En producción: Netlify inyecta NEWS_API_KEY en Environment variables.
 */

const path = require("path");

// Cargar .env desde la raíz del proyecto (solo afecta si las vars no están ya definidas).
// En Netlify producción las inyecta el propio Netlify; en local (netlify dev) las lee del .env.
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
} catch (e) {
  // dotenv no instalado (ej. en Netlify build sin dependencias locales); en prod no hace falta.
}

// Logs de diagnóstico: poner a true para depurar, false en uso normal.
const DEBUG_NEWS = false;

const NEWS_API_BASE = "https://newsapi.org/v2";
const COUNTRY = "mx";

/** Respuesta JSON consistente para el frontend. */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

/** Enmascara la API key para no imprimirla entera en logs (ej: "80a2***2732"). */
function maskApiKey(key) {
  if (!key || key.length < 8) return "(vacía o muy corta)";
  return key.slice(0, 4) + "***" + key.slice(-4);
}

exports.handler = async (event) => {
  const apiKey = process.env.NEWS_API_KEY;

  // ----- Diagnóstico (fácil de desactivar con DEBUG_NEWS = false) -----
  if (DEBUG_NEWS) {
    console.log("[news] NEWS_API_KEY existe:", Boolean(apiKey && apiKey.trim()));
    console.log("[news] API key (enmascarada):", maskApiKey(apiKey));
  }

  // ----- 1) Falta API key → 500 y mensaje claro -----
  if (!apiKey || apiKey.trim() === "") {
    return jsonResponse(500, {
      error: "NEWS_API_KEY no configurada",
      message:
        "En local: crea un archivo .env en la raíz con NEWS_API_KEY=tu_key. " +
        "En Netlify: Site settings > Environment variables > NEWS_API_KEY."
    });
  }

  const params = event.queryStringParameters || {};
  const mode = (params.mode || "top").toLowerCase();
  const category = (params.category || "general").trim();
  const q = (params.q || "").trim();

  if (DEBUG_NEWS) {
    console.log("[news] Params recibidos:", { mode, category, q: q || "(vacío, se usará 'noticias')" });
  }

  let url;

  // ----- 2) Construir URL según mode (top → category; everything → q) -----
  if (mode === "top") {
    url =
      `${NEWS_API_BASE}/top-headlines?country=${COUNTRY}&category=${encodeURIComponent(category)}` +
      `&pageSize=10&apiKey=${apiKey}`;
  } else if (mode === "everything") {
    const query = q || "noticias";
    url =
      `${NEWS_API_BASE}/everything?q=${encodeURIComponent(query)}` +
      `&language=es&pageSize=10&sortBy=publishedAt&apiKey=${apiKey}`;
  } else {
    return jsonResponse(400, {
      error: "Parámetro mode inválido",
      message: "Usa mode=top (con category) o mode=everything (con q)."
    });
  }

  if (DEBUG_NEWS) {
    const urlMasked = url.replace(apiKey, maskApiKey(apiKey));
    console.log("[news] URL final (key enmascarada):", urlMasked);
  }

  try {
    const res = await fetch(url);

    // ----- 3) NewsAPI respondió con error HTTP → devolver código y mensaje -----
    if (!res.ok) {
      const text = await res.text();
      let message = `NewsAPI HTTP ${res.status} ${res.statusText}`;
      try {
        const errBody = JSON.parse(text);
        if (errBody.message) message = errBody.message;
      } catch (_) {}

      const statusCode = res.status >= 500 ? 502 : 400;
      return jsonResponse(statusCode, {
        error: "Error al llamar a NewsAPI",
        message
      });
    }

    const data = await res.json();

    // ----- 4) status !== "ok" en el JSON de NewsAPI → error claro -----
    if (data.status !== "ok") {
      return jsonResponse(400, {
        error: "NewsAPI respondió con error",
        message: data.message || "La API devolvió status distinto de 'ok'."
      });
    }

    return jsonResponse(200, data);
  } catch (err) {
    console.error("[news] Error en el servidor:", err);
    return jsonResponse(500, {
      error: "Error en el servidor",
      message: err.message || "No se pudo conectar con NewsAPI."
    });
  }
};
