/**
 * @file raster_logic.js
 * @description Implements pixel-based coloring for raster images using
 * flood-fill algorithms, handling zoom, pan, and history for the Raster Canvas.
 */

// --- State Management ---

/** @type {HTMLCanvasElement} The main drawing canvas */
const canvas = document.getElementById("mainCanvas");
/** @type {CanvasRenderingContext2D} The 2D rendering context */
const ctx = canvas.getContext("2d", { willReadFrequently: true });

/** @type {number} Current zoom level for the raster canvas */
let zoomLevel = 1.0;
/** @type {number} Offset X for panning */
let panX = 0;
/** @type {number} Offset Y for panning */
let panY = 0;
/** @type {boolean} Panning state */
let isPanning = false;
/** @type {number} Start X for panning */
let startX = 0;
/** @type {number} Start Y for panning */
let startY = 0;

/** @type {Array<ImageData>} Undo history stack of pixel data */
let historyStack = [];
/** @type {number} Current index in history stack */
let historyStep = -1;

/** @type {ImageData|null} Snapshot of the original image for resets */
let originalImageData = null;

// --- DOM Elements ---

const controls = {
  fillColor: document.getElementById("fillColorRaster"),
  tolerance: document.getElementById("toleranceRaster"),
  tolValue: document.getElementById("tolValueRaster"),
  connectivity: document.getElementById("connectivityRaster"),
  input: document.getElementById("rasterInput"),

  // Actions
  undo: document.getElementById("undoRaster"),
  redo: document.getElementById("redoRaster"),
  reset: document.getElementById("resetRaster"),
  fillSimilar: document.getElementById("fillSimilarRaster"),

  // View
  zoomIn: document.getElementById("zoomInRaster"),
  zoomOut: document.getElementById("zoomOutRaster"),
  zoomValue: document.getElementById("zoomValueRaster"),
  saveBtn: document.getElementById("saveBtnGlobal"),
};

// --- Initialization ---

/**
 * Sets up basic event listeners for raster controls.
 */
function initRasterEditor() {
  if (!canvas) return;

  // Handle File Upload
  controls.input.onchange = handleImageUpload;

  // Action Handlers
  controls.undo.onclick = undoAction;
  controls.redo.onclick = redoAction;
  controls.reset.onclick = resetCanvas;
  controls.fillSimilar.onclick = fillSimilarPixels;

  // Zoom Logic
  controls.zoomIn.onclick = () => adjustZoom(1.2);
  controls.zoomOut.onclick = () => adjustZoom(0.8);

  // Canvas Interaction
  canvas.onclick = handleCanvasClick;

  // Sync Tolerance label
  controls.tolerance.oninput = (e) => {
    controls.tolValue.textContent = e.target.value;
  };

  controls.saveBtn.onclick = () => {
    if (window.appState.currentTab != "svg") {
      console.log("saving to raster");
      const blob = new Blob([canvas.toDataURL()], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "artwork.png";
      link.click();
    }
  };

  // Panning & Zoom Events
  setupRasterInteraction();
}

/**
 * Sets up mouse listeners for panning and zooming.
 */
function setupRasterInteraction() {
  const wrapper = document.getElementById("rasterMainWrapper");
  if (!wrapper) return;

  wrapper.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      wrapper.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateCanvasTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      wrapper.style.cursor = "default";
    }
  });

  wrapper.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        adjustZoom(delta);
      }
    },
    { passive: false },
  );
}

// --- Image Handling ---

/**
 * Processes an uploaded image and draws it onto the canvas.
 * @param {Event} e - Input change event.
 */
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Store original for reset and history
      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      saveState();

      // Auto-center
      zoomLevel = 1.0;
      updateCanvasTransform();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Triggers a flood-fill operation on the canvas.
 * @param {MouseEvent} e - Click event.
 */
function handleCanvasClick(e) {
  if (!originalImageData) return;

  const rect = canvas.getBoundingClientRect();
  // Adjusted click coordinates for zoom and pan
  const x = Math.floor((e.clientX - rect.left) / zoomLevel);
  const y = Math.floor((e.clientY - rect.top) / zoomLevel);

  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

  saveState();

  // Store the clicked color for "Fill Similar"
  const startIdx = (y * canvas.width + x) * 4;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  lastClickedPixel = [
    imageData.data[startIdx],
    imageData.data[startIdx + 1],
    imageData.data[startIdx + 2],
  ];

  performFloodFill(x, y, controls.fillColor.value);
}

// --- Flood Fill Algorithm ---

/**
 * Executes a performance-optimized flood fill algorithm.
 * @param {number} startX - Start X coordinate.
 * @param {number} startY - Start Y coordinate.
 * @param {string} fillColorHex - Hex color for the fill.
 */
function performFloodFill(startX, startY, fillColorHex) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  const startIdx = (startY * canvas.width + startX) * 4;
  const startR = pixels[startIdx];
  const startG = pixels[startIdx + 1];
  const startB = pixels[startIdx + 2];
  const startA = pixels[startIdx + 3];

  // Convert hex to RGB
  const fillR = parseInt(fillColorHex.slice(1, 3), 16);
  const fillG = parseInt(fillColorHex.slice(3, 5), 16);
  const fillB = parseInt(fillColorHex.slice(5, 7), 16);

  // Prevent infinite loop if clicking same color
  if (startR === fillR && startG === fillG && startB === fillB) return;

  const tolerance = parseInt(controls.tolerance.value);
  const queue = [[startX, startY]];
  const visited = new Uint8Array(canvas.width * canvas.height);

  const dx = [0, 0, 1, -1];
  const dy = [1, -1, 0, 0];

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const idx = (y * canvas.width + x) * 4;

    if (visited[y * canvas.width + x]) continue;
    visited[y * canvas.width + x] = 1;

    const diff = Math.max(
      Math.abs(pixels[idx] - startR),
      Math.abs(pixels[idx + 1] - startG),
      Math.abs(pixels[idx + 2] - startB),
    );

    if (diff <= tolerance) {
      pixels[idx] = fillR;
      pixels[idx + 1] = fillG;
      pixels[idx + 2] = fillB;
      pixels[idx + 3] = 255;

      for (let i = 0; i < 4; i++) {
        const nx = x + dx[i];
        const ny = y + dy[i];
        if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
          queue.push([nx, ny]);
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Global fill: replaces ALL pixels in the canvas that match the current
 * fill color (with tolerance), regardless of connectivity.
 */
function fillSimilarPixels() {
  if (!originalImageData) return;

  saveState();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const targetColorHex = controls.fillColor.value;

  // In global fill, we need a reference color to replace.
  // Since there's no "selection", we use the color the user is clicking or
  // we can use the color under the cursor if we tracked it.
  // However, the most common "Fill Similar" behavior in simple editors is:
  // "Take the color I just picked, find all pixels like it, and change them to X"
  // But how do we know which color to find?

  // Let's assume the user wants to replace the color currently "Active" in the picker
  // with a NEW color? No, that doesn't make sense.

  // Better implementation: the "Fill Similar" button toggles a mode, or
  // we use the last clicked pixel's color as the "source".

  // For now, let's look for pixels matching the color currently in the picker
  // and replace them with... itself? No.

  // I will implement it such that clicking "Fill Similar" uses the color
  // under the center of the screen OR the last clicked color.
  // Let's use last clicked color if available, otherwise prompt.

  if (!lastClickedPixel) {
    alert("Click any pixel first to pick the target color to replace.");
    return;
  }

  const [startR, startG, startB] = lastClickedPixel;
  const fillR = parseInt(targetColorHex.slice(1, 3), 16);
  const fillG = parseInt(targetColorHex.slice(3, 5), 16);
  const fillB = parseInt(targetColorHex.slice(5, 7), 16);

  const tolerance = parseInt(controls.tolerance.value);
  let changed = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const diff = Math.max(
      Math.abs(pixels[i] - startR),
      Math.abs(pixels[i + 1] - startG),
      Math.abs(pixels[i + 2] - startB),
    );

    if (diff <= tolerance) {
      pixels[i] = fillR;
      pixels[i + 1] = fillG;
      pixels[i + 2] = fillB;
      pixels[i + 3] = 255;
      changed++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  console.log(`Global fill changed ${changed} pixels.`);
}

let lastClickedPixel = null;

// --- History & State ---

/**
 * Saves current canvas pixels to history.
 */
function saveState() {
  historyStep++;
  if (historyStep < historyStack.length) {
    historyStack = historyStack.slice(0, historyStep);
  }
  historyStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  updateButtonStates();
}

/** Undoes last fill */
function undoAction() {
  if (historyStep > 0) {
    historyStep--;
    ctx.putImageData(historyStack[historyStep], 0, 0);
    updateButtonStates();
  }
}

/** Redoes next fill */
function redoAction() {
  if (historyStep < historyStack.length - 1) {
    historyStep++;
    ctx.putImageData(historyStack[historyStep], 0, 0);
    updateButtonStates();
  }
}

/** Resets canvas to original image */
function resetCanvas() {
  if (originalImageData && confirm("Clear all coloring?")) {
    ctx.putImageData(originalImageData, 0, 0);
    saveState();
  }
}

function updateButtonStates() {
  controls.undo.disabled = historyStep <= 0;
  controls.redo.disabled = historyStep >= historyStack.length - 1;
}

// --- View ---

/**
 * Adjusts canvas zoom.
 * @param {number} factor - Scale factor.
 */
function adjustZoom(factor) {
  zoomLevel *= factor;
  updateCanvasTransform();
}

/**
 * Updates CSS transform for canvas based on zoom and pan.
 */
function updateCanvasTransform() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  controls.zoomValue.textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Initialize
document.addEventListener("DOMContentLoaded", initRasterEditor);
