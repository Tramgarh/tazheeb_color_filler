import { loadSvg } from "./layering_controller.js";

let layers = [];
let draggedItem = null;
let selectedLayerElement = null;

const layersContainer = document.getElementById("layersContainer");
const totalLayersCount = document.getElementById("totalLayersCount");
const totalElementsCount = document.getElementById("totalElementsCount");
const exportLayersBtn = document.getElementById("exportLayersBtn");
const analyzeLayersBtn = document.getElementById("analyzeLayersBtn");

export function initLayeringSystem() {
  localStorage.removeItem("svg_layers");
  layers = [];
  renderLayers();
  updateStats();

  if (exportLayersBtn) {
    exportLayersBtn.addEventListener("click", exportLayersJSON);
  }

  if (analyzeLayersBtn) {
    analyzeLayersBtn.addEventListener("click", analyzeSVGLayers);
  }

  initLayerDragAndDrop();
  initLayerContextMenu();
  
  // Listen for selection changes from canvas
  document.addEventListener('selection-changed', (e) => {
    highlightLayersForElements(e.detail.elementIds);
  });
}

// Highlight layers when elements are selected on canvas
function highlightLayersForElements(elementIds) {
  // Clear all highlights
  document.querySelectorAll('.layer-item').forEach(l => {
    l.classList.remove('selected-layer');
  });
  
  if (!elementIds || elementIds.length === 0) return;
  
  // Find and highlight matching layers
  layers.forEach(layer => {
    const hasSelectedElement = layer.elements.some(el => 
      elementIds.includes(el.elementId)
    );
    
    if (hasSelectedElement) {
      const layerElement = document.getElementById(`layer-${layer.id}`);
      if (layerElement) {
        layerElement.classList.add('selected-layer');
        // Smooth scroll into view
        layerElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest' 
        });
      }
    }
  });
}

export function analyzeAndCreateLayersFromSVG(svgNode, svgText) {
  let targetSvg = svgNode;
  console.log(svgNode);
  
  if (!targetSvg) {
     targetSvg = document.querySelector("#svgContainer svg");
  }

  if (!targetSvg) {
    console.warn("No SVG element found to analyze");
    return;
  }

  if (layersContainer) {
      layersContainer.innerHTML = `
            <div class="analyzing-indicator">
                <div class="spinner"></div>
                <span>Analyzing SVG structure...</span>
            </div>
        `;
  }

    layers = loadSvg(svgText);
    

    renderLayers();
    updateStats();
    
    try {
        localStorage.setItem("svg_layers", JSON.stringify(layers));
    } catch(e) {}
}

function analyzeSVGLayers() {
    const svgEl = document.querySelector("#svgContainer svg");
    analyzeAndCreateLayersFromSVG(svgEl);
}

function renderLayers() {
  if (layers.length === 0) {
    layersContainer.innerHTML = `
            <div class="layers-empty-state">
                <i class="fas fa-layer-group"></i>
                <p>No layers created yet</p>
                <p class="subtext">Click "Analyze Layers" or upload an SVG</p>
            </div>
        `;
    return;
  }

  const sortedLayers = [...layers].sort((a, b) => b.order - a.order);

  layersContainer.innerHTML = sortedLayers
    .map((layer) => createLayerHTML(layer))
    .join("");

  sortedLayers.forEach((layer) => {
    const layerElement = document.getElementById(`layer-${layer.id}`);
    if (layerElement) {
      const expandBtn = layerElement.querySelector(".layer-expand-btn");
      if (expandBtn) {
        expandBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleLayerExpansion(layer.id);
        });
      }

      const visibilityBtn = layerElement.querySelector('.layer-action-btn[data-action="visibility"]');
      if (visibilityBtn) {
        visibilityBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleLayerVisibility(layer.id);
        });
      }

      const lockBtn = layerElement.querySelector('.layer-action-btn[data-action="lock"]');
      if (lockBtn) {
        lockBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleLayerLock(layer.id);
        });
      }

      const layerHeader = layerElement.querySelector(".layer-header");
      if (layerHeader) {
        layerHeader.addEventListener('click', (e) => {
            if (!e.target.closest('.layer-expand-btn') && 
                !e.target.closest('.layer-action-btn') &&
                !e.target.closest('.layer-drag-handle')) {
                    
                const elementIds = layer.elements.map(el => el.elementId);
                
                document.dispatchEvent(new CustomEvent('request-selection', {
                    detail: { 
                        elementIds: elementIds,
                        type: e.shiftKey ? 'add' : 'replace'
                    }
                }));
                
                document.querySelectorAll('.layer-item').forEach(l => l.classList.remove('selected-layer'));
                layerElement.classList.add('selected-layer');
            }
        });

        layerHeader.addEventListener("dragstart", (e) => handleLayerDragStart(e, layer));
        layerHeader.addEventListener("dragover", (e) => handleLayerDragOver(e, layer.id));
        layerHeader.addEventListener("dragleave", (e) => handleLayerDragLeave(e, layer.id));
        layerHeader.addEventListener("drop", (e) => handleLayerDrop(e, layer));
        layerHeader.addEventListener("contextmenu", (e) => showLayerContextMenu(e, layer));
      }

      layer.elements.forEach((element) => {
        const elementEl = document.getElementById(`element-${element.id}`);
        if (elementEl) {
          elementEl.addEventListener("click", (e) => {
            e.stopPropagation();
            selectLayerElement(element, layer);
          });

          elementEl.addEventListener("dragstart", (e) => handleElementDragStart(e, element, layer.id));
          elementEl.addEventListener("dragover", (e) => handleElementDragOver(e, element.id));
          elementEl.addEventListener("dragleave", (e) => handleElementDragLeave(e, element.id));
          elementEl.addEventListener("drop", (e) => handleElementDrop(e, element, layer.id));
          elementEl.addEventListener("contextmenu", (e) => showElementContextMenu(e, element, layer));

          const deleteBtn = elementEl.querySelector(".element-action-btn.delete");
          if (deleteBtn) {
            deleteBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              deleteLayerElement(layer.id, element.id);
            });
          }
        }
      });
    }
  });
}

function createLayerHTML(layer) {
  console.log(layer);
  
  return `
        <div class="layer-item" id="layer-${layer.id}" style="transition: all 0.3s ease;">
            <div class="layer-header" draggable="true" background-color: ${layer.name};>
                <div class="layer-drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                
                <button class="layer-expand-btn">
                    <i class="fas fa-chevron-${layer.expanded ? "down" : "right"}"></i>
                </button>
                
                <div class="layer-color-indicator" style="background-color: ${layer.name}; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px;"></div>
                
                <div class="layer-info">
                    <div class="layer-name">${layer.name}</div>
                    <div class="layer-subtitle">
                        ${layer.elementType} • ${layer.elements.length} elements
                    </div>
                </div>
                
                <div class="layer-actions">
                    <button class="layer-action-btn ${layer.visible ? "" : "hidden"}" 
                            data-action="visibility"
                            title="${layer.visible ? "Hide layer" : "Show layer"}">
                        <i class="fas fa-eye${layer.visible ? "" : "-slash"}"></i>
                    </button>
                    
                    <button class="layer-action-btn ${layer.locked ? "locked" : ""}" 
                            data-action="lock"
                            title="${layer.locked ? "Unlock layer" : "Lock layer"}">
                        <i class="fas fa-${layer.locked ? "lock" : "unlock"}"></i>
                    </button>
                </div>
            </div>
            
            <div class="layer-elements ${layer.expanded ? "expanded" : ""}" style="transition: max-height 0.3s ease;">
                ${layer.elements.map((element) => createElementHTML(element, layer)).join("")}
            </div>
        </div>
    `;
}

function createElementHTML(element, layer) {
  const isSelected = selectedLayerElement?.id === element.id;

  return `
        <div class="element-item ${isSelected ? "selected" : ""} ${layer.locked ? "locked" : ""}" 
             id="element-${element.id}"
             draggable="${!layer.locked}"
             style="transition: all 0.2s ease;">
            <div class="element-drag-handle">
                <i class="fas fa-grip-vertical"></i>
            </div>
            
            <div class="element-color" style="background-color: ${element.fill}"></div>
            
            <div class="element-info">
                <div class="element-name">${element.elementType}</div>
                <div class="element-details">
                    <span>ID: ${element.elementId}</span>
                </div>
            </div>
            
            <div class="element-actions">
                <button class="element-action-btn delete" title="Delete element">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function toggleLayerExpansion(layerId) {
  const layer = layers.find((l) => l.id === layerId);
  if (layer) {
    layer.expanded = !layer.expanded;
    renderLayers();
    saveLayers();
  }
}

function toggleLayerVisibility(layerId) {
  const layer = layers.find((l) => l.id === layerId);
  if (layer) {
    layer.visible = !layer.visible;
    renderLayers();
    saveLayers();

    const svgElement = document.querySelector("#svgContainer svg");
    if (svgElement) {
      layer.elements.forEach((element) => {
        const svgEl = svgElement.querySelector(`[data-element-id="${element.elementId}"]`);
        if (svgEl) {
          svgEl.style.display = layer.visible ? "" : "none";
        }
      });
    }
  }
}

function toggleLayerLock(layerId) {
  const layer = layers.find((l) => l.id === layerId);
  if (layer) {
    layer.locked = !layer.locked;
    renderLayers();
    saveLayers();
  }
}

function selectLayerElement(element, layer) {
  selectedLayerElement = element;
  
  // Dispatch selection request to canvas
  document.dispatchEvent(new CustomEvent('request-selection', {
    detail: { 
      elementIds: [element.elementId],
      type: 'replace'
    }
  }));
  
  renderLayers();
}

function deleteLayerElement(layerId, elementId) {
  const layer = layers.find((l) => l.id === layerId);
  if (layer) {
    layer.elements = layer.elements.filter((el) => el.id !== elementId);
    renderLayers();
    updateStats();
    saveLayers();

    if (selectedLayerElement?.id === elementId) {
      selectedLayerElement = null;
    }
  }
}

function updateStats() {
  const totalElements = layers.reduce((sum, layer) => sum + layer.elements.length, 0);
  totalLayersCount.textContent = layers.length;
  totalElementsCount.textContent = totalElements;
}

function saveLayers() {
  localStorage.setItem("svg_layers", JSON.stringify(layers));
}

function exportLayersJSON() {
  if (layers.length === 0) {
    alert("No layers to export. Please analyze the SVG first.");
    return;
  }

  const exportData = {
    timestamp: new Date().toISOString(),
    totalLayers: layers.length,
    totalElements: layers.reduce((sum, layer) => sum + layer.elements.length, 0),
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      order: layer.order,
      visible: layer.visible,
      locked: layer.locked,
      color: layer.color,
      elementCount: layer.elements.length,
      elements: layer.elements.map((el) => ({
        id: el.id,
        elementId: el.elementId,
        fill: el.fill,
        elementType: el.elementType,
      })),
    })),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `svg-layers-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initLayerDragAndDrop() {
  const dragOverlay = document.createElement("div");
  dragOverlay.className = "drag-overlay";
  document.body.appendChild(dragOverlay);

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragOverlay.classList.remove("active");
  });
}

function handleLayerDragStart(e, layer) {
  draggedItem = { type: "layer", data: layer };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", layer.id);
  e.currentTarget.classList.add("dragging");
}

function handleLayerDragOver(e, layerId) {
  e.preventDefault();
  if (draggedItem?.type === "layer" && draggedItem.data.id !== layerId) {
    const layerElement = document.getElementById(`layer-${layerId}`);
    if (layerElement && !layerElement.classList.contains("drag-over")) {
      document.querySelectorAll(".layer-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
      layerElement.classList.add("drag-over");
    }
  }
}

function handleLayerDragLeave(e, layerId) {
  const layerElement = document.getElementById(`layer-${layerId}`);
  if (layerElement && e.relatedTarget && !layerElement.contains(e.relatedTarget)) {
    layerElement.classList.remove("drag-over");
  }
}

function handleLayerDrop(e, targetLayer) {
  e.preventDefault();

  document.querySelectorAll(".layer-item.drag-over").forEach((el) => el.classList.remove("drag-over"));

  if (draggedItem?.type === "layer") {
    const draggedIndex = layers.findIndex((l) => l.id === draggedItem.data.id);
    const targetIndex = layers.findIndex((l) => l.id === targetLayer.id);

    if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
      const [draggedLayer] = layers.splice(draggedIndex, 1);
      layers.splice(targetIndex, 0, draggedLayer);

      layers.forEach((layer, index) => {
        layer.order = layers.length - index;
      });

      renderLayers();
      updateStats();
      saveLayers();
    }
  }

  document.querySelectorAll(".dragging").forEach((el) => {
    el.classList.remove("dragging");
  });
  draggedItem = null;
}

function handleElementDragStart(e, element, sourceLayerId) {
  e.stopPropagation();
  draggedItem = { type: "element", data: element, sourceLayerId };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", element.id);
  e.currentTarget.classList.add("dragging");
}

function handleElementDragOver(e, elementId) {
  e.preventDefault();
  e.stopPropagation();

  if (draggedItem?.type === "element" && draggedItem.data.id !== elementId) {
    const elementEl = document.getElementById(`element-${elementId}`);
    if (elementEl) {
      elementEl.style.borderTop = "2px solid #4361ee";
    }
  }
}

function handleElementDragLeave(e, elementId) {
  e.preventDefault();
  e.stopPropagation();
  const elementEl = document.getElementById(`element-${elementId}`);
  if (elementEl) {
    elementEl.style.borderTop = "";
  }
}

function handleElementDrop(e, targetElement, targetLayerId) {
  e.preventDefault();
  e.stopPropagation();

  document.querySelectorAll(".element-item").forEach((el) => (el.style.borderTop = ""));

  if (draggedItem?.type === "element" && draggedItem.data.id !== targetElement.id) {
    const sourceLayer = layers.find((l) => l.id === draggedItem.sourceLayerId);
    const targetLayer = layers.find((l) => l.id === targetLayerId);

    if (sourceLayer && targetLayer) {
      if (sourceLayer.id === targetLayer.id) {
        const elementIndex = sourceLayer.elements.findIndex((el) => el.id === draggedItem.data.id);
        const targetIndex = sourceLayer.elements.findIndex((el) => el.id === targetElement.id);

        if (elementIndex !== -1 && targetIndex !== -1) {
          const [element] = sourceLayer.elements.splice(elementIndex, 1);
          sourceLayer.elements.splice(targetIndex, 0, element);
        }
      } else {
        const elementIndex = sourceLayer.elements.findIndex((el) => el.id === draggedItem.data.id);
        if (elementIndex !== -1) {
          const [element] = sourceLayer.elements.splice(elementIndex, 1);
          const targetIndex = targetLayer.elements.findIndex((el) => el.id === targetElement.id);

          if (targetIndex !== -1) {
            targetLayer.elements.splice(targetIndex, 0, element);
          } else {
            targetLayer.elements.push(element);
          }
        }
      }

      renderLayers();
      updateStats();
      saveLayers();
    }
  }

  draggedItem = null;
  document.querySelectorAll(".dragging").forEach((el) => {
    el.classList.remove("dragging");
  });
}

function initLayerContextMenu() {
  const contextMenu = document.createElement("div");
  contextMenu.className = "layer-context-menu";
  contextMenu.innerHTML = `
        <div class="context-menu-item" data-action="rename">
            <i class="fas fa-edit"></i> Rename Layer
        </div>
        <div class="context-menu-item" data-action="duplicate">
            <i class="fas fa-copy"></i> Duplicate Layer
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item delete" data-action="delete">
            <i class="fas fa-trash"></i> Delete Layer
        </div>
    `;
  document.body.appendChild(contextMenu);

  document.addEventListener("click", () => {
    contextMenu.style.display = "none";
  });
}

function showLayerContextMenu(e, layer) {
  e.preventDefault();

  const contextMenu = document.querySelector(".layer-context-menu");
  contextMenu.style.left = `${e.pageX}px`;
  contextMenu.style.top = `${e.pageY}px`;
  contextMenu.style.display = "block";
  contextMenu.dataset.layerId = layer.id;
}

function showElementContextMenu(e, element, layer) {
  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener("DOMContentLoaded", () => {
  initLayeringSystem();
});
