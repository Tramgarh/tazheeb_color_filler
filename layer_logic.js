/**
 * @file layer_logic.js
 * @description Manages the layer system UI, including rendering layer items,
 * handling visibility, locking, and synchronization with the SVG canvas.
 */

import { loadSvg } from "./layering_controller.js";

// --- State Management ---

/** @type {Array<Object>} Internal state of layers analyzed from SVG */
let layers = [];

/** @type {Object|null} Temporary storage for the item being dragged */
let draggedItem = null;

// --- DOM Elements ---

const elements = {
  container: document.getElementById("layersContainer"),
  totalLayers: document.getElementById("totalLayersCount"),
  totalElements: document.getElementById("totalElementsCount"),
  analyzeBtn: document.getElementById("analyzeLayersBtn"),
};

// --- Initialization ---

/**
 * Initializes the layering system and sets up global event listeners.
 */
export function initLayeringSystem() {
  layers = [];
  renderLayers();
  updateStats();

  if (elements.analyzeBtn) {
    elements.analyzeBtn.onclick = analyzeSVGLayers;
  }

  // Listen for selection changes from the canvas to highlight layers
  document.addEventListener("selection-changed", (e) => {
    syncLayerHighlight(e.detail.elementIds);
  });
}

// --- SVG Analysis ---

/**
 * Analyzes an SVG's structure and generates an initial layer list.
 * @param {SVGSVGElement} svgNode - The SVG DOM node to analyze.
 * @param {string} svgText - The raw SVG source code.
 */
export function analyzeAndCreateLayersFromSVG(svgNode, svgText) {
  if (!elements.container) return;

  elements.container.innerHTML = `
    <div style="padding: 40px; text-align: center;">
      <div class="loading" style="margin: 0 auto 12px;"></div>
      <p class="text-xs text-muted">Analyzing layers...</p>
    </div>
  `;

  // Use the controller to parse colors and groups
  layers = loadSvg(svgText);

  renderLayers();
  updateStats();
}

/**
 * Analyzes layers for the currently loaded SVG on the canvas.
 */
function analyzeSVGLayers() {
  const svgEl = document.querySelector("#svgContainer svg");
  if (svgEl) {
    // We'll need the source text again or use the existing nodes
    // For simplicity, we trigger the analysis with what we have
    analyzeAndCreateLayersFromSVG(svgEl, svgEl.outerHTML);
  }
}

// --- UI Rendering ---

/**
 * Renders the entire layer list into the sidebar container.
 */
function renderLayers() {
  if (layers.length === 0) {
    elements.container.innerHTML = `
      <div class="layers-empty-state" style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
        <i class="fas fa-layer-group" style="font-size: 32px; margin-bottom: 12px; opacity: 0.1;"></i>
        <p class="text-xs">No layers found.</p>
      </div>
    `;
    return;
  }

  // Render from top (last in array) to bottom
  const sorted = [...layers].sort((a, b) => b.order - a.order);

  elements.container.innerHTML = sorted
    .map(
      (layer) => `
    <div class="layer-item" id="layer-${layer.id}">
      <div class="layer-header">
        <button class="layer-action-btn" onclick="window.layerManager.toggleVisibility('${layer.id}')">
          <i class="fas fa-eye${layer.visible ? "" : "-slash"}"></i>
        </button>
        
        <div class="layer-info" onclick="window.layerManager.selectLayer('${layer.id}', event)">
          <div class="layer-name">${layer.name}</div>
          <div class="layer-subtitle">${layer.elements.length} elements</div>
        </div>
        
        <button class="layer-action-btn ${layer.locked ? "locked" : ""}" onclick="window.layerManager.toggleLock('${layer.id}')">
          <i class="fas fa-${layer.locked ? "lock" : "unlock"}"></i>
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * Synchronizes the layers UI highlight with elements selected on the canvas.
 * @param {Array<string>} selectedIds - List of selected element IDs.
 */
function syncLayerHighlight(selectedIds) {
  document
    .querySelectorAll(".layer-item")
    .forEach((el) => el.classList.remove("selected-layer"));

  if (!selectedIds || selectedIds.length === 0) return;

  layers.forEach((layer) => {
    const match = layer.elements.some((el) =>
      selectedIds.includes(el.elementId),
    );
    if (match) {
      const el = document.getElementById(`layer-${layer.id}`);
      if (el) el.classList.add("selected-layer");
    }
  });
}

// --- Public Actions ---

/**
 * Global layer manager exposed for inline event handlers.
 */
window.layerManager = {
  /**
   * Toggles the visibility of all elements in a layer.
   * @param {string} id - Layer ID.
   */
  toggleVisibility: (id) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;

    layer.visible = !layer.visible;
    const svg = document.querySelector("#svgContainer svg");
    if (svg) {
      layer.elements.forEach((el) => {
        const node = svg.querySelector(`[data-element-id="${el.elementId}"]`);
        if (node) node.style.display = layer.visible ? "" : "none";
      });
    }
    renderLayers();
  },

  /**
   * Toggles the interaction lock for a layer.
   * @param {string} id - Layer ID.
   */
  toggleLock: (id) => {
    const layer = layers.find((l) => l.id === id);
    if (layer) {
      layer.locked = !layer.locked;
      renderLayers();
    }
  },

  /**
   * Selects all elements belonging to a layer.
   * @param {string} id - Layer ID.
   * @param {Event} e - Click event.
   */
  selectLayer: (id, e) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;

    const ids = layer.elements.map((el) => el.elementId);
    document.dispatchEvent(
      new CustomEvent("request-selection", {
        detail: {
          elementIds: ids,
          type: e.shiftKey ? "add" : "replace",
        },
      }),
    );
  },
};

/**
 * Updates the summary statistics in the sidebar footer.
 */
function updateStats() {
  if (!elements.totalLayers) return;
  const count = layers.reduce((sum, l) => sum + l.elements.length, 0);
  elements.totalLayers.textContent = layers.length;
  elements.totalElements.textContent = count;
}

// Start the system
document.addEventListener("DOMContentLoaded", initLayeringSystem);
