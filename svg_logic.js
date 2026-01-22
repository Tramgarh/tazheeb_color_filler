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

// State variables
let svgElement = null;
let selectedElement = null;
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

// Helper: normalize CSS color into hex or rgba string for reliable comparisons
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
  // hex already
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
  // rgb/rgba
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
  // named colors or other css values: ask browser to compute
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
];

// Initialize the editor
function initEditor() {
  // Load the SVG
  fetch("js_art.svg")
    .then((res) => {
      if (!res.ok) throw new Error("SVG file not found");
      return res.text();
    })
    .then((svgText) => {
      svgContainer.innerHTML = svgText;
      svgElement = svgContainer.querySelector("svg");

      if (!svgElement) {
        throw new Error("No SVG element found in the file");
      }

      // Initialize SVG for editing
      initSvg();
      // Hide loading indicator
      loadingIndicator.style.display = "none";
    })
    .catch((error) => {
      console.error("Error loading SVG:", error);
      loadingIndicator.style.display = "none";
      svgContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
              <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px; color: #ff6b6b;"></i>
              <h3>SVG File Not Found</h3>
              <p>Place an "js_art.svg" file in the same directory as this HTML file.</p>
              <p>For now, here's a sample artwork:</p>
            </div>
          `;

      // Create a sample SVG if the file doesn't exist
      createSampleArtwork();
    });

  // Initialize color presets
  initColorPresets();

  // Initialize event listeners
  initEventListeners();
}

// Load SVG content from a string and replace the current canvas
function loadSvgFromText(svgText) {
  try {
    // Reset selection and state
    selectedElement = null;
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
  } catch (err) {
    console.error("Failed to load SVG:", err);
    svgContainer.innerHTML = `
      <div style="text-align:center; padding:30px; color:#666;">
        <h3>Invalid SVG file</h3>
        <p>Please choose a valid SVG file.</p>
      </div>
    `;
  }
}

function handleFile(file) {
  if (!file) return;

  // Basic type check - accept .svg files
  if (!(file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"))) {
    alert("Please select a valid SVG file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    loadSvgFromText(e.target.result);
  };
  reader.onerror = (e) => {
    console.error("Error reading file:", e);
    alert("Could not read the selected file.");
  };
  reader.readAsText(file);
}

// Create sample artwork if SVG file is missing
function createSampleArtwork() {
  const sampleSvg = `
        <svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
          <rect x="50" y="50" width="400" height="400" fill="#f8f9fa" stroke="#4361ee" stroke-width="2"/>
          <circle cx="250" cy="250" r="80" fill="#4cc9f0" stroke="#3a0ca3" stroke-width="2"/>
          <polygon points="250,100 350,250 250,400 150,250" fill="#f72585" stroke="#7209b7" stroke-width="2"/>
          <rect x="100" y="100" width="80" height="80" fill="#06d6a0" stroke="#118ab2" stroke-width="2"/>
          <rect x="320" y="100" width="80" height="80" fill="#ffd166" stroke="#ff9e00" stroke-width="2"/>
          <rect x="100" y="320" width="80" height="80" fill="#9d4edd" stroke="#560bad" stroke-width="2"/>
          <rect x="320" y="320" width="80" height="80" fill="#ef476f" stroke="#b5179e" stroke-width="2"/>
          <text x="250" y="280" text-anchor="middle" font-family="Arial" font-size="24" fill="#3a0ca3">Edit Me!</text>
        </svg>
      `;

  svgContainer.innerHTML = sampleSvg;
  svgElement = svgContainer.querySelector("svg");
  initSvg();
}

// Initialize the SVG for editing
function initSvg() {
  // Make all elements selectable and store original colors
  const elements = svgElement.querySelectorAll(
    "path, rect, circle, ellipse, polygon, line, text"
  );
  const elementIds = {};

  // Add unique IDs to elements for tracking
  elements.forEach((el, index) => {
    // Store original color
    const originalColor = el.getAttribute("fill") || "#000000";
    originalColors.set(el, originalColor);

    // Generate unique ID for element
    let elementId;
    let tagName = el.tagName.toLowerCase();
    let counter = 1;

    do {
      elementId = `${tagName}-${counter}`;
      counter++;
    } while (elementIds[elementId]);

    elementIds[elementId] = true;
    el.dataset.elementId = elementId;

    // Add hover and click event listeners
    el.addEventListener("mouseenter", handleElementHover);
    el.addEventListener("mouseleave", handleElementLeave);
    el.addEventListener("click", handleElementClick);
  });

  // Center the SVG
  centerSvg();

  // Take initial snapshot for undo/redo
  saveHistory();
}

// Handle element hover
function handleElementHover(e) {
  // Clear any pending timeout
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  // Don't fill if shift key is held (used for panning)
  if (e.shiftKey) return;

  const element = e.target;

  // If this element is already selected or hovered, do nothing
  if (element === selectedElement || element === hoveredElement) return;

  // Remove hover effect from previous element
  if (hoveredElement && hoveredElement !== selectedElement) {
    hoveredElement.classList.remove("hover-element");
  }

  // Apply hover effect to this element
  element.classList.add("hover-element");
  hoveredElement = element;
}

// Handle element mouse leave
function handleElementLeave(e) {
  const element = e.target;

  // Use timeout to prevent flickering when moving between elements
  hoverTimeout = setTimeout(() => {
    // Only remove hover effect if this is not the selected element
    if (element !== selectedElement) {
      element.classList.remove("hover-element");
    }

    // Clear hovered element reference
    if (element === hoveredElement) {
      hoveredElement = null;
    }
  }, 100);
}

// Handle element click
function handleElementClick(e) {
  e.stopPropagation();
  const element = e.target;
  selectElement(element);
}

// Select an element
function selectElement(element) {
  // Remove previous selection
  if (selectedElement) {
    selectedElement.classList.remove("selected-element");
    selectedElement.classList.remove("hover-element");
  }

  // Apply new selection (subtle only in main canvas)
  selectedElement = element;
  element.classList.add("selected-element");
  element.classList.remove("hover-element");

  // Update the selection preview box
  updateSelectionPreview(element);

  // Update color picker to match element's color (normalize across attribute/style/computed)
  const fillColor = element.getAttribute("fill") || element.style.fill || window.getComputedStyle(element).fill || "#000000";
  const normalizedFill = cssColorToHex(fillColor, element) || fillColor;
  lastSelectedFillColor = normalizedFill;

  // color input requires hex; ensure picker has hex when possible
  colorPicker.value = normalizedFill.startsWith("#") ? normalizedFill : "#000000";
  customColorValue.value = normalizedFill;

  // Update active color preset
  document.querySelectorAll(".color-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.color === normalizedFill);
  });
}

// Update the selection preview box
function updateSelectionPreview(element) {
  selectionPreview.classList.remove("empty");

  const bbox = element.getBBox(); // REAL size of element

  const previewSvg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  // Fit exactly to element size
  previewSvg.setAttribute(
    "viewBox",
    `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`
  );

  previewSvg.setAttribute("width", "100%");
  previewSvg.setAttribute("height", "100%");
  previewSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  previewSvg.id = "previewSvg";

  // Clone selected element
  const clone = element.cloneNode(true);
  clone.classList.remove("selected-element", "hover-element");

  previewSvg.appendChild(clone);

  const fillColor = element.getAttribute("fill") || element.style.fill || window.getComputedStyle(element).fill || 'none';
  const normalizedFill = cssColorToHex(fillColor, element) || fillColor;
  const strokeFill = element.getAttribute("stroke") || element.style.stroke || window.getComputedStyle(element).stroke || 'none';
  const normalizedStroke = cssColorToHex(strokeFill, element) || strokeFill;

  selectionPreview.innerHTML = `
    <div id="previewHeader">
      <span>Selected Element Preview</span>
      <span style="font-size:0.8rem; opacity:0.9">${element.tagName}</span>
    </div>

    <div id="previewContent" style="
      width:100%;
      height:200px;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
    ">
      ${previewSvg.outerHTML}

      <div class="preview-info">
        <div class="preview-info-row">
          <span class="preview-label">Fill:</span>
          <span class="preview-value" style="color:${normalizedFill}">
            ${normalizedFill}
          </span>
        </div>
        <div class="preview-info-row">
          <span class="preview-label">Stroke:</span>
          <span class="preview-value" style="color:${normalizedStroke}">${normalizedStroke}</span>
        </div>
      </div>
    </div>
  `;
}

// Deselect current element
function deselectElement() {
  if (selectedElement) {
    selectedElement.classList.remove("selected-element");
    selectedElement = null;
  }

  // Reset preview box to empty state
  selectionPreview.classList.add("empty");
  selectionPreview.innerHTML = `
        <div id="previewContent">
          <i class="fas fa-mouse-pointer"></i>
          <p>Click on any element to select it</p>
        </div>
      `;
}

// Initialize color presets
function initColorPresets() {
  colorPresets.forEach((color) => {
    const colorOption = document.createElement("div");
    colorOption.className = "color-option";
    colorOption.style.backgroundColor = color;
    colorOption.dataset.color = color;

    colorOption.addEventListener("click", () => {
      setColor(color);
      // Update color picker to match
      colorPicker.value = color;
      customColorValue.value = color;
    });

    colorPresetsContainer.appendChild(colorOption);
  });
}

// Initialize event listeners
function initEventListeners() {
  // Color picker events
  colorPicker.addEventListener("input", (e) => {
    const color = e.target.value;
    customColorValue.value = color;
    setColor(color);
  });

  customColorValue.addEventListener("change", (e) => {
    const color = e.target.value;
    // Validate hex color
    if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) {
      colorPicker.value = color;
      setColor(color);
    } else {
      alert("Please enter a valid hex color (e.g., #FF0000)");
      customColorValue.value = colorPicker.value;
    }
  });

  // Zoom controls
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

  // View controls
  centerViewBtn.addEventListener("click", centerSvg);
  resetViewBtn.addEventListener("click", resetView);
  fullscreenBtn.addEventListener("click", toggleFullscreen);

  // Mouse wheel zoom for SVG
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

  // Pan functionality for SVG (middle mouse button or shift+drag)
  svgContainer.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle mouse or Shift+Left click
      if (selectedElement) {
        deselectElement();
      }
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

  // Keyboard shortcuts for SVG zoom
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const newZoom = Math.min(5, currentZoom + 0.15);
      currentZoom = newZoom;
      zoomSlider.value = Math.round(currentZoom * 100);
      updateZoom();
    } else if (e.key === '-') {
      e.preventDefault();
      const newZoom = Math.max(0.1, currentZoom - 0.15);
      currentZoom = newZoom;
      zoomSlider.value = Math.round(currentZoom * 100);
      updateZoom();
    } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      resetView();
    }
  });

  // Action buttons
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  resetColorsBtn.addEventListener("click", resetAllColors);
  saveArtworkBtn.addEventListener("click", saveSVG);

  // File open button / input
  if (openFileBtn && fileInput) {
    openFileBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
      // reset value so selecting same file again will still trigger change
      fileInput.value = "";
    });
  }

  // Drag & drop support on the svg container
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

  // Click on canvas to deselect
  svgContainer.addEventListener("click", (e) => {
    // Only deselect if clicking directly on the container (not an SVG element)
    if (e.target === svgContainer || e.target === svgElement) {
      deselectElement();
    }
  });
}

// Set color for selected element
function setColor(color) {
  if (!selectedElement) {
    alert("Please select an element first by clicking on it.");
    return;
  }

  // Save current state to history before changing
  saveHistory();

  // Apply color to the element in main canvas
  console.log(selectedElement.style.fill)
  selectedElement.style.fill = color;
  selectedElement.setAttribute("fill", color);

  // //get all elems similar to the selected color and change their color too
  // const elements = svgElement.querySelectorAll();
  // const selectedElementColor =
  //   selectedElement.getAttribute("fill") || "#000000";
  //   elements.forEach((el) => {
  //     const elColor = el.getAttribute("fill") || "#000000";
  //     if (elColor === selectedElementColor) {
  //       el.style.fill = color;
  //       el.setAttribute("fill", color);
  //     }
  //   });

  // Also update the color in the preview
  const previewSvg = selectionPreview.querySelector("#previewSvg");
  if (previewSvg) {
    const previewElement = previewSvg.querySelector("*");
    if (previewElement) {
      previewElement.style.fill = color;
      previewElement.setAttribute("fill", color);

      // Update the color info in preview
      const colorValueSpan = selectionPreview.querySelector(
        ".preview-info-row:nth-child(3) .preview-value"
      );
      if (colorValueSpan) {
        colorValueSpan.textContent = color;
        colorValueSpan.style.color = color;
      }
    }
  }
}

// Update zoom
function updateZoom() {
  if (!svgElement) return;
  svgElement.style.transform = `translate(${svgPanX}px, ${svgPanY}px) scale(${currentZoom})`;
  svgElement.style.transformOrigin = 'center center';
  svgElement.style.transition = 'transform 0.1s ease-out';
  zoomValue.textContent = `${Math.round(currentZoom * 100)}%`;
}

// Center SVG in container
function centerSvg() {
  if (!svgElement) return;

  const container = svgContainer;
  svgPanX = 0;
  svgPanY = 0;
  currentZoom = 1;
  zoomSlider.value = 100;
  
  // Reset transforms
  svgElement.style.transform = 'translate(0, 0) scale(1)';
  svgElement.style.transformOrigin = 'center center';
  svgElement.style.margin = 'auto';

  // Center the SVG
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  
  updateZoom();
}

// Reset view (zoom and position)
function resetView() {
  if (!svgElement) return;
  currentZoom = 1;
  svgPanX = 0;
  svgPanY = 0;
  zoomSlider.value = 100;
  svgElement.style.transform = 'translate(0, 0) scale(1)';
  updateZoom();
}

// Toggle fullscreen
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

// History functions for undo/redo
function saveHistory() {
  // Remove any future states if we're not at the end of history
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  // Save current SVG state
  const svgClone = svgElement.cloneNode(true);
  history.push(svgClone);
  historyIndex++;

  // Update undo/redo buttons
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

  // Replace current SVG with saved version
  svgContainer.replaceChild(savedSvg, svgElement);
  svgElement = savedSvg;

  // Reinitialize event listeners for the new SVG
  initSvg();

  // Update undo/redo buttons
  updateUndoRedoButtons();

  // Deselect element since we have a new DOM
  deselectElement();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = historyIndex <= 0;
  undoBtn.style.opacity = undoBtn.disabled ? "0.5" : "1";
  undoBtn.style.cursor = undoBtn.disabled ? "not-allowed" : "pointer";

  redoBtn.disabled = historyIndex >= history.length - 1;
  redoBtn.style.opacity = redoBtn.disabled ? "0.5" : "1";
  redoBtn.style.cursor = redoBtn.disabled ? "not-allowed" : "pointer";
}

// Reset all colors to original
function resetAllColors() {
  if (
    !confirm(
      "Are you sure you want to reset all colors to their original values?"
    )
  ) {
    return;
  }

  saveHistory();

  // Get all elements in current SVG
  const elements = svgElement.querySelectorAll(
    "path, rect, circle, ellipse, polygon, line, text"
  );

  elements.forEach((element) => {
    // Find original color for this element
    const originalElement = Array.from(originalColors.keys()).find(
      (el) => el.dataset.elementId === element.dataset.elementId
    );

    if (originalElement) {
      const originalColor = originalColors.get(originalElement);
      element.style.fill = originalColor;
      element.setAttribute("fill", originalColor);
    }
  });

  // Update selected element if there is one
  if (selectedElement) {
    const originalElement = Array.from(originalColors.keys()).find(
      (el) => el.dataset.elementId === selectedElement.dataset.elementId
    );

    if (originalElement) {
      const originalColor = originalColors.get(originalElement);
      // Update preview
      updateSelectionPreview(selectedElement);
      colorPicker.value = originalColor;
      customColorValue.value = originalColor;
    }
  }
}

// Save SVG to file
function saveSVG() {
  // Create a blob with the SVG content
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgData], { type: "image/svg+xml" });

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edited_artwork.svg";
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  // Show feedback
  const originalText = saveArtworkBtn.innerHTML;
  saveArtworkBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
  saveArtworkBtn.style.backgroundColor = "#e8f5e9";

  setTimeout(() => {
    saveArtworkBtn.innerHTML = originalText;
    saveArtworkBtn.style.backgroundColor = "";
  }, 2000);
}

// Initialize the editor when page loads
document.addEventListener("DOMContentLoaded", initEditor);

// Handle fullscreen change
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = "Enter Fullscreen";
  }
});

document
  .getElementById("fillSimilarColorsBtn")
  .addEventListener("click", () => {
    if (!selectedElement) {
      alert("Select an element first");
      return;
    }

    const newColor = colorPicker.value;
    const newColorNorm = cssColorToHex(newColor);

    // Determine target color from lastSelectedFillColor or from the selected element (style/attr/computed)
    const selectedRaw =
      lastSelectedFillColor ||
      selectedElement.getAttribute("fill") ||
      selectedElement.style.fill ||
      window.getComputedStyle(selectedElement).fill;
    const targetNorm = cssColorToHex(selectedRaw, selectedElement);

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



  



 
