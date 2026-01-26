// Import layering system
import { analyzeAndCreateLayersFromSVG } from "./layer_logic.js";

// DOM elements
const svgContainer = document.getElementById("svgContainer");
const colorPicker = document.getElementById("colorPicker");
const customColorValue = document.getElementById("customColorValue");
const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const centerViewBtn = document.getElementById("centerView");
const resetViewBtn = document.getElementById("resetView");
const fullscreenBtn = document.getElementById("fullscreen");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const resetColorsBtn = document.getElementById("resetColors");
const saveArtworkBtn = document.getElementById("saveArtwork");
const colorPresetsContainer = document.getElementById("colorPresets");
const loadingIndicator = document.getElementById("loadingIndicator");
const selectionPreview = document.getElementById("selectionPreview");
const previewContent = document.getElementById("previewContent");
const fileInput = document.getElementById("fileInput");
const openFileBtn = document.getElementById("openFileBtn");

// New Controls
const strokeColorPicker = document.getElementById("strokeColorPicker");
const strokeColorValue = document.getElementById("strokeColorValue");
const strokeWidthSlider = document.getElementById("strokeWidthSlider");
const strokeWidthValue = document.getElementById("strokeWidthValue");
const opacitySlider = document.getElementById("opacitySlider");
const opacityValue = document.getElementById("opacityValue");

// Arrangement Controls
const bringToFrontBtn = document.getElementById("bringToFront");
const bringForwardBtn = document.getElementById("bringForward");
const sendBackwardBtn = document.getElementById("sendBackward");
const sendToBackBtn = document.getElementById("sendToBack");

// State variables
let svgElement = null;
let selectedElements = new Set();
let hoveredElement = null;
let currentZoom = 1;
let svgPanX = 0;
let svgPanY = 0;
let isSvgPanning = false;
let svgPanStartX = 0;
let svgPanStartY = 0;
let history = [];
let historyIndex = -1;
let originalColors = new Map();
let hoverTimeout = null;
let lastSelectedFillColor = null;
let lastSelectedStrokeColor = "#000000";
let lastSelectedStrokeWidth = 0;
let lastSelectedOpacity = 1;

// Export selectElements for layer panel
export function selectElements(elements, keepExisting = false) {
  if (!keepExisting) {
      clearSelection();
  }

  elements.forEach(element => {
      selectedElements.add(element);
      element.classList.add("selected-element");
      element.classList.remove("hover-element");
  });
  
  updateUIForSelection();
}

// Helper: normalize CSS color into hex or rgba string
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const n = Math.round(x);
        return n.toString(16).padStart(2, "0");
      })
      .join("")
      .toLowerCase()
  );
}

function cssColorToHex(color, el) {
  if (!color) return "";
  color = color.trim();
  if (color.startsWith("#")) {
    if (color.length === 4) {
      return (
        "#" +
        color[1] +
        color[1] +
        color[2] +
        color[2] +
        color[3] +
        color[3]
      ).toLowerCase();
    }
    return color.toLowerCase();
  }
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    const r = parseInt(parts[0], 10);
    const g = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    if (a === 0) return "transparent";
    if (a < 1) return `rgba(${r},${g},${b},${a})`;
    return rgbToHex(r, g, b);
  }
  try {
    const temp = document.createElement("div");
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);
    if (computed) return cssColorToHex(computed);
  } catch (e) {}
  return color.toLowerCase();
}

// Color presets
const colorPresets = [
  "#4361ee", "#3a0ca3", "#4cc9f0", "#f72585", "#7209b7", "#480ca8",
  "#560bad", "#b5179e", "#06d6a0", "#1b9aaa", "#ef476f", "#ffd166",
  "#118ab2", "#073b4c", "#ff9e00", "#9d4edd",
];

// Initialize the editor
function initEditor() {
  fetch("js_art.svg")
    .then((res) => {
      if (!res.ok) throw new Error("SVG file not found");
      return res.text();
    })
    .then((svgText) => {
      loadSvgFromText(svgText);
    })
    .catch((error) => {
      console.error("Error loading SVG:", error);
      loadingIndicator.style.display = "none";
      svgContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; color: #ff6b6b;"></i>
          <h3>SVG File Not Found</h3>
          <p>Upload an SVG file using the "Open SVG" button above.</p>
        </div>
      `;
    });

  initColorPresets();
  initEventListeners();
}

// Load SVG content from a string
function loadSvgFromText(svgText) {
  try {
    selectedElements.clear();
    hoveredElement = null;
    originalColors = new Map();
    history = [];
    historyIndex = -1;

    svgContainer.innerHTML = svgText;
    svgElement = svgContainer.querySelector("svg");

    if (!svgElement) {
      throw new Error("Loaded file does not contain an <svg> element.");
    }

    initSvg();
    loadingIndicator.style.display = "none";
    
    // Analyze layers after SVG is loaded
    if (typeof analyzeAndCreateLayersFromSVG === 'function') {
      analyzeAndCreateLayersFromSVG(svgElement, svgText);
    }

  } catch (err) {
    console.error("Failed to load SVG:", err);
    svgContainer.innerHTML = `
      <div style="text-align:center; padding:30px; color:#666;">
        <h3>Invalid SVG file</h3>
        <p>Please choose a valid SVG file.</p>
        <pre style="font-size:0.8em; margin-top:10px; color:#cf6679;">${err.message}</pre>
      </div>
    `;
  }
}

// Handle file upload
function handleFile(file) {
  if (!file) return;

  if (!(file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"))) {
    alert("Please select a valid SVG file.");
    return;
  }

  loadingIndicator.style.display = "block";
  loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading SVG...</span>';

  const reader = new FileReader();
  reader.onload = (e) => {
    loadSvgFromText(e.target.result);
  };
  reader.onerror = (e) => {
    console.error("Error reading file:", e);
    alert("Could not read the selected file.");
    loadingIndicator.style.display = "none";
  };
  reader.readAsText(file);
}

// Initialize the SVG for editing
function initSvg() {
  const elements = svgElement.querySelectorAll(
    "path, rect, circle, ellipse, polygon, line, text"
  );
  const elementIds = {};

  elements.forEach((el, index) => {
    const originalColor = el.getAttribute("fill") || "#000000";
    originalColors.set(el, originalColor);

    let elementId;
    let tagName = el.tagName.toLowerCase();
    let counter = 1;

    do {
      elementId = `${tagName}-${counter}`;
      counter++;
    } while (elementIds[elementId]);

    elementIds[elementId] = true;
    el.dataset.elementId = elementId;
  });

  svgElement.addEventListener("mousemove", handleSvgMouseMove);
  svgElement.addEventListener("click", handleSvgClick);
  svgElement.addEventListener("mouseleave", handleSvgMouseLeave);

  centerSvg();
  saveHistory();
}

function handleSvgMouseMove(e) {
  if (e.shiftKey) return;

  const element = e.target;
  
  if (!element.dataset.elementId) {
      if (hoveredElement) {
         handleElementLeave(e, hoveredElement);
      }
      return;
  }

  if (element === hoveredElement) return;

  if (hoveredElement && hoveredElement !== element) {
    hoveredElement.classList.remove("hover-element");
  }

  element.classList.add("hover-element");
  hoveredElement = element;
}

function handleSvgMouseLeave(e) {
  if (hoveredElement) {
     handleElementLeave(e, hoveredElement);
  }
}

function handleElementLeave(e, element) {
  if (!element) return;
  
  if (!selectedElements.has(element)) {
    element.classList.remove("hover-element");
  }

  if (element === hoveredElement) {
    hoveredElement = null;
  }
}

// Event Bus Listeners
document.addEventListener('request-selection', (e) => {
    const { elementIds, type } = e.detail;
    if (type === 'replace') {
        clearSelection();
    }
    
    const elementsToSelect = [];
    if (elementIds && elementIds.length) {
        elementIds.forEach(id => {
            const el = svgElement.querySelector(`[data-element-id="${id}"]`);
            if (el) elementsToSelect.push(el);
        });
    }
    
    if (elementsToSelect.length > 0) {
        selectElements(elementsToSelect, type === 'add');
    }
});

function handleSvgClick(e) {
    const element = e.target;
    if (element.dataset.elementId) {
        e.stopPropagation();
        handleElementClick(e, element);
    } else {
        clearSelection();
    }
}

function handleElementClick(e, element) {
  const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
  selectElements([element], isMulti);
}

function clearSelection() {
    selectedElements.forEach(el => {
        el.classList.remove("selected-element");
    });
    selectedElements.clear();
    updateUIForSelection();
}

function updateUIForSelection() {
    if (selectedElements.size === 0) {
        selectionPreview.classList.add("empty");
        selectionPreview.innerHTML = `
        <div id="previewContent">
          <i class="fas fa-mouse-pointer"></i>
          <p>Click on any element to select it</p>
        </div>
      `;
      return;
    }

    const primaryElement = Array.from(selectedElements).pop();
    updateSelectionPreview(primaryElement);
    updateStyleControls(primaryElement);
    
    const selectedIds = Array.from(selectedElements).map(el => el.dataset.elementId);
    document.dispatchEvent(new CustomEvent('selection-changed', { 
        detail: { elementIds: selectedIds } 
    }));
}

function updateStyleControls(element) {
   const fillColor = element.getAttribute("fill") || element.style.fill || window.getComputedStyle(element).fill || "#000000";
   const normalizedFill = cssColorToHex(fillColor, element) || fillColor;
   lastSelectedFillColor = normalizedFill;

  colorPicker.value = normalizedFill.startsWith("#") ? normalizedFill : "#000000";
  customColorValue.value = normalizedFill;

  document.querySelectorAll(".color-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.color === normalizedFill);
  });

  const strokeColor = element.getAttribute("stroke") || element.style.stroke || "none";
  const strokeWidth = element.getAttribute("stroke-width") || element.style.strokeWidth || "0";
  const opacity = element.getAttribute("opacity") || element.style.opacity || "1";

  const normalizedStroke = strokeColor === 'none' ? '#000000' : (cssColorToHex(strokeColor, element) || strokeColor);
  lastSelectedStrokeColor = normalizedStroke;
  strokeColorPicker.value = normalizedStroke.startsWith('#') ? normalizedStroke : '#000000';
  strokeColorValue.value = normalizedStroke;

  const strokeWidthFloat = parseFloat(strokeWidth) || 0;
  lastSelectedStrokeWidth = strokeWidthFloat;
  strokeWidthSlider.value = strokeWidthFloat;
  strokeWidthValue.textContent = `${strokeWidthFloat}px`;

  const opacityFloat = parseFloat(opacity);
  const opacityPercent = Math.round((isNaN(opacityFloat) ? 1 : opacityFloat) * 100);
  lastSelectedOpacity = opacityFloat;
  opacitySlider.value = opacityPercent;
  opacityValue.textContent = `${opacityPercent}%`;
}

function updateSelectionPreview(element) {
  selectionPreview.classList.remove("empty");

  const bbox = element.getBBox();
  const previewSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  previewSvg.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
  previewSvg.setAttribute("width", "100%");
  previewSvg.setAttribute("height", "100%");
  previewSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const clone = element.cloneNode(true);
  clone.classList.remove("selected-element", "hover-element");
  previewSvg.appendChild(clone);

  const fillColor = element.getAttribute("fill") || element.style.fill || window.getComputedStyle(element).fill || 'none';
  const normalizedFill = cssColorToHex(fillColor, element) || fillColor;
  const strokeFill = element.getAttribute("stroke") || element.style.stroke || 'none';
  const normalizedStroke = cssColorToHex(strokeFill, element) || strokeFill;

  // Enhanced info display
  const elementType = element.tagName.toLowerCase();
  const pathData = element.getAttribute("d") || "";
  const pathCommands = pathData ? pathData.match(/[a-zA-Z]/g)?.length || 0 : 0;
  
  selectionPreview.innerHTML = `
    <div id="previewHeader">
      <span>${selectedElements.size > 1 ? `${selectedElements.size} Elements Selected` : 'Selected Element'}</span>
      <span style="font-size:0.8rem; opacity:0.9; text-transform:uppercase">${elementType}</span>
    </div>

    <div id="previewContent" style="width:100%; height:200px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
      ${previewSvg.outerHTML}
    </div>
    
    <div class="preview-details" style="padding: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;">
      <div class="preview-info-row">
        <span class="preview-label">Element ID:</span>
        <span class="preview-value">${element.dataset.elementId}</span>
      </div>
      <div class="preview-info-row">
        <span class="preview-label">Fill Color:</span>
        <span class="preview-value" style="color:${normalizedFill}">${normalizedFill}</span>
      </div>
      <div class="preview-info-row">
        <span class="preview-label">Stroke:</span>
        <span class="preview-value" style="color:${normalizedStroke}">${normalizedStroke}</span>
      </div>
      ${pathCommands > 0 ? `
      <div class="preview-info-row">
        <span class="preview-label">Path Commands:</span>
        <span class="preview-value">${pathCommands}</span>
      </div>
      ` : ''}
      <div class="preview-info-row">
        <span class="preview-label">Dimensions:</span>
        <span class="preview-value">${Math.round(bbox.width)} × ${Math.round(bbox.height)}px</span>
      </div>
    </div>
  `;
}

function initColorPresets() {
  colorPresets.forEach((color) => {
    const colorOption = document.createElement("div");
    colorOption.className = "color-option";
    colorOption.style.backgroundColor = color;
    colorOption.dataset.color = color;

    colorOption.addEventListener("click", () => {
      setColor(color);
      colorPicker.value = color;
      customColorValue.value = color;
    });

    colorPresetsContainer.appendChild(colorOption);
  });
}

function initEventListeners() {
  colorPicker.addEventListener("input", (e) => {
    const color = e.target.value;
    customColorValue.value = color;
    setColor(color);
  });

  customColorValue.addEventListener("change", (e) => {
    const color = e.target.value;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
      colorPicker.value = color;
      setColor(color);
    } else {
      alert("Please enter a valid hex color (e.g., #FF0000)");
      customColorValue.value = colorPicker.value;
    }
  });

  zoomSlider.addEventListener("input", (e) => {
    const zoomPercent = parseInt(e.target.value);
    currentZoom = zoomPercent / 100;
    updateZoom();
  });

  zoomInBtn.addEventListener("click", () => {
    const newZoom = Math.min(500, currentZoom * 100 + 15);
    zoomSlider.value = newZoom;
    currentZoom = newZoom / 100;
    updateZoom();
  });

  zoomOutBtn.addEventListener("click", () => {
    const newZoom = Math.max(10, currentZoom * 100 - 15);
    zoomSlider.value = newZoom;
    currentZoom = newZoom / 100;
    updateZoom();
  });

  centerViewBtn.addEventListener("click", centerSvg);
  resetViewBtn.addEventListener("click", resetView);
  fullscreenBtn.addEventListener("click", toggleFullscreen);

  svgContainer.addEventListener('wheel', (e) => {
    if (!svgElement || svgElement.querySelectorAll('*').length === 0) return;
    e.preventDefault();
    
    const zoomSpeed = 0.15;
    const delta = e.deltaY > 0 ? -1 : 1;
    const newZoom = Math.max(0.1, Math.min(5, currentZoom + delta * zoomSpeed));
    
    if (newZoom !== currentZoom) {
      currentZoom = newZoom;
      zoomSlider.value = Math.round(currentZoom * 100);
      updateZoom();
    }
  }, { passive: false });

  svgContainer.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      isSvgPanning = true;
      svgPanStartX = e.clientX - svgPanX;
      svgPanStartY = e.clientY - svgPanY;
      svgContainer.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isSvgPanning && svgElement && svgElement.querySelectorAll('*').length > 0) {
      svgPanX = e.clientX - svgPanStartX;
      svgPanY = e.clientY - svgPanStartY;
      updateZoom();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isSvgPanning) {
      isSvgPanning = false;
      svgContainer.style.cursor = 'default';
    }
  });

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  resetColorsBtn.addEventListener("click", resetAllColors);
  saveArtworkBtn.addEventListener("click", saveSVG);

  if (openFileBtn && fileInput) {
    openFileBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
      fileInput.value = "";
    });
  }

  svgContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    svgContainer.classList.add("drag-over");
  });

  svgContainer.addEventListener("dragleave", (e) => {
    svgContainer.classList.remove("drag-over");
  });

  svgContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    svgContainer.classList.remove("drag-over");
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  });

  strokeColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      strokeColorValue.value = color;
      setStrokeColor(color);
  });

  strokeColorValue.addEventListener("change", (e) => {
        const color = e.target.value;
        if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
            strokeColorPicker.value = color;
            setStrokeColor(color);
        }
  });

  strokeWidthSlider.addEventListener("input", (e) => {
      const width = e.target.value;
      strokeWidthValue.textContent = `${width}px`;
      setStrokeWidth(width);
  });

  opacitySlider.addEventListener("input", (e) => {
      const percent = e.target.value;
      opacityValue.textContent = `${percent}%`;
      setOpacity(percent / 100);
  });

  const addClick = (el, fn) => el && el.addEventListener("click", fn);
  addClick(bringToFrontBtn, () => moveElement("front"));
  addClick(bringForwardBtn, () => moveElement("forward"));
  addClick(sendBackwardBtn, () => moveElement("backward"));
  addClick(sendToBackBtn, () => moveElement("back"));
}

function setColor(color) {
  if (selectedElements.size === 0) {
    alert("Please select an element first.");
    return;
  }

  saveHistory();

  selectedElements.forEach(element => {
      element.style.fill = color;
      element.setAttribute("fill", color);
  });
  
  const primaryElement = Array.from(selectedElements).pop();
  if (primaryElement) {
       updateUIForSelection(); 
  }
}

let zoomRequestId = null;
function updateZoom() {
  if (zoomRequestId) return;
  
  zoomRequestId = requestAnimationFrame(() => {
    if (!svgElement) return;
    svgElement.style.transform = `translate(${svgPanX}px, ${svgPanY}px) scale(${currentZoom})`;
    svgElement.style.transformOrigin = 'center center';
    svgElement.style.transition = isSvgPanning ? 'none' : 'transform 0.1s ease-out';
    zoomValue.textContent = `${Math.round(currentZoom * 100)}%`;
    zoomRequestId = null;
  });
}

function centerSvg() {
  if (!svgElement) return;

  svgPanX = 0;
  svgPanY = 0;
  currentZoom = 1;
  zoomSlider.value = 100;
  
  svgElement.style.transform = 'translate(0, 0) scale(1)';
  svgElement.style.transformOrigin = 'center center';
  svgElement.style.margin = 'auto';

  svgContainer.style.display = 'flex';
  svgContainer.style.alignItems = 'center';
  svgContainer.style.justifyContent = 'center';
  
  updateZoom();
}

function resetView() {
  if (!svgElement) return;
  currentZoom = 1;
  svgPanX = 0;
  svgPanY = 0;
  zoomSlider.value = 100;
  svgElement.style.transform = 'translate(0, 0) scale(1)';
  updateZoom();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    fullscreenBtn.title = "Exit Fullscreen";
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
      fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
      fullscreenBtn.title = "Enter Fullscreen";
    }
  }
}

function saveHistory() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  const svgClone = svgElement.cloneNode(true);
  history.push(svgClone);
  historyIndex++;

  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex <= 0) return;

  historyIndex--;
  restoreFromHistory();
}

function redo() {
  if (historyIndex >= history.length - 1) return;

  historyIndex++;
  restoreFromHistory();
}

function restoreFromHistory() {
  const savedSvg = history[historyIndex];

  svgContainer.replaceChild(savedSvg, svgElement);
  svgElement = savedSvg;

  initSvg();
  updateUndoRedoButtons();
  clearSelection();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = historyIndex <= 0;
  undoBtn.style.opacity = undoBtn.disabled ? "0.5" : "1";
  undoBtn.style.cursor = undoBtn.disabled ? "not-allowed" : "pointer";

  redoBtn.disabled = historyIndex >= history.length - 1;
  redoBtn.style.opacity = redoBtn.disabled ? "0.5" : "1";
  redoBtn.style.cursor = redoBtn.disabled ? "not-allowed" : "pointer";
}

function resetAllColors() {
  if (!confirm("Are you sure you want to reset all colors to their original values?")) {
    return;
  }

  saveHistory();

  const elements = svgElement.querySelectorAll("path, rect, circle, ellipse, polygon, line, text");

  elements.forEach((element) => {
    const originalElement = Array.from(originalColors.keys()).find(
      (el) => el.dataset.elementId === element.dataset.elementId
    );

    if (originalElement) {
      const originalColor = originalColors.get(originalElement);
      element.style.fill = originalColor;
      element.setAttribute("fill", originalColor);
    }
  });

  if (selectedElements.size > 0) {
      const primaryElement = Array.from(selectedElements).pop();
      updateSelectionPreview(primaryElement);
  }
}

function saveSVG() {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgData], { type: "image/svg+xml" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edited_artwork.svg";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  const originalText = saveArtworkBtn.innerHTML;
  saveArtworkBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
  saveArtworkBtn.style.backgroundColor = "#e8f5e9";

  setTimeout(() => {
    saveArtworkBtn.innerHTML = originalText;
    saveArtworkBtn.style.backgroundColor = "";
  }, 2000);
}

document.addEventListener("DOMContentLoaded", initEditor);

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = "Enter Fullscreen";
  }
});

document.getElementById("fillSimilarColorsBtn").addEventListener("click", () => {
    if (selectedElements.size === 0) {
      alert("Select an element first");
      return;
    }

    const newColor = colorPicker.value;
    const newColorNorm = cssColorToHex(newColor);
    
    const primaryElement = Array.from(selectedElements).pop();

    const selectedRaw = lastSelectedFillColor || primaryElement.getAttribute("fill") || primaryElement.style.fill || window.getComputedStyle(primaryElement).fill;
    const targetNorm = cssColorToHex(selectedRaw, primaryElement);

    if (!targetNorm) {
      alert("Could not determine the selected element's color.");
      return;
    }

    saveHistory();

    const elements = svgElement.querySelectorAll("*");

    elements.forEach((el) => {
      const elRaw =
        el.style.fill || el.getAttribute("fill") || window.getComputedStyle(el).fill;
      const elNorm = cssColorToHex(elRaw, el);

      if (elNorm === targetNorm) {
        // Preserve the original mechanism if possible
        if (el.style.fill) el.style.fill = newColor;
        if (el.getAttribute("fill")) el.setAttribute("fill", newColor);
        if (!el.style.fill && !el.getAttribute("fill")) {
          // No explicit fill defined; set both to be safe
          el.style.fill = newColor;
          el.setAttribute("fill", newColor);
        }
      }
    });

    lastSelectedFillColor = newColorNorm;
  });



  



// FIXED: Key changes summary
// 1. Fixed file upload - added proper loading indicator
// 2. Added smooth layer highlighting with CSS transitions
// 3. Enhanced selection preview with detailed info
// 4. Fixed layer-to-canvas synchronization

// ... [Previous code stays the same until setStrokeColor functions] ...

function setStrokeColor(color) {
    if (selectedElements.size === 0) return;
    saveHistory();
    selectedElements.forEach(el => {
        el.setAttribute("stroke", color);
        el.style.stroke = color;
    });
    lastSelectedStrokeColor = color;
}

function setStrokeWidth(width) {
    if (selectedElements.size === 0) return;
    saveHistory();
    selectedElements.forEach(el => {
        el.setAttribute("stroke-width", width);
        el.style.strokeWidth = `${width}px`;
        
        if (parseFloat(width) > 0) {
            const currentStroke = el.getAttribute("stroke") || el.style.stroke;
            if (!currentStroke || currentStroke === 'none') {
                 el.setAttribute("stroke", lastSelectedStrokeColor);
                 el.style.stroke = lastSelectedStrokeColor;
            }
        }
    });
    lastSelectedStrokeWidth = width;
}

function setOpacity(value) {
    if (selectedElements.size === 0) return;
    saveHistory();
    selectedElements.forEach(el => {
        el.setAttribute("opacity", value);
        el.style.opacity = value;
    });
    lastSelectedOpacity = value;
}

function moveElement(direction) {
    if (selectedElements.size === 0) return;
    const elements = Array.from(selectedElements);
    
    saveHistory();
    
    const parent = elements[0].parentNode;
    if (!parent) return;

    elements.forEach(selectedElement => {
        if (selectedElement.parentNode !== parent) return;

        if (direction === "front") {
            parent.appendChild(selectedElement);
        } else if (direction === "back") {
            parent.prepend(selectedElement); 
        } else if (direction === "forward") {
            const next = selectedElement.nextElementSibling;
            if (next) {
                parent.insertBefore(selectedElement, next.nextElementSibling);
            }
        } else if (direction === "backward") {
            const prev = selectedElement.previousElementSibling;
            if (prev) {
                parent.insertBefore(selectedElement, prev);
            }
        }
    });
}
