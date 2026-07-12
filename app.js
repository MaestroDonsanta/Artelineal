// Elementos de la interfaz (DOM)
let canvas, ctx;
let colorCanvas, colorCtx; // Canvas oculto con colores sólidos
let originalImage = new Image(); // Imagen original cargada
let originalImgData = null; // Datos de píxeles de la imagen original (para bordes)

// Estado de la aplicación
let activeColor = "#536DFE"; // Color por defecto
let activeMode = "paint"; // "paint" o "pan"
let tolerance = 45; // Tolerancia por defecto para flood-fill
let lineThreshold = 140; // Umbral de detección de líneas oscuras (0-255)

// Zoom y Paneo
let zoom = 1;
let minZoom = 0.1;
let maxZoom = 10;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Historial (Undo / Redo)
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 20;

// Mandalas JPG disponibles en la carpeta (permite inyectar Base64 en embeds)
const MANDALAS = window.MANDALAS_DATA || [
  { id: "mandala1", name: "Mandala 1", file: "MANDALAS_Mesa de trabajo 1.jpg" },
  { id: "mandala2", name: "Mandala 2", file: "MANDALAS_Mesa de trabajo 1 copia.jpg" },
  { id: "mandala3", name: "Mandala 3", file: "MANDALAS_Mesa de trabajo 1 copia 2.jpg" },
  { id: "mandala4", name: "Mandala 4", file: "MANDALAS_Mesa de trabajo 1 copia 3.jpg" },
  { id: "mandala5", name: "Mandala 5", file: "MANDALAS_Mesa de trabajo 1 copia 4.jpg" },
  { id: "mandala6", name: "Mandala 6", file: "MANDALAS_Mesa de trabajo 1 copia 6.jpg" },
  { id: "mandala7", name: "Mandala 7", file: "MANDALAS_Mesa de trabajo 1 copia 7.jpg" },
  { id: "mandala8", name: "Mandala 8", file: "MANDALAS_Mesa de trabajo 1 copia 8.jpg" }
];

// Helper para resolver la ruta de la imagen (evita codificar si ya es base64 data URL)
function resolveImageSrc(file) {
  if (file.startsWith("data:")) return file;
  return encodeURIComponent(file);
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

// --- INICIALIZACIÓN ---
function initApp() {
  canvas = document.getElementById("coloring-canvas");
  ctx = canvas.getContext("2d");

  colorCanvas = document.createElement("canvas");
  colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });

  setupGallery();
  setupBasicColors();
  setupEventListeners();
  
  // Cargar el primer mandala por defecto
  loadMandala(MANDALAS[0].file);
}

// --- CONFIGURACIÓN DE GALERÍA ---
function setupGallery() {
  const galleryGrid = document.getElementById("gallery-grid");
  galleryGrid.innerHTML = "";

  MANDALAS.forEach((m, index) => {
    const item = document.createElement("div");
    item.className = "gallery-item" + (index === 0 ? " active" : "");
    item.setAttribute("data-file", m.file);
    item.title = m.name;

    const img = document.createElement("img");
    img.src = resolveImageSrc(m.file); // Evita problemas con espacios o carga base64
    img.alt = m.name;
    img.loading = "lazy";

    const label = document.createElement("div");
    label.className = "gallery-item-label";
    label.textContent = m.name;

    item.appendChild(img);
    item.appendChild(label);

    item.addEventListener("click", () => {
      if (item.classList.contains("active")) return;
      
      document.querySelectorAll(".gallery-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      loadMandala(m.file);
    });

    galleryGrid.appendChild(item);
  });
}

// --- CARGAR MANDALA EN CANVAS ---
function loadMandala(fileName) {
  showLoading(true);
  
  originalImage = new Image();
  originalImage.onload = () => {
    // Dimensionar canvases según la imagen original, con un tope máximo para evitar crashes de GPU en iOS
    const MAX_CANVAS_DIM = 1600;
    let w = originalImage.naturalWidth || originalImage.width || 1200;
    let h = originalImage.naturalHeight || originalImage.height || 1200;

    if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
      const aspectRatio = w / h;
      if (w > h) {
        w = MAX_CANVAS_DIM;
        h = Math.round(MAX_CANVAS_DIM / aspectRatio);
      } else {
        h = MAX_CANVAS_DIM;
        w = Math.round(MAX_CANVAS_DIM * aspectRatio);
      }
    }

    canvas.width = w;
    canvas.height = h;
    
    colorCanvas.width = w;
    colorCanvas.height = h;

    // Ajustar el tamaño del wrapper para que coincida exactamente con las dimensiones del canvas
    const canvasWrapper = document.getElementById("canvas-wrapper");
    if (canvasWrapper) {
      canvasWrapper.style.width = canvas.width + "px";
      canvasWrapper.style.height = canvas.height + "px";
    }

    // Inicializar lienzo de colores con fondo blanco
    colorCtx.fillStyle = "#FFFFFF";
    colorCtx.fillRect(0, 0, colorCanvas.width, colorCanvas.height);

    // Obtener los datos de píxeles de la plantilla original
    // Creamos un canvas temporal para extraer los píxeles originales sin modificar
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(originalImage, 0, 0, tempCanvas.width, tempCanvas.height);
    originalImgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    // Resetear transformaciones de vista
    resetView();

    // Resetear historial
    historyStack = [];
    historyIndex = -1;
    saveHistoryState();

    // Dibujar lienzo visible
    renderCanvas();
    showLoading(false);
    showToast("Mandala cargado. ¡A colorear!");
  };

  originalImage.onerror = () => {
    showLoading(false);
    showToast("Error al cargar el mandala.", "danger");
  };

  originalImage.src = resolveImageSrc(fileName);
}

// --- DIBUJAR LIENZO (COMPOSICIÓN MULTIPLY) ---
function renderCanvas() {
  if (!ctx || !originalImage.complete) return;

  // Limpiar
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Dibujar los colores de fondo del usuario
  ctx.drawImage(colorCanvas, 0, 0);

  // 2. Multiplicar las líneas oscuras originales encima
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over"; // Restaurar modo por defecto
}

// --- ALGORITMO FLOOD-FILL (RELLENO DE CUBETA) ---
function performFloodFill(startX, startY, fillColorHex) {
  const width = colorCanvas.width;
  const height = colorCanvas.height;

  // Convertir hex de color de relleno a RGBA
  const fillRGBA = hexToRgba(fillColorHex);

  // Leer píxeles del lienzo de colores
  const colorImgData = colorCtx.getImageData(0, 0, width, height);
  const colorData = colorImgData.data;

  // Datos de la plantilla original (para verificar bordes/líneas negras)
  const origData = originalImgData.data;

  // Obtener color del píxel clickeado en la capa de color
  const startIdx = (startY * width + startX) * 4;
  const startR = colorData[startIdx];
  const startG = colorData[startIdx + 1];
  const startB = colorData[startIdx + 2];
  const startA = colorData[startIdx + 3];

  // Si ya es el mismo color (con un margen mínimo), no hacer nada
  if (colorsMatch(startR, startG, startB, startA, fillRGBA.r, fillRGBA.g, fillRGBA.b, fillRGBA.a, 5)) {
    return;
  }

  // Verificar si el clic original fue sobre una línea negra de la plantilla
  const origStartR = origData[startIdx];
  const origStartG = origData[startIdx + 1];
  const origStartB = origData[startIdx + 2];
  const origStartLuminance = 0.299 * origStartR + 0.587 * origStartG + 0.114 * origStartB;
  if (origStartLuminance < lineThreshold) {
    // Si haces clic directamente en la línea negra, no rellenamos
    return;
  }

  // Pila para DFS (Evitamos recursividad directa para prevenir Stack Overflow)
  const pixelStack = [[startX, startY]];
  
  // Array de visitados de tamaño width * height para alto rendimiento
  const visited = new Uint8Array(width * height);

  while (pixelStack.length > 0) {
    const [x, y] = pixelStack.pop();
    const idx = (y * width + x) * 4;
    const coordIdx = y * width + x;

    if (visited[coordIdx]) continue;
    visited[coordIdx] = 1;

    // 1. Verificar si el píxel de la plantilla original es una línea oscura
    const oR = origData[idx];
    const oG = origData[idx + 1];
    const oB = origData[idx + 2];
    const luminance = 0.299 * oR + 0.587 * oG + 0.114 * oB;

    if (luminance < lineThreshold) {
      continue; // Detenerse en las líneas negras del mandala
    }

    // 2. Verificar si el píxel actual en la capa de color es similar al color inicial clickeado
    const cR = colorData[idx];
    const cG = colorData[idx + 1];
    const cB = colorData[idx + 2];
    const cA = colorData[idx + 3];

    if (colorsMatch(cR, cG, cB, cA, startR, startG, startB, startA, tolerance)) {
      // Colorear en la capa de color
      colorData[idx] = fillRGBA.r;
      colorData[idx + 1] = fillRGBA.g;
      colorData[idx + 2] = fillRGBA.b;
      colorData[idx + 3] = fillRGBA.a;

      // Agregar vecinos a la pila
      if (x > 0) pixelStack.push([x - 1, y]);
      if (x < width - 1) pixelStack.push([x + 1, y]);
      if (y > 0) pixelStack.push([x, y - 1]);
      if (y < height - 1) pixelStack.push([x, y + 1]);
    }
  }

  // Guardar los datos de color actualizados
  colorCtx.putImageData(colorImgData, 0, 0);

  // Redibujar lienzo compuesto
  renderCanvas();

  // Guardar en el historial
  saveHistoryState();
}

// --- HISTORIAL (UNDO / REDO - OPTIMIZADO CON PNG EN MEMORIA) ---
function saveHistoryState() {
  // Truncar historial si estábamos en medio de un Undo
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }

  // Guardar copia como PNG comprimido en Base64 para reducir la memoria de 320MB a <1MB
  const state = colorCanvas.toDataURL("image/png");
  historyStack.push(state);

  // Mantener límite de memoria
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  } else {
    historyIndex++;
  }

  updateHistoryButtons();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    applyHistoryState(historyStack[historyIndex]);
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    applyHistoryState(historyStack[historyIndex]);
  }
}

function applyHistoryState(dataURL) {
  const img = new Image();
  img.onload = () => {
    colorCtx.clearRect(0, 0, colorCanvas.width, colorCanvas.height);
    colorCtx.drawImage(img, 0, 0);
    renderCanvas();
    updateHistoryButtons();
  };
  img.src = dataURL;
}

function updateHistoryButtons() {
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  if (btnUndo) btnUndo.disabled = historyIndex <= 0;
  if (btnRedo) btnRedo.disabled = historyIndex >= historyStack.length - 1;
}

// --- GESTIÓN DE COLORES BÁSICOS ---
const BASIC_COLORS = [
  "#EF4444", // Rojo
  "#F97316", // Naranja
  "#F59E0B", // Amarillo
  "#10B981", // Verde Esmeralda
  "#06B6D4", // Cian
  "#3B82F6", // Azul
  "#6366F1", // Indigo
  "#8B5CF6", // Violeta
  "#EC4899", // Rosa
  "#F43F5E", // Rosa Oscuro
  "#78350F", // Café
  "#FFFFFF", // Blanco
  "#9CA3AF", // Gris
  "#111827"  // Negro
];

function setupBasicColors() {
  const swatchesGrid = document.getElementById("active-swatches-grid");
  if (!swatchesGrid) return;
  swatchesGrid.innerHTML = "";

  BASIC_COLORS.forEach((color, idx) => {
    const btn = document.createElement("button");
    btn.className = "swatch-btn" + (color === activeColor ? " active" : "");
    btn.style.backgroundColor = color;
    btn.setAttribute("data-color", color);
    btn.title = `Color: ${color}`;

    btn.addEventListener("click", () => {
      setActiveColor(color);
    });

    swatchesGrid.appendChild(btn);
  });
}

// --- COLORES RECIENTES ---
let recentColors = [];
const MAX_RECENTS = 6;

function addRecentColor(colorHex) {
  const hex = colorHex.toUpperCase();
  // Evitar duplicados: quitar si ya existe para moverlo al principio
  recentColors = recentColors.filter(c => c !== hex);
  // Agregar al inicio
  recentColors.unshift(hex);
  // Limitar al número máximo permitido
  if (recentColors.length > MAX_RECENTS) {
    recentColors.pop();
  }
  renderRecentColors();
}

function renderRecentColors() {
  const container = document.getElementById("recent-colors-container");
  const grid = document.getElementById("recent-swatches-grid");
  if (!container || !grid) return;

  if (recentColors.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";
  grid.innerHTML = "";

  recentColors.forEach(color => {
    const btn = document.createElement("button");
    btn.className = "swatch-btn" + (color.toUpperCase() === activeColor.toUpperCase() ? " active" : "");
    btn.style.backgroundColor = color;
    btn.setAttribute("data-color", color);
    btn.title = `Reciente: ${color}`;

    btn.addEventListener("click", () => {
      setActiveColor(color);
    });

    grid.appendChild(btn);
  });
}

function setActiveColor(colorHex) {
  activeColor = colorHex;
  
  // Agregar a la lista de recientes
  addRecentColor(colorHex);

  // Actualizar UI de botones de colores (básicos y recientes)
  document.querySelectorAll(".swatch-btn").forEach(btn => {
    if (btn.getAttribute("data-color").toUpperCase() === colorHex.toUpperCase()) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Sincronizar input y preview de color personalizado
  const customColorInput = document.getElementById("custom-color-input");
  const customColorText = document.getElementById("custom-color-text");
  const customColorPreview = document.getElementById("custom-color-preview");
  if (customColorInput && customColorText) {
    customColorInput.value = colorHex;
    customColorText.value = colorHex.toUpperCase();
  }
  if (customColorPreview) {
    customColorPreview.style.backgroundColor = colorHex;
  }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  const viewport = document.getElementById("canvas-viewport");
  const canvasWrapper = document.getElementById("canvas-wrapper");

  // Helper local para registrar eventos de forma segura
  const safeAddListener = (id, event, callback) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, callback);
    }
  };

  // Modo Colorear / Modo Paneo / Modo Gotero
  safeAddListener("tool-paint", "click", () => {
    setMode("paint");
  });

  safeAddListener("tool-pan", "click", () => {
    setMode("pan");
  });

  safeAddListener("tool-picker", "click", () => {
    setMode("picker");
  });

  // Undo / Redo / Reset
  safeAddListener("btn-undo", "click", undo);
  safeAddListener("btn-redo", "click", redo);
  safeAddListener("btn-reset", "click", resetCanvas);
  safeAddListener("btn-toolbar-reset", "click", resetCanvas);

  // Zoom de Botones (progresivo)
  safeAddListener("btn-zoom-in", "click", () => adjustZoom(1.2));
  safeAddListener("btn-zoom-out", "click", () => adjustZoom(1 / 1.2));
  safeAddListener("btn-zoom-reset", "click", resetView);

  // Descargar
  safeAddListener("btn-download", "click", downloadArtwork);
  safeAddListener("btn-toolbar-download", "click", downloadArtwork);

  // Redimensionado de Ventana (solo recalcula límites, no reinicia vista)
  window.addEventListener("resize", handleResize);

  // Selector de Color Personalizado
  const customColorInput = document.getElementById("custom-color-input");
  const customColorText = document.getElementById("custom-color-text");

  if (customColorInput) {
    customColorInput.addEventListener("input", (e) => {
      const color = e.target.value;
      if (customColorText) {
        customColorText.value = color.toUpperCase();
      }
      setActiveColor(color);
    });
  }

  if (customColorText) {
    customColorText.addEventListener("change", (e) => {
      let color = e.target.value.trim();
      if (!color.startsWith("#") && color.length === 6) {
        color = "#" + color;
      }
      if (/^#[0-9A-F]{6}$/i.test(color)) {
        if (customColorInput) {
          customColorInput.value = color;
        }
        setActiveColor(color);
      } else {
        customColorText.value = activeColor.toUpperCase();
      }
    });
  }

  // --- NAVEGACIÓN Y COLOREADO EN EL CANVAS ---

  if (viewport) {
    // Evento Clic / Touch en el viewport para Pintar o Mover
    viewport.addEventListener("pointerdown", (e) => {
      // Si el clic fue en un botón de la barra de herramientas, ignorarlo
      if (e.target.closest("#toolbar")) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      if (activeMode === "paint") {
        if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
          performFloodFill(x, y, activeColor);
        }
      } else if (activeMode === "picker") {
        if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
          const pixel = colorCtx.getImageData(x, y, 1, 1).data;
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];
          const a = pixel[3];
          let hex = "#FFFFFF";
          if (a > 0) {
            hex = rgbToHex(r, g, b);
          }
          setActiveColor(hex);
          setMode("paint");
          showToast("Color copiado!");
        }
      } else if (activeMode === "pan") {
        isDragging = true;
        viewport.style.cursor = "grabbing";
        dragStartX = e.clientX - panX;
        dragStartY = e.clientY - panY;
      }
    });

    // Zoom con rueda del mouse (estable desde el centro)
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      
      const zoomSpeed = 0.08;
      const direction = e.deltaY < 0 ? 1 : -1;
      const scaleFactor = Math.exp(direction * zoomSpeed);

      zoom = Math.min(Math.max(zoom * scaleFactor, minZoom), maxZoom);
      updateTransform();
    }, { passive: false });
  }

  window.addEventListener("pointermove", (e) => {
    if (isDragging && activeMode === "pan") {
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      updateTransform();
    }
  });

  window.addEventListener("pointerup", () => {
    if (isDragging) {
      isDragging = false;
      if (activeMode === "pan" && viewport) {
        viewport.style.cursor = "grab";
      }
    }
  });

  // Atajos de teclado útiles
  document.addEventListener("keydown", (e) => {
    // Ctrl+Z para deshacer
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      undo();
    }
    // Ctrl+Y para rehacer
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    }
  });

  // Desactivar gestos multitáctiles nativos de iOS Safari para evitar desestabilizar la página
  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturechange", (e) => {
    e.preventDefault();
  }, { passive: false });
}

// --- FUNCIONES DE MODO Y NAVEGACIÓN ---
function setMode(mode) {
  activeMode = mode;
  
  const viewport = document.getElementById("canvas-viewport");
  const toolPaint = document.getElementById("tool-paint");
  const toolPan = document.getElementById("tool-pan");
  const toolPicker = document.getElementById("tool-picker");

  if (viewport) {
    viewport.className = "canvas-viewport";
    if (mode === "pan") viewport.className = "canvas-viewport mode-pan";
    if (mode === "picker") viewport.className = "canvas-viewport mode-picker";
  }

  if (toolPaint) {
    if (mode === "paint") toolPaint.classList.add("active");
    else toolPaint.classList.remove("active");
  }
  if (toolPan) {
    if (mode === "pan") toolPan.classList.add("active");
    else toolPan.classList.remove("active");
  }
  if (toolPicker) {
    if (mode === "picker") toolPicker.classList.add("active");
    else toolPicker.classList.remove("active");
  }
}

function adjustZoom(factor) {
  zoom = Math.min(Math.max(zoom * factor, minZoom), maxZoom);
  updateTransform();
}

function resetView() {
  const viewport = document.getElementById("canvas-viewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  
  const viewW = rect.width;
  const viewH = rect.height;
  
  // Si no está renderizado aún en el DOM (dimensiones 0), reintentar en 100ms
  if (viewW <= 0 || viewH <= 0) {
    setTimeout(resetView, 100);
    return;
  }
  
  // Calcular escala inicial para encajar la imagen
  const scaleX = viewW / canvas.width;
  const scaleY = viewH / canvas.height;
  
  let initialZoom;
  if (viewW < 768) {
    // En móviles, encajar la imagen al ancho completo para que se vea grande y detallada
    initialZoom = scaleX;
  } else {
    // En ordenadores, encajar para ver toda la imagen
    initialZoom = Math.min(scaleX, scaleY) * 0.95;
  }

  zoom = initialZoom;

  // Calcular límites dinámicos
  minZoom = Math.min(initialZoom * 0.5, 0.2);
  if (minZoom > initialZoom) {
    minZoom = initialZoom * 0.5;
  }
  // En móvil limitamos el zoom máximo para evitar rebasar la memoria de GPU de Safari/Chrome
  if (viewW < 768) {
    maxZoom = Math.max(initialZoom * 4, 3);
  } else {
    maxZoom = Math.max(initialZoom * 20, 10);
  }

  // Restablecer posición al centro
  panX = 0;
  panY = 0;

  updateTransform();
}

function handleResize() {
  const viewport = document.getElementById("canvas-viewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  
  const viewW = rect.width;
  const viewH = rect.height;
  if (viewW <= 0 || viewH <= 0) return;

  const scaleX = viewW / canvas.width;
  const scaleY = viewH / canvas.height;
  
  let initialZoom;
  if (viewW < 768) {
    initialZoom = scaleX;
  } else {
    initialZoom = Math.min(scaleX, scaleY) * 0.95;
  }

  // Actualizar límites dinámicos
  minZoom = Math.min(initialZoom * 0.5, 0.2);
  if (minZoom > initialZoom) {
    minZoom = initialZoom * 0.5;
  }
  
  if (viewW < 768) {
    maxZoom = Math.max(initialZoom * 4, 3);
  } else {
    maxZoom = Math.max(initialZoom * 20, 10);
  }

  // Limitar zoom actual si quedó fuera de los nuevos límites
  const oldZoom = zoom;
  zoom = Math.min(Math.max(zoom, minZoom), maxZoom);

  if (zoom !== oldZoom) {
    updateTransform();
  }
}

function updateTransform() {
  const canvasWrapper = document.getElementById("canvas-wrapper");
  if (!canvasWrapper) return;
  canvasWrapper.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoom})`;
  
  // Actualizar HUD de zoom
  const zoomLevel = document.getElementById("zoom-level");
  if (zoomLevel) zoomLevel.textContent = Math.round(zoom * 100) + "%";
}

// --- REINICIAR LIENZO ---
function resetCanvas() {
  if (confirm("¿Estás seguro de que quieres borrar todos los colores de este mandala?")) {
    colorCtx.fillStyle = "#FFFFFF";
    colorCtx.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
    renderCanvas();
    saveHistoryState();
    showToast("Diseño reiniciado.");
  }
}

// --- DESCARGAR ARTE ---
function downloadArtwork() {
  try {
    showLoading(true);
    
    // Crear un canvas temporal para la descarga de alta resolución
    const downloadCanvas = document.createElement("canvas");
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;
    const downloadCtx = downloadCanvas.getContext("2d");

    // 1. Pintar colores
    downloadCtx.drawImage(colorCanvas, 0, 0);
    
    // 2. Multiplicar líneas del original
    downloadCtx.globalCompositeOperation = "multiply";
    downloadCtx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
    downloadCtx.globalCompositeOperation = "source-over";

    // 3. Generar descarga
    const dataURL = downloadCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `Mandala_Coloreado_${Date.now()}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showLoading(false);
    showToast("¡Obra de arte descargada con éxito!");
  } catch (error) {
    showLoading(false);
    console.error("Error al exportar la imagen: ", error);
    showToast("Error al descargar el mandala.", "danger");
  }
}

// --- UTILS ---
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function hexToRgba(hex) {
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map(x => x + x).join("");
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return { r, g, b, a: 255 };
}

function colorsMatch(r1, g1, b1, a1, r2, g2, b2, a2, tol) {
  return Math.abs(r1 - r2) <= tol &&
         Math.abs(g1 - g2) <= tol &&
         Math.abs(b1 - b2) <= tol &&
         Math.abs(a1 - a2) <= tol;
}

function showLoading(show) {
  const overlay = document.getElementById("loading-overlay");
  if (!overlay) return;
  if (show) {
    overlay.classList.add("active");
  } else {
    overlay.classList.remove("active");
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  
  let emoji = "✨";
  if (type === "danger") {
    emoji = "⚠️";
    toast.style.borderColor = "var(--danger-color)";
  } else if (type === "success") {
    emoji = "🎨";
  }

  toast.innerHTML = `<span>${emoji}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 2500);
}
