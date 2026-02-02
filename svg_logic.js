/**
 * @file svg_logic.js
 * @description Core logic for the SVG Artwork Editor, handling selection,
 * transformations, history management, and styling of SVG elements.
 */
// import { XMLSerializer } from "@xmldom/xmldom";
import { analyzeAndCreateLayersFromSVG } from "./layer_logic.js";

// --- State Management ---

/** @type {SVGSVGElement|null} The current active SVG element on the canvas */
let svgElement = null;

/** @type {Set<SVGElement>} Currently selected elements */
let selectedElements = new Set();

/** @type {SVGElement|null} The element currently under the mouse pointer */
let hoveredElement = null;

/** @type {number} Current zoom level (1.0 = 100%) */
let currentZoom = 1;

/** @type {number} X-axis offset for panning */
let svgPanX = 0;

/** @type {number} Y-axis offset for panning */
let svgPanY = 0;

/** @type {boolean} Whether the user is currently panning the canvas */
let isSvgPanning = false;

/** @type {number} Initial mouse X position when panning starts */
let svgPanStartX = 0;

/** @type {number} Initial mouse Y position when panning starts */
let svgPanStartY = 0;

/** @type {Array<SVGElement>} Undo history stack of SVG clones */
let history = [];

/** @type {number} Current position in the undo history stack */
let historyIndex = -1;

/** @type {Map<SVGElement, string>} Stores original fill colors for reset functionality */
let originalColors = new Map();

/** @type {string} The color the selected element had before the user started editing it */
let selectionInitialColor = null;

/** @type {string} Last used fill color */
let lastSelectedFillColor = null;

/** @type {string} Last used stroke color */
let lastSelectedStrokeColor = "#000000";

/** @type {number} Last used stroke width */
let lastSelectedStrokeWidth = 0;

/** @type {number} Last used opacity (0.0 to 1.0) */
let lastSelectedOpacity = 1;

// --- DOM Elements ---

const elements = {
  canvas: document.getElementById("svgContainer"),
  loading: document.getElementById("loadingIndicator"),
  zoomValue: document.getElementById("zoomValue"),
  fileName: document.getElementById("currentFileName"),

  // Property Controls
  colorPicker: document.getElementById("colorPicker"),
  colorInput: document.getElementById("customColorValue"),
  strokeColorPicker: document.getElementById("strokeColorPicker"),
  strokeColorInput: document.getElementById("strokeColorValue"),
  strokeWidthSlider: document.getElementById("strokeWidthSlider"),
  strokeWidthValue: document.getElementById("strokeWidthValue"),
  opacitySlider: document.getElementById("opacitySlider"),
  opacityValue: document.getElementById("opacityValue"),

  // Display
  selectionPreview: document.getElementById("selectionPreview"),
  colorPresets: document.getElementById("colorPresets"),

  // Actions
  fileInput: document.getElementById("fileInput"),
  openBtn: document.getElementById("openFileBtn"),
  saveBtn: document.getElementById("saveBtnGlobal"),
  undoBtn: document.querySelector('button[title="Undo"]'),
  redoBtn: document.querySelector('button[title="Redo"]'),
  fillSimilarBtn: document.getElementById("fillSimilarColorsBtn"),

  // View Controls
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  centerView: document.getElementById("centerView"),
  resetView: document.getElementById("resetView"),

  // Property Info
  quickDesc: document.getElementById("elementQuickDesc"),
  propIdQuick: document.getElementById("prop-id-quick"),
  propColorQuick: document.getElementById("prop-color-quick"),
  extendedInfo: document.getElementById("extendedInfoList"),
};

// --- Initialization ---

/**
 * Initializes the SVG Editor by loading the default artwork and setting up presets.
 */
function initEditor() {
  // Attempt to load a default SVG if available
  fetch("js_art.svg")
    .then((res) => (res.ok ? res.text() : Promise.reject()))
    .then(loadSvgFromText)
    .catch(() => {
      elements.loading.style.display = "none";
      elements.canvas.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fas fa-folder-open" style="font-size: 48px; margin-bottom: 20px; opacity: 0.8;"></i>
                    <h3>Ready to Edit</h3>
                    <p>Open an SVG file to get started.</p>
                </div>
            `;
    });

  initColorPresets();
  setupEventListeners();
}

/**
 * Populates the property panel with default color presets.
 */
function initColorPresets() {
  const presets = [
    "#4361ee",
    "#3a0ca3",
    "#4cc9f0",
    "#f72585",
    "#7209b7",
    "#480ca8",
    "#560bad",
    "#b5179e",
    "#06d6a0",
    "#1b9aaa",
    "#ef476f",
    "#ffd166",
    "#118ab2",
    "#073b4c",
    "#ff9e00",
    "#9d4edd",
    "#000000",
    "#ffffff",
  ];

  elements.colorPresets.innerHTML = "";
  presets.forEach((color) => {
    const opt = document.createElement("div");
    opt.className = "color-option";
    opt.style.backgroundColor = color;
    opt.onclick = () => {
      elements.colorPicker.value = color;
      elements.colorInput.value = color;
      applyFillColor(color);
    };
    elements.colorPresets.appendChild(opt);
  });
}

// --- History Management ---

/**
 * Saves a snapshot of the current SVG state to the undo history.
 */
function saveHistory() {
  if (!svgElement) return;

  // Prune future history if we're in the middle of the stack
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  history.push(svgElement.cloneNode(true));
  historyIndex++;

  updateHistoryButtons();
}

/**
 * Undoes the last action.
 */
function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreFromHistory();
}

/**
 * Redoes the next action.
 */
function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreFromHistory();
}

/**
 * Restores the SVG canvas from the history stack at the current index.
 */
function restoreFromHistory() {
  const saved = history[historyIndex];
  if (!saved) return;

  elements.canvas.replaceChild(saved, svgElement);
  svgElement = saved;

  // Re-initialize SVG to attach events to new nodes
  attachSvgEvents();
  updateHistoryButtons();
  clearSelection();
}

/**
 * Updates the disabled state of undo/redo buttons.
 */
function updateHistoryButtons() {
  if (elements.undoBtn)
    elements.undoBtn.style.opacity = historyIndex <= 0 ? "0.3" : "1";
  if (elements.redoBtn)
    elements.redoBtn.style.opacity =
      historyIndex >= history.length - 1 ? "0.3" : "1";
}

// --- SVG Loading & Processing ---

/**
 * Parses and loads an SVG from a string of text.
 * @param {string} text - The SVG source code.
 */
function loadSvgFromText(text) {
  try {
    elements.loading.style.display = "block";

    // Reset State
    selectedElements.clear();
    originalColors.clear();

    elements.canvas.innerHTML = text;
    svgElement = elements.canvas.querySelector("svg");

    if (!svgElement) throw new Error("No SVG element found");

    attachSvgEvents();
    centerSvg();

    // Initial history state
    history = [];
    historyIndex = -1;
    saveHistory();

    // Trigger layer analysis
    analyzeAndCreateLayersFromSVG(svgElement, text);

    elements.loading.style.display = "none";
  } catch (e) {
    console.error("SVG Load Error:", e);
    elements.canvas.innerHTML = `<p style="padding: 20px; color: var(--accent);">Failed to load SVG: ${e.message}</p>`;
  }
}

/**
 * Attaches interaction listeners to the SVG nodes.
 */
function attachSvgEvents() {
  if (!svgElement) return;

  const interactiveTags = "path, rect, circle, ellipse, polygon, line, text";
  const nodes = svgElement.querySelectorAll(interactiveTags);

  nodes.forEach((node, i) => {
    // Ensure every node has a unique ID for selection tracking
    if (!node.dataset.elementId) {
      node.dataset.elementId = `${node.tagName.toLowerCase()}-${i}`;
    }

    // Store original fill for reset
    const currentFill = node.getAttribute("fill") || node.style.fill || "none";
    originalColors.set(node, currentFill);
  });

  svgElement.addEventListener("mousemove", handleCanvasMouseMove);
  svgElement.addEventListener("click", handleCanvasClick);
  svgElement.addEventListener("mouseleave", () => {
    if (hoveredElement) {
      hoveredElement.classList.remove("hover-element");
      hoveredElement = null;
    }
  });
}

// --- Interaction Handlers ---

/**
 * Handles element hovering on the SVG canvas.
 */
function handleCanvasMouseMove(e) {
  if (isSvgPanning) return;

  const target = e.target.closest(
    "path, rect, circle, ellipse, polygon, line, text",
  );

  if (hoveredElement && hoveredElement !== target) {
    hoveredElement.classList.remove("hover-element");
  }

  if (target && !selectedElements.has(target)) {
    target.classList.add("hover-element");
    hoveredElement = target;
  } else {
    hoveredElement = null;
  }
}

/**
 * Handles element selection on the SVG canvas.
 */
function handleCanvasClick(e) {
  const target = e.target.closest(
    "path, rect, circle, ellipse, polygon, line, text",
  );

  if (target) {
    const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
    toggleSelection(target, isMultiSelect);
  } else {
    clearSelection();
  }
}

/**
 * Toggles or sets the selection of specific elements.
 * @param {SVGElement} element - The element to select.
 * @param {boolean} append - If true, adds to selection instead of replacing.
 */
export function toggleSelection(element, append = false) {
  if (!append) clearSelection();

  if (selectedElements.has(element)) {
    selectedElements.delete(element);
    element.classList.remove("selected-element");
  } else {
    selectedElements.add(element);
    element.classList.add("selected-element");
    element.classList.remove("hover-element");
  }

  updateUIForSelection();
}

/**
 * Clears the current selection.
 */
function clearSelection() {
  selectedElements.forEach((el) => el.classList.remove("selected-element"));
  selectedElements.clear();
  updateUIForSelection();
}

/**
 * Fills all elements that have the same color as the current selection's previous color.
 */
function fillSimilarColor() {
  if (selectedElements.size === 0 || !svgElement || !selectionInitialColor)
    return;

  const targetColorHex = rgbToHex(selectionInitialColor);
  const newColor = elements.colorPicker.value;

  // Let's check for elements in the WHOLE SVG that match targetColor
  const allElements = svgElement.querySelectorAll(
    "path, rect, circle, ellipse, polygon, line, text",
  );
  let changedCount = 0;

  saveHistory();

  allElements.forEach((el) => {
    // Determine the current color regardless of how it was applied
    const computedFill = window.getComputedStyle(el).fill;
    const computedHex = rgbToHex(computedFill);

    // Compare hex values for consistency
    if (computedHex === targetColorHex) {
      el.setAttribute("fill", newColor);
      el.style.setProperty("fill", newColor, "important");
      changedCount++;
    }
  });

  console.log(
    `Filled ${changedCount} elements with similar color: ${targetColorHex} -> ${newColor}`,
  );
  // Update initial color to the new one so subsequent clicks don't re-apply old color
  selectionInitialColor = newColor;
}

/**
 * Updates the property panel UI based on the current selection.
 */
function updateUIForSelection() {
  if (selectedElements.size === 0) {
    elements.selectionPreview.classList.add("empty");
    elements.selectionPreview.innerHTML = `<i class="fas fa-mouse-pointer" style="font-size: 24px; margin-bottom: 8px;"></i><p class="text-xs">Select element to edit</p>`;
    return;
  }

  elements.selectionPreview.classList.remove("empty");
  const primary = Array.from(selectedElements).pop();

  // Update preview SVG
  const bbox = primary.getBBox();
  const previewSvg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  previewSvg.setAttribute(
    "viewBox",
    `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
  );
  previewSvg.style.width = "100%";
  previewSvg.style.height = "100px";

  const clone = primary.cloneNode(true);
  clone.classList.remove("selected-element", "hover-element");
  previewSvg.appendChild(clone);
  elements.selectionPreview.innerHTML = "";
  elements.selectionPreview.appendChild(previewSvg);

  const fill = window.getComputedStyle(primary).fill;

  // Store the color when selection happens, so we know what "similar" means even if changed
  if (selectedElements.size === 1) {
    selectionInitialColor = fill;
  }

  // Sync property inputs
  elements.colorPicker.value = rgbToHex(fill);
  elements.colorInput.value = fill;

  // Update Quick Info
  elements.quickDesc.style.display = "block";
  elements.propIdQuick.textContent =
    primary.id || primary.dataset.elementId || "Unnamed";
  elements.propColorQuick.textContent = fill;
  elements.propColorQuick.style.color = fill;

  // Update Extended Info
  updateExtendedInfo(primary);
}

/**
 * Updates the technical details tab with detailed element information.
 * @param {SVGElement} element
 */
function updateExtendedInfo(element) {
  if (!elements.extendedInfo) return;

  const bbox = element.getBBox
    ? element.getBBox()
    : { x: 0, y: 0, width: 0, height: 0 };
  const parent = element.parentElement;
  const parentName = parent ? parent.id || parent.tagName : "None";

  const infos = [
    { label: "Tag Name", value: element.tagName },
    { label: "Internal ID", value: element.dataset.elementId || "N/A" },
    { label: "SVG ID", value: element.id || "None" },
    { label: "Fill Color", value: element.getAttribute("fill") || "Inherit" },
    { label: "Stroke Color", value: element.getAttribute("stroke") || "None" },
    {
      label: "Stroke Width",
      value: element.getAttribute("stroke-width") || "0",
    },
    { label: "Opacity", value: element.getAttribute("opacity") || "1" },
    { label: "Width", value: bbox.width.toFixed(2) + "px" },
    { label: "Height", value: bbox.height.toFixed(2) + "px" },
    { label: "X Position", value: bbox.x.toFixed(2) },
    { label: "Y Position", value: bbox.y.toFixed(2) },
    { label: "Parent Group", value: parentName },
  ];

  elements.extendedInfo.innerHTML = infos
    .map(
      (i) => `
        <div class="prop-row">
            <span class="prop-label">${i.label}:</span>
            <span class="prop-value">${i.value}</span>
        </div>
    `,
    )
    .join("");
}

// --- Utility Functions ---

/**
 * Converts any CSS color string to a standard hex code.
 * @param {string} color - Input color string.
 * @returns {string} Hex color code.
 */
function rgbToHex(color) {
  if (!color || color === "none") return "#000000";
  if (color.startsWith("#")) return color;

  const temp = document.createElement("div");
  temp.style.color = color;
  document.body.appendChild(temp);
  const rgb = window.getComputedStyle(temp).color;
  document.body.removeChild(temp);

  const match = rgb.match(/\d+/g);
  if (!match) return "#000000";

  const [r, g, b] = match.map(Number);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Centers the SVG inside the canvas container.
 */
function centerSvg() {
  if (!svgElement) return;
  currentZoom = 1;
  svgPanX = 0;
  svgPanY = 0;
  applyTransform();
}

/**
 * Applies current zoom and pan transformations to the SVG.
 */
function applyTransform() {
  if (!svgElement) return;
  svgElement.style.transform = `translate(${svgPanX}px, ${svgPanY}px) scale(${currentZoom})`;
  elements.zoomValue.textContent = `${Math.round(currentZoom * 100)}%`;
}

// --- Action Implementation ---

/**
 * Applies a fill color to the selected elements.
 * @param {string} color - The hex color code.
 */
function applyFillColor(color) {
  if (selectedElements.size === 0) return;
  saveHistory();
  selectedElements.forEach((el) => {
    el.setAttribute("fill", color);
    el.style.setProperty("fill", color, "important");
  });
}

/**
 * Moves selected elements in the Z-index hierarchy.
 * @param {'front'|'back'|'forward'|'backward'} direction
 */
function moveZIndex(direction) {
  if (selectedElements.size === 0) return;
  saveHistory();

  selectedElements.forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;

    switch (direction) {
      case "front":
        parent.appendChild(el);
        break;
      case "back":
        parent.prepend(el);
        break;
      case "forward":
        if (el.nextElementSibling)
          parent.insertBefore(el, el.nextElementSibling.nextElementSibling);
        break;
      case "backward":
        if (el.previousElementSibling)
          parent.insertBefore(el, el.previousElementSibling);
        break;
    }
  });
}

// --- Event Listeners Setup ---

function setupEventListeners() {
  // Zoom Logic
  elements.zoomIn.onclick = () => {
    currentZoom *= 1.2;
    applyTransform();
  };
  elements.zoomOut.onclick = () => {
    currentZoom /= 1.2;
    applyTransform();
  };
  elements.centerView.onclick = centerSvg;

  // File Management
  elements.openBtn.onclick = () => elements.fileInput.click();
  elements.fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => loadSvgFromText(ev.target.result);
      reader.readAsText(file);
      elements.fileName.textContent = file.name;
    }
  };

  // Save/Export
  elements.saveBtn.onclick = () => {
    if (window.appState.currentTab === "svg") {
      console.log("saving to svg");
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(svgElement);
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = elements.fileName.textContent || "artwork.svg";
      link.click();
    } else {
      const canvas = document.getElementById("mainCanvas");
      const blob = new Blob([canvas.toDataURL()], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "artwork.png";
      link.click();
    }
  };

  // Panning Support
  elements.canvas.addEventListener("mousedown", (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isSvgPanning = true;
      svgPanStartX = e.clientX - svgPanX;
      svgPanStartY = e.clientY - svgPanY;
      elements.canvas.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isSvgPanning) {
      svgPanX = e.clientX - svgPanStartX;
      svgPanY = e.clientY - svgPanStartY;
      applyTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    isSvgPanning = false;
    elements.canvas.style.cursor = "crosshair";
  });

  // Wheel Zoom
  elements.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      currentZoom *= delta;
      applyTransform();
    },
    { passive: false },
  );

  // Property Event Handlers
  elements.colorPicker.oninput = (e) => applyFillColor(e.target.value);

  // Arrangement
  document.getElementById("bringToFront").onclick = () => moveZIndex("front");
  document.getElementById("bringForward").onclick = () => moveZIndex("forward");
  document.getElementById("sendBackward").onclick = () =>
    moveZIndex("backward");
  document.getElementById("sendToBack").onclick = () => moveZIndex("back");

  // History
  elements.undoBtn.onclick = undo;
  elements.redoBtn.onclick = redo;

  if (elements.fillSimilarBtn) {
    elements.fillSimilarBtn.onclick = fillSimilarColor;
  }
}

// Start the editor
document.addEventListener("DOMContentLoaded", initEditor);

// Handle selection requests from Layer Logic
document.addEventListener("request-selection", (e) => {
  const { elementIds, type } = e.detail;
  if (type === "replace") clearSelection();

  elementIds.forEach((id) => {
    const el = svgElement.querySelector(`[data-element-id="${id}"]`);
    if (el) toggleSelection(el, true);
  });
});
