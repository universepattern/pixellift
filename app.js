const fileInput = document.querySelector("#fileInput");
const downloadBtn = document.querySelector("#downloadBtn");
const deleteBtn = document.querySelector("#deleteBtn");
const clearBtn = document.querySelector("#clearBtn");
const undoBtn = document.querySelector("#undoBtn");
const brushSize = document.querySelector("#brushSize");
const brushSizeValue = document.querySelector("#brushSizeValue");
const tolerance = document.querySelector("#tolerance");
const toleranceValue = document.querySelector("#toleranceValue");
const emptyState = document.querySelector("#emptyState");
const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const MAX_CANVAS_SIDE = 1800;
let imageData = null;
let mask = null;
let tool = "brush";
let drawing = false;
let rectStart = null;
let rectPreview = null;
let undoStack = [];
let lastBrushPoint = null;

function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === nextTool);
  });
}

function syncButtons() {
  const hasImage = Boolean(imageData);
  const hasSelection = hasImage && mask.some(Boolean);
  deleteBtn.disabled = !hasSelection;
  clearBtn.disabled = !hasSelection;
  downloadBtn.disabled = !hasImage;
  undoBtn.disabled = undoStack.length === 0;
}

function fitImageSize(width, height) {
  const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = fitImageSize(image.naturalWidth, image.naturalHeight);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      mask = new Uint8Array(canvas.width * canvas.height);
      undoStack = [];
      emptyState.hidden = true;
      canvas.classList.add("ready");
      render();
      syncButtons();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function render() {
  if (!imageData) return;
  ctx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.fillStyle = "rgba(31, 122, 112, .46)";
  for (let y = 0; y < canvas.height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= canvas.width; x += 1) {
      const selected = x < canvas.width && mask[y * canvas.width + x];
      if (selected && runStart < 0) runStart = x;
      if ((!selected || x === canvas.width) && runStart >= 0) {
        ctx.fillRect(runStart, y, x - runStart, 1);
        runStart = -1;
      }
    }
  }
  if (rectPreview) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    const { x, y, width, height } = rectPreview;
    ctx.strokeRect(x, y, width, height);
  }
  ctx.restore();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * (canvas.width / rect.width)))),
    y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * (canvas.height / rect.height)))),
  };
}

function paintCircle(cx, cy, radius) {
  const r2 = radius * radius;
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(canvas.width - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(canvas.height - 1, cy + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) mask[y * canvas.width + x] = 1;
    }
  }
}

function paintBrushLine(from, to, radius) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.45)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    paintCircle(
      Math.round(from.x + (to.x - from.x) * t),
      Math.round(from.y + (to.y - from.y) * t),
      radius
    );
  }
}

function selectRect(a, b) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) mask[y * canvas.width + x] = 1;
  }
}

function pixelAt(data, x, y) {
  const i = (y * canvas.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function magicSelect(start) {
  const data = imageData.data;
  const target = pixelAt(data, start.x, start.y);
  const limit = Number(tolerance.value);
  const seen = new Uint8Array(canvas.width * canvas.height);
  const queue = [start];
  seen[start.y * canvas.width + start.x] = 1;

  while (queue.length) {
    const p = queue.pop();
    mask[p.y * canvas.width + p.x] = 1;
    const neighbors = [
      [p.x + 1, p.y],
      [p.x - 1, p.y],
      [p.x, p.y + 1],
      [p.x, p.y - 1],
    ];
    for (const [x, y] of neighbors) {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const index = y * canvas.width + x;
      if (seen[index]) continue;
      seen[index] = 1;
      if (colorDistance(pixelAt(data, x, y), target) <= limit) queue.push({ x, y });
    }
  }
}

function pushUndo() {
  undoStack.push(new ImageData(new Uint8ClampedArray(imageData.data), canvas.width, canvas.height));
  if (undoStack.length > 12) undoStack.shift();
}

function buildSampleOffsets(maxRadius) {
  const offsets = [];
  for (let y = -maxRadius; y <= maxRadius; y += 1) {
    for (let x = -maxRadius; x <= maxRadius; x += 1) {
      if (x === 0 && y === 0) continue;
      const distance = Math.hypot(x, y);
      if (distance <= maxRadius) offsets.push({ x, y, distance });
    }
  }
  return offsets.sort((a, b) => a.distance - b.distance);
}

function maskBounds(maskData, width, height) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!maskData[y * width + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  return count ? { minX, maxX, minY, maxY, count } : null;
}

function dilateMask(maskData, width, height, radius) {
  const expanded = new Uint8Array(maskData);
  const r2 = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!maskData[y * width + x]) continue;

      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);

      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          const dx = xx - x;
          const dy = yy - y;
          if (dx * dx + dy * dy <= r2) expanded[yy * width + xx] = 1;
        }
      }
    }
  }

  return expanded;
}

function weightedColor(source, samples) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let weightTotal = 0;

  for (const sample of samples) {
    const weight = 1 / Math.max(1, sample.distance * sample.distance * sample.distance);
    const pixelIndex = sample.index * 4;
    r += source[pixelIndex] * weight;
    g += source[pixelIndex + 1] * weight;
    b += source[pixelIndex + 2] * weight;
    a += source[pixelIndex + 3] * weight;
    weightTotal += weight;
  }

  return [
    r / weightTotal,
    g / weightTotal,
    b / weightTotal,
    a / weightTotal,
  ];
}

function nearbyBackgroundColor(source, selectedMask, x, y, width, height, offsets) {
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const directionalSamples = [];
  const maxDistance = offsets[offsets.length - 1]?.distance || 1;

  for (const [dx, dy] of directions) {
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      const nx = x + dx * distance;
      const ny = y + dy * distance;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
      const index = ny * width + nx;
      if (selectedMask[index]) continue;
      directionalSamples.push({ index, distance });
      break;
    }
  }

  if (directionalSamples.length) return weightedColor(source, directionalSamples);

  const fallbackSamples = [];

  for (const offset of offsets) {
    const nx = x + offset.x;
    const ny = y + offset.y;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const index = ny * width + nx;
    if (selectedMask[index]) continue;
    fallbackSamples.push({ index, distance: offset.distance });
    if (fallbackSamples.length >= 12) break;
  }

  return fallbackSamples.length ? weightedColor(source, fallbackSamples) : null;
}

function removeSelection() {
  if (!imageData) return;
  const width = canvas.width;
  const height = canvas.height;
  const originalBounds = maskBounds(mask, width, height);
  if (!originalBounds) return;

  pushUndo();
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const selectedMask = dilateMask(mask, width, height, 3);
  const bounds = maskBounds(selectedMask, width, height);
  const selectionWidth = bounds.maxX - bounds.minX + 1;
  const selectionHeight = bounds.maxY - bounds.minY + 1;
  const maxRadius = Math.min(90, Math.max(12, Math.ceil(Math.max(selectionWidth, selectionHeight) * 0.65)));
  const sampleOffsets = buildSampleOffsets(maxRadius);

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = y * width + x;
      if (!selectedMask[index]) continue;

      const color = nearbyBackgroundColor(source, selectedMask, x, y, width, height, sampleOffsets);
      if (color) {
        const outputIndex = index * 4;
        output[outputIndex] = color[0];
        output[outputIndex + 1] = color[1];
        output[outputIndex + 2] = color[2];
        output[outputIndex + 3] = color[3];
      }
    }
  }

  imageData = new ImageData(output, width, height);
  mask.fill(0);
  render();
  syncButtons();
}

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

brushSize.addEventListener("input", () => {
  brushSizeValue.textContent = brushSize.value;
});

tolerance.addEventListener("input", () => {
  toleranceValue.textContent = tolerance.value;
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0]);
});

canvas.addEventListener("pointerdown", (event) => {
  if (!imageData) return;
  canvas.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  drawing = true;
  if (tool === "brush") {
    paintCircle(point.x, point.y, Math.floor(Number(brushSize.value) / 2));
    lastBrushPoint = point;
  } else if (tool === "rect") {
    rectStart = point;
    rectPreview = { x: point.x, y: point.y, width: 1, height: 1 };
  } else if (tool === "wand") {
    magicSelect(point);
    drawing = false;
  }
  render();
  syncButtons();
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !imageData) return;
  const point = pointFromEvent(event);
  if (tool === "brush") {
    const radius = Math.floor(Number(brushSize.value) / 2);
    paintBrushLine(lastBrushPoint || point, point, radius);
    lastBrushPoint = point;
  } else if (tool === "rect" && rectStart) {
    rectPreview = {
      x: Math.min(rectStart.x, point.x),
      y: Math.min(rectStart.y, point.y),
      width: Math.abs(point.x - rectStart.x),
      height: Math.abs(point.y - rectStart.y),
    };
  }
  render();
  syncButtons();
});

canvas.addEventListener("pointerup", (event) => {
  if (!drawing || !imageData) return;
  const point = pointFromEvent(event);
  if (tool === "rect" && rectStart) selectRect(rectStart, point);
  drawing = false;
  rectStart = null;
  rectPreview = null;
  lastBrushPoint = null;
  render();
  syncButtons();
});

canvas.addEventListener("pointercancel", () => {
  drawing = false;
  rectStart = null;
  rectPreview = null;
  lastBrushPoint = null;
  render();
});

deleteBtn.addEventListener("click", removeSelection);

clearBtn.addEventListener("click", () => {
  mask.fill(0);
  render();
  syncButtons();
});

undoBtn.addEventListener("click", () => {
  const previous = undoStack.pop();
  if (!previous) return;
  imageData = previous;
  mask.fill(0);
  render();
  syncButtons();
});

downloadBtn.addEventListener("click", () => {
  if (!imageData) return;
  ctx.putImageData(imageData, 0, 0);
  const link = document.createElement("a");
  link.download = "pixellift-edited.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  render();
});

["dragenter", "dragover"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (file) loadImage(file);
});
