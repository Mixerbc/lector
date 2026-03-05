// ========== CONFIGURACIÓN - Proxy Netlify Function ==========
// Este frontend NO llama directamente a newsapi.org.
// Todas las peticiones van a /.netlify/functions/news (mode=top + category o mode=everything + q).
// API key: en local va en .env (NEWS_API_KEY); en Netlify en Environment variables.

const NEWS_PROXY = "/.netlify/functions/news";

// Referencias del DOM
const categoriaSelect = document.getElementById("categoria");
const btnCargar = document.getElementById("btnCargar");
const btnRefrescar = document.getElementById("btnRefrescar");
const listaNoticias = document.getElementById("listaNoticias");
const estado = document.getElementById("estado");

// Última categoría usada (para Refrescar)
let ultimaCategoria = "general";

// ---------- Utilidades ----------

/** Muestra un mensaje en el área de noticias (cargando, error, sin resultados). */
function mostrarMensaje(texto) {
  if (!listaNoticias) return;
  listaNoticias.innerHTML = `<div class="mensaje">${texto}</div>`;
}

/** Actualiza el texto de estado debajo de los botones. */
function actualizarEstado(texto) {
  if (estado) estado.textContent = texto;
}

/** Formatea fecha ISO a español (ej: "4 mar 2025, 10:30"). */
function formatearFecha(fechaISO) {
  if (!fechaISO) return "Fecha no disponible";
  const fecha = new Date(fechaISO);
  return fecha.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// ---------- Renderizado (mapeo NewsAPI) ----------

// Placeholder cuando no hay imagen o falla la carga (403/404, etc.)
const PLACEHOLDER_IMG = "https://via.placeholder.com/600x350?text=Sin+imagen";

// Dominios que bloquean hotlinking (403). No renderizamos noticias con imágenes de estos dominios.
const DOMINIOS_BLOQUEADOS = ["s3.elespanol.com"];

/**
 * Indica si la imagen está bloqueada: sin URL o dominio en la lista de bloqueados.
 * Usado para filtrar noticias antes de renderizar.
 * @param {string|null|undefined} url - urlToImage de la noticia
 * @returns {boolean} true si no hay URL o el dominio está bloqueado
 */
function esImagenBloqueada(url) {
  if (!url || typeof url !== "string" || !url.trim()) return true;
  const urlLower = url.toLowerCase();
  return DOMINIOS_BLOQUEADOS.some((d) => urlLower.includes(d.toLowerCase()));
}

/**
 * Devuelve una URL segura para la imagen: placeholder si no hay url o si el dominio bloquea hotlinking.
 * @param {string|null|undefined} url - urlToImage de la noticia
 * @returns {string} URL original o PLACEHOLDER_IMG
 */
function obtenerImagenSegura(url) {
  if (!url || typeof url !== "string" || !url.trim()) return PLACEHOLDER_IMG;
  const urlLower = url.toLowerCase();
  if (DOMINIOS_BLOQUEADOS.some((d) => urlLower.includes(d.toLowerCase()))) return PLACEHOLDER_IMG;
  return url;
}

/**
 * Crea una tarjeta HTML para una noticia.
 * Solo se llama para noticias ya filtradas (imagen no bloqueada).
 * Si la imagen falla al cargar (403/404) en tiempo de ejecución, onerror oculta la tarjeta completa.
 */
function crearTarjetaNoticia(noticia) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "noticia";

  const imagenUrl = obtenerImagenSegura(noticia.urlToImage);
  // Si la imagen falla al cargar, ocultar la tarjeta completa (no solo la imagen).
  const imagen = `<img src="${imagenUrl}" alt="Imagen de la noticia" loading="lazy" onerror="this.closest('.noticia')?.remove()">`;

  tarjeta.innerHTML = `
    ${imagen}
    <div class="noticia-contenido">
      <h3>
        <a href="${noticia.url}" target="_blank" rel="noopener noreferrer">
          ${noticia.title || "Sin título"}
        </a>
      </h3>
      <div class="meta">
        <span><strong>Fuente:</strong> ${noticia.source?.name || "Desconocida"}</span><br>
        <span><strong>Fecha:</strong> ${formatearFecha(noticia.publishedAt)}</span>
      </div>
      <p class="descripcion">
        ${noticia.description || "No hay descripción disponible."}
      </p>
    </div>
  `;

  return tarjeta;
}

/** Recibe el array de artículos y los pinta en el área de noticias. */
function renderizarNoticias(articulos) {
  if (!listaNoticias) return;
  listaNoticias.innerHTML = "";

  if (!articulos || articulos.length === 0) {
    mostrarMensaje("No hay noticias disponibles para esta categoría.");
    actualizarEstado("No se encontraron noticias.");
    console.warn("NewsAPI: no se recibieron artículos.");
    return;
  }

  // Solo mostrar noticias cuya imagen no está bloqueada (evitar 403 de dominios con hotlinking).
  const articulosVisibles = articulos.filter((n) => !esImagenBloqueada(n.urlToImage));

  if (articulosVisibles.length === 0) {
    mostrarMensaje("No hay noticias disponibles para esta categoría (imágenes bloqueadas).");
    actualizarEstado("No se encontraron noticias.");
    return;
  }

  articulosVisibles.forEach((noticia) => {
    listaNoticias.appendChild(crearTarjetaNoticia(noticia));
  });

  actualizarEstado(`Se cargaron ${articulosVisibles.length} noticias correctamente.`);
}

// ---------- API: proxy Netlify Function ----------

/**
 * Llama a la Netlify Function (modo top-headlines).
 * GET /.netlify/functions/news?mode=top&category=<categoria>
 */
async function fetchTopHeadlines(categoria) {
  const url = `${NEWS_PROXY}?mode=top&category=${encodeURIComponent(categoria)}`;
  const respuesta = await fetch(url);
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const msg = datos.message || datos.error || `Error HTTP: ${respuesta.status}`;
    console.error("Proxy top-headlines:", msg);
    return { error: msg, datos: null };
  }

  if (datos.error) {
    const msg = datos.message || datos.error;
    console.error("Proxy:", msg);
    return { error: msg, datos: null };
  }

  return { error: null, datos };
}

/**
 * Llama a la Netlify Function (modo everything).
 * GET /.netlify/functions/news?mode=everything&q=<palabraClave>
 */
async function fetchEverything(palabraClave) {
  const url = `${NEWS_PROXY}?mode=everything&q=${encodeURIComponent(palabraClave)}`;
  const respuesta = await fetch(url);
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const msg = datos.message || datos.error || `Error HTTP: ${respuesta.status}`;
    console.error("Proxy everything:", msg);
    return { error: msg, datos: null };
  }

  if (datos.error) {
    const msg = datos.message || datos.error;
    console.error("Proxy:", msg);
    return { error: msg, datos: null };
  }

  return { error: null, datos };
}

// Mapeo categoría -> palabra en español para /v2/everything
const CATEGORIA_A_PALABRA = {
  general: "noticias",
  business: "negocios",
  entertainment: "entretenimiento",
  health: "salud",
  science: "ciencia",
  sports: "deportes",
  technology: "tecnologia"
};

// ---------- Carga principal ----------

/**
 * Carga noticias: primero intenta top-headlines; si falla o no hay artículos,
 * hace fallback automático a /v2/everything con la palabra asociada a la categoría.
 */
async function cargarNoticias(categoria = "general") {
  ultimaCategoria = categoria;

  actualizarEstado("Cargando noticias...");
  mostrarMensaje("Cargando noticias, por favor espera...");

  try {
    // 1) Intentar top-headlines
    const resultado = await fetchTopHeadlines(categoria);

    if (resultado.error) {
      // Fallback: intentar /v2/everything
      const palabra = CATEGORIA_A_PALABRA[categoria] || categoria;
      actualizarEstado("Probando búsqueda alternativa...");
      mostrarMensaje("Probando búsqueda alternativa...");

      const fallback = await fetchEverything(palabra);

      if (fallback.error || !fallback.datos?.articles?.length) {
        console.error("NewsAPI: fallback también falló.", fallback.error);
        actualizarEstado("Error al cargar las noticias.");
        mostrarMensaje(
          resultado.error + " No se pudieron cargar noticias. Revisa tu API key (newsapi.org) o intenta más tarde."
        );
        return;
      }

      actualizarEstado(`Se cargaron ${fallback.datos.articles.length} noticias (búsqueda alternativa).`);
      renderizarNoticias(fallback.datos.articles);
      return;
    }

    const datos = resultado.datos;

    // Sin artículos en top-headlines -> fallback a everything
    if (!datos.articles || datos.articles.length === 0) {
      const palabra = CATEGORIA_A_PALABRA[categoria] || categoria;
      actualizarEstado("Probando búsqueda alternativa...");
      mostrarMensaje("Probando búsqueda alternativa...");

      const fallback = await fetchEverything(palabra);

      if (fallback.error) {
        mostrarMensaje("No hay noticias disponibles para esta categoría.");
        actualizarEstado("No se encontraron noticias.");
        console.warn("NewsAPI: sin artículos y fallback falló.", fallback.error);
        return;
      }

      if (fallback.datos.articles && fallback.datos.articles.length > 0) {
        actualizarEstado(`Se cargaron ${fallback.datos.articles.length} noticias (búsqueda alternativa).`);
        renderizarNoticias(fallback.datos.articles);
      } else {
        mostrarMensaje("No hay noticias disponibles para esta categoría.");
        actualizarEstado("No se encontraron noticias.");
      }
      return;
    }

    renderizarNoticias(datos.articles);
  } catch (error) {
    console.error("Error al cargar noticias:", error);
    actualizarEstado("Error al cargar las noticias.");
    const mensaje =
      error instanceof TypeError && error.message.includes("fetch")
        ? "No se pudo conectar. Comprueba tu conexión a internet."
        : "No fue posible obtener noticias. Verifica tu API key o intenta más tarde.";
    mostrarMensaje(mensaje);
  }
}

// ---------- Eventos ----------

if (btnCargar) {
  btnCargar.addEventListener("click", () => {
    const categoria = categoriaSelect ? categoriaSelect.value : "general";
    cargarNoticias(categoria);
  });
}

if (btnRefrescar) {
  btnRefrescar.addEventListener("click", () => {
    cargarNoticias(ultimaCategoria);
  });
}
