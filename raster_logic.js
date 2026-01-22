// ────────────────────────────────────────────────
// Tab switching
// ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
  });
});

// ────────────────────────────────────────────────
// RASTER COLORING LOGIC + ZOOM
// ────────────────────────────────────────────────
let originalImage = null;
let mainCanvas = document.getElementById('mainCanvas');
let ctx = mainCanvas.getContext('2d');
let historyRaster = [];
let historyIndexRaster = -1;
let lastClickedPixelColor = null;

const rasterInput = document.getElementById('rasterInput');
const originalPreview = document.getElementById('originalPreview');
const restoreOriginalBtn = document.getElementById('restoreOriginal');
const previewModal = document.getElementById('previewModal');
const previewModalImage = document.getElementById('previewModalImage');
const closePreviewModal = document.getElementById('closePreviewModal');

let rasterZoom = 1;
let rasterPanX = 0;
let rasterPanY = 0;
let isRasterPanning = false;
let rasterPanStartX = 0;
let rasterPanStartY = 0;

rasterInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      mainCanvas.width = img.width;
      mainCanvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      originalImage = img;
      // show original preview
      if (originalPreview) {
        originalPreview.src = ev.target.result;
        previewModalImage.src = ev.target.result;
      }

      historyRaster = [ctx.getImageData(0,0,mainCanvas.width,mainCanvas.height)];
      historyIndexRaster = 0;
      rasterZoom = 1;
      rasterPanX = 0;
      rasterPanY = 0;
      updateRasterZoom();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// Preview thumbnail modal functionality
if (originalPreview) {
  originalPreview.addEventListener('click', (e) => {
    if (previewModalImage.src) {
      previewModal.style.display = 'flex';
    }
  });
}

if (closePreviewModal) {
  closePreviewModal.addEventListener('click', () => {
    previewModal.style.display = 'none';
  });
}

// Close modal when clicking outside the content
if (previewModal) {
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.style.display = 'none';
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.style.display !== 'none') {
      previewModal.style.display = 'none';
    }
  });
}

// Click to fill + remember color for similar fill
mainCanvas.addEventListener('click', e => {
  if (!originalImage) return;

  // Don't fill if shift key is held (used for panning)
  if (e.shiftKey) return;

  const wrapperMain = document.getElementById('rasterMainWrapper');
  const wrapperRect = wrapperMain.getBoundingClientRect();
  
  // Get position relative to the transformed wrapper
  // The wrapper's rect already accounts for pan via the visual transform
  let screenX = e.clientX - wrapperRect.left;
  let screenY = e.clientY - wrapperRect.top;
  
  // Only undo the zoom, pan is already accounted for in wrapperRect
  let x = screenX / rasterZoom;
  let y = screenY / rasterZoom;

  x = Math.floor(x);
  y = Math.floor(y);

  if (x < 0 || y < 0 || x >= mainCanvas.width || y >= mainCanvas.height) return;

  // Remember clicked color (used by Fill Similar)
  const pixelData = ctx.getImageData(x, y, 1, 1).data;
  lastClickedPixelColor = { r: pixelData[0], g: pixelData[1], b: pixelData[2] };

  const fillColor = hexToRgb(document.getElementById('fillColorRaster').value);
  const tolerance = parseInt(document.getElementById('toleranceRaster').value);
  const connectivity = parseInt(document.getElementById('connectivityRaster').value);

  floodFill(x, y, fillColor, tolerance, connectivity);
});

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}

function colorsSimilar(c1, c2, tol) {
  return Math.abs(c1.r - c2.r) <= tol &&
         Math.abs(c1.g - c2.g) <= tol &&
         Math.abs(c1.b - c2.b) <= tol;
}

function floodFill(startX, startY, fillColor, tolerance, connectivity = 4) {
  if (startX < 0 || startY < 0 || startX >= mainCanvas.width || startY >= mainCanvas.height) return;
  const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
  const data = imageData.data;
  const w = mainCanvas.width;
  const h = mainCanvas.height;

  const targetIdx = (startY * w + startX) * 4;
  const target = { r: data[targetIdx], g: data[targetIdx+1], b: data[targetIdx+2] };

  if (colorsSimilar(target, fillColor, 5)) return;

  const stack = [[startX, startY]];

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = (y * w + x) * 4;

    const current = {r:data[idx], g:data[idx+1], b:data[idx+2]};

    if (!colorsSimilar(current, target, tolerance)) continue;

    data[idx]   = fillColor.r;
    data[idx+1] = fillColor.g;
    data[idx+2] = fillColor.b;

    // 4-neighbors
    stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);

    if (connectivity === 8) {
      stack.push([x+1, y+1], [x-1, y+1], [x+1, y-1], [x-1, y-1]);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  historyRaster = historyRaster.slice(0, historyIndexRaster + 1);
  historyRaster.push(ctx.getImageData(0,0,w,h));
  historyIndexRaster++;
}

// Fill Similar Colors (raster - global)
document.getElementById('fillSimilarRaster').onclick = () => {
  if (!lastClickedPixelColor) {
    alert("Click the image first to select a reference color.");
    return;
  }

  const fillColor = hexToRgb(document.getElementById('fillColorRaster').value);
  const tolerance = parseInt(document.getElementById('toleranceRaster').value);

  const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i], g: data[i+1], b: data[i+2] };
    if (colorsSimilar(pixel, lastClickedPixelColor, tolerance)) {
      data[i]   = fillColor.r;
      data[i+1] = fillColor.g;
      data[i+2] = fillColor.b;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  historyRaster = historyRaster.slice(0, historyIndexRaster + 1);
  historyRaster.push(ctx.getImageData(0,0,mainCanvas.width,mainCanvas.height));
  historyIndexRaster++;
};

// Undo / Redo / Reset / Save (raster)
document.getElementById('undoRaster').onclick = () => {
  if (historyIndexRaster > 0) {
    historyIndexRaster--;
    ctx.putImageData(historyRaster[historyIndexRaster], 0, 0);
  }
};

document.getElementById('redoRaster').onclick = () => {
  if (historyIndexRaster < historyRaster.length - 1) {
    historyIndexRaster++;
    ctx.putImageData(historyRaster[historyIndexRaster], 0, 0);
  }
};

document.getElementById('resetRaster').onclick = () => {
  if (originalImage) {
    ctx.drawImage(originalImage, 0, 0);
    historyRaster = [ctx.getImageData(0,0,mainCanvas.width,mainCanvas.height)];
    historyIndexRaster = 0;
    rasterZoom = 1;
    rasterPanX = 0;
    rasterPanY = 0;
    document.getElementById('zoomSliderRaster').value = 100;
    updateRasterZoom();
  }
};

// Restore original from preview button
if (restoreOriginalBtn) {
  restoreOriginalBtn.onclick = () => {
    if (originalImage) {
      ctx.drawImage(originalImage, 0, 0);
      historyRaster = [ctx.getImageData(0,0,mainCanvas.width,mainCanvas.height)];
      historyIndexRaster = 0;
      rasterZoom = 1;
      rasterPanX = 0;
      rasterPanY = 0;
      document.getElementById('zoomSliderRaster').value = 100;
      updateRasterZoom();
    }
  };
}

document.getElementById('saveRaster').onclick = () => {
  const link = document.createElement('a');
  link.download = 'edited_raster.png';
  link.href = mainCanvas.toDataURL('image/png');
  link.click();
};

// Enhanced Zoom and Pan for Raster
function updateRasterZoom() {
  const wrapperMain = document.getElementById('rasterMainWrapper');
  wrapperMain.style.transform = `translate(${rasterPanX}px, ${rasterPanY}px) scale(${rasterZoom})`;
  wrapperMain.style.transformOrigin = 'top left';
  wrapperMain.style.transition = 'transform 0.1s ease-out';
  document.getElementById('zoomValueRaster').textContent = `${Math.round(rasterZoom * 100)}%`;
}

document.getElementById('zoomSliderRaster').oninput = e => {
  rasterZoom = Math.max(0.25, Math.min(5, e.target.value / 100));
  updateRasterZoom();
};

document.getElementById('zoomInRaster').onclick = () => {
  rasterZoom = Math.min(5, rasterZoom + 0.15);
  document.getElementById('zoomSliderRaster').value = rasterZoom * 100;
  updateRasterZoom();
};

document.getElementById('zoomOutRaster').onclick = () => {
  rasterZoom = Math.max(0.25, rasterZoom - 0.15);
  document.getElementById('zoomSliderRaster').value = rasterZoom * 100;
  updateRasterZoom();
};

// Mouse wheel zoom for raster
const rasterContainer = document.querySelector('.canvas-body-inner')?.parentElement || mainCanvas.parentElement;
if (rasterContainer) {
  rasterContainer.addEventListener('wheel', (e) => {
    if (!mainCanvas || mainCanvas.width === 0) return;
    e.preventDefault();
    
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -1 : 1;
    const newZoom = Math.max(0.25, Math.min(5, rasterZoom + delta * zoomSpeed));
    
    if (newZoom !== rasterZoom) {
      rasterZoom = newZoom;
      document.getElementById('zoomSliderRaster').value = rasterZoom * 100;
      updateRasterZoom();
    }
  }, { passive: false });
}

// Pan functionality for raster (middle mouse button or space+drag)
if (rasterContainer) {
  rasterContainer.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle mouse or Shift+Left click
      e.preventDefault();
      isRasterPanning = true;
      rasterPanStartX = e.clientX - rasterPanX;
      rasterPanStartY = e.clientY - rasterPanY;
      rasterContainer.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isRasterPanning && mainCanvas && mainCanvas.width > 0) {
      rasterPanX = e.clientX - rasterPanStartX;
      rasterPanY = e.clientY - rasterPanStartY;
      updateRasterZoom();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isRasterPanning) {
      isRasterPanning = false;
      if (rasterContainer) rasterContainer.style.cursor = 'default';
    }
  });
}

// Keyboard shortcuts for raster zoom
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    rasterZoom = Math.min(5, rasterZoom + 0.15);
    document.getElementById('zoomSliderRaster').value = rasterZoom * 100;
    updateRasterZoom();
  } else if (e.key === '-') {
    e.preventDefault();
    rasterZoom = Math.max(0.25, rasterZoom - 0.15);
    document.getElementById('zoomSliderRaster').value = rasterZoom * 100;
    updateRasterZoom();
  } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    rasterZoom = 1;
    rasterPanX = 0;
    rasterPanY = 0;
    document.getElementById('zoomSliderRaster').value = 100;
    updateRasterZoom();
  }
});

// Tolerance display
document.getElementById('toleranceRaster').oninput = e => {
  document.getElementById('tolValueRaster').textContent = e.target.value;
};

// Note: SVG-specific handlers (undo/redo/reset/save/fill-similar) are implemented in `svg_logic.js`.
// Keeping raster logic file focused on raster canvas operations avoids duplicate event handlers and runtime errors.


// (Removed) redoSVG handler — handled in svg_logic.js

// (Removed) resetSVG handler — handled in svg_logic.js

// (Removed) saveSVG handler — handled in svg_logic.js

// (Removed) updateSvgZoom — handled in svg_logic.js

// (Removed) SVG zoom handlers — implemented in svg_logic.js
