(function () {
  'use strict';

  const MAX_DIMENSION = 2400;
  const RENDER_DEBOUNCE_MS = 150;

  // --- Element refs ---
  const dropZone = document.getElementById('dropZone');
  const imageInput = document.getElementById('imageInput');

  const textControls = document.getElementById('textControls');
  const logoControls = document.getElementById('logoControls');
  const watermarkTypeGroup = document.getElementById('watermarkTypeGroup');

  const watermarkText = document.getElementById('watermarkText');
  const watermarkColor = document.getElementById('watermarkColor');
  const watermarkSize = document.getElementById('watermarkSize');
  const watermarkSizeLabel = document.getElementById('watermarkSizeLabel');

  const logoDropZone = document.getElementById('logoDropZone');
  const logoInput = document.getElementById('logoInput');
  const logoSize = document.getElementById('logoSize');
  const logoSizeLabel = document.getElementById('logoSizeLabel');

  const layoutStyle = document.getElementById('layoutStyle');
  const opacity = document.getElementById('opacity');
  const opacityLabel = document.getElementById('opacityLabel');
  const angle = document.getElementById('angle');
  const angleLabel = document.getElementById('angleLabel');

  const shieldStrength = document.getElementById('shieldStrength');
  const noiseAmplitude = document.getElementById('noiseAmplitude');
  const noiseAmplitudeLabel = document.getElementById('noiseAmplitudeLabel');
  const edgeDither = document.getElementById('edgeDither');
  const spectrumPerturb = document.getElementById('spectrumPerturb');

  const exportFormat = document.getElementById('exportFormat');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');

  const btnViewProtected = document.getElementById('btnViewProtected');
  const btnViewOriginal = document.getElementById('btnViewOriginal');

  const loadingSpinner = document.getElementById('loadingSpinner');
  const placeholderText = document.getElementById('placeholderText');
  const protectedCanvas = document.getElementById('protectedCanvas');
  const originalCanvas = document.getElementById('originalCanvas');

  const statusAlert = document.getElementById('statusAlert');
  const statusText = document.getElementById('statusText');
  const timingText = document.getElementById('timingText');

  // --- State ---
  let sourceImageEl = null; // loaded <img> for the main photo, clamped size drawn into originalCanvas
  let logoImageEl = null; // loaded <img> for the optional logo watermark
  let activeView = 'protected';
  let renderTimer = null;
  let renderGeneration = 0;

  // --- Helpers ---
  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  function setLabel(el, value) {
    el.textContent = value;
  }

  function withMaxDimension(w, h, max) {
    if (w <= max && h <= max) return { w, h };
    const scale = Math.min(max / w, max / h);
    return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)) };
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('Please select a valid image file (PNG, JPG, WebP, GIF).'));
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        reject(new Error('File size exceeds 25MB limit. Please select a smaller image.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected file. Please try again.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file is not a readable image. Please choose a different one.'));
        img.onload = () => resolve(img);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // --- Watermark type toggle ---
  watermarkTypeGroup.querySelectorAll('input[name="watermarkType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      watermarkTypeGroup.querySelectorAll('.seg-opt').forEach((opt) => opt.classList.remove('active'));
      radio.closest('.seg-opt').classList.add('active');
      const isLogo = radio.value === 'logo';
      textControls.classList.toggle('d-none', isLogo);
      logoControls.classList.toggle('d-none', !isLogo);
      scheduleRender();
    });
  });

  function getWatermarkType() {
    return watermarkTypeGroup.querySelector('input[name="watermarkType"]:checked').value;
  }

  // --- Main image drop zone ---
  dropZone.addEventListener('click', () => {
    imageInput.click();
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleMainFile(e.dataTransfer.files[0]);
  });
  imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleMainFile(e.target.files[0]);
  });

  async function handleMainFile(file) {
    try {
      dropZone.classList.add('disabled');
      const img = await loadImageFromFile(file);
      const { w, h } = withMaxDimension(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);

      const oCanvas = originalCanvas;
      oCanvas.width = w;
      oCanvas.height = h;
      oCanvas.getContext('2d').drawImage(img, 0, 0, w, h);

      sourceImageEl = img;
      placeholderText.classList.add('d-none');
      downloadBtn.disabled = false;
      renderNow();
    } catch (err) {
      alert(err.message);
    } finally {
      dropZone.classList.remove('disabled');
    }
  }

  // --- Logo drop zone ---
  logoDropZone.addEventListener('click', () => logoInput.click());
  logoDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    logoDropZone.classList.add('dragover');
  });
  logoDropZone.addEventListener('dragleave', () => logoDropZone.classList.remove('dragover'));
  logoDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    logoDropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleLogoFile(e.dataTransfer.files[0]);
  });
  logoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleLogoFile(e.target.files[0]);
  });

  async function handleLogoFile(file) {
    try {
      logoImageEl = await loadImageFromFile(file);
      scheduleRender();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- Controls wiring (sliders show live value + trigger re-render) ---
  function wireRange(input, label, suffix) {
    input.addEventListener('input', () => {
      setLabel(label, input.value + (suffix || ''));
      scheduleRender();
    });
  }
  wireRange(watermarkSize, watermarkSizeLabel);
  wireRange(logoSize, logoSizeLabel);
  wireRange(opacity, opacityLabel);
  wireRange(angle, angleLabel);
  wireRange(noiseAmplitude, noiseAmplitudeLabel);

  [watermarkText, watermarkColor, layoutStyle, shieldStrength].forEach((el) =>
    el.addEventListener('input', scheduleRender)
  );
  [edgeDither, spectrumPerturb].forEach((el) => el.addEventListener('change', scheduleRender));

  btnViewProtected.addEventListener('click', () => setActiveView('protected'));
  btnViewOriginal.addEventListener('click', () => setActiveView('original'));

  function setActiveView(view) {
    activeView = view;
    btnViewProtected.classList.toggle('active', view === 'protected');
    btnViewOriginal.classList.toggle('active', view === 'original');
    protectedCanvas.classList.toggle('d-none', view !== 'protected');
    originalCanvas.classList.toggle('d-none', view !== 'original');
  }

  resetBtn.addEventListener('click', resetState);
  downloadBtn.addEventListener('click', handleDownload);

  function resetState() {
    sourceImageEl = null;
    logoImageEl = null;
    imageInput.value = '';
    logoInput.value = '';
    protectedCanvas.classList.add('d-none');
    originalCanvas.classList.add('d-none');
    placeholderText.classList.remove('d-none');
    statusAlert.classList.add('d-none');
    downloadBtn.disabled = true;
    setActiveView('protected');
  }

  // --- Debounced render scheduling ---
  function scheduleRender() {
    if (!sourceImageEl) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, RENDER_DEBOUNCE_MS);
  }

  function renderNow() {
    if (!sourceImageEl) return;
    const myGeneration = ++renderGeneration;
    loadingSpinner.classList.remove('d-none');
    statusAlert.classList.add('d-none');

    // Yield a tick so the spinner can paint before the (synchronous) pixel work.
    requestAnimationFrame(() => {
      // A newer render (new image, or another control change) superseded this one
      // while it was queued/running — drop this stale result instead of clobbering
      // the newer one's output.
      if (myGeneration !== renderGeneration) return;
      const start = performance.now();
      try {
        const w = originalCanvas.width;
        const h = originalCanvas.height;
        protectedCanvas.width = w;
        protectedCanvas.height = h;

        const ctx = protectedCanvas.getContext('2d');
        ctx.drawImage(originalCanvas, 0, 0);

        applyAIResistance(ctx, w, h, {
          mode: shieldStrength.value,
          amplitude: Number(noiseAmplitude.value),
          edgeDither: edgeDither.checked,
          spectrumPerturb: spectrumPerturb.checked
        });

        drawWatermark(ctx, w, h, {
          type: getWatermarkType(),
          text: watermarkText.value,
          color: watermarkColor.value,
          size: Number(getWatermarkType() === 'logo' ? logoSize.value : watermarkSize.value),
          layout: layoutStyle.value,
          opacityValue: Number(opacity.value) / 100,
          angleDeg: Number(angle.value),
          logoImg: logoImageEl
        });

        if (myGeneration !== renderGeneration) return;
        setActiveView(activeView);

        const elapsed = Math.round(performance.now() - start);
        statusText.textContent = `Protected (${w}x${h}px)`;
        timingText.textContent = `${elapsed}ms`;
        statusAlert.classList.remove('d-none');
      } catch (err) {
        console.error('Render error:', err);
        if (myGeneration === renderGeneration) alert('Error protecting image: ' + err.message);
      } finally {
        if (myGeneration === renderGeneration) {
          loadingSpinner.classList.add('d-none');
        }
      }
    });
  }

  // --- AI Resistance Engine: pixel-level high-frequency noise ---
  function applyAIResistance(ctx, width, height, opts) {
    const { mode, amplitude, edgeDither: useEdgeDither, spectrumPerturb: useSpectrum } = opts;
    if (mode === 'off' || amplitude <= 0) return;

    const strengthMultiplier = mode === 'max' ? 1.6 : mode === 'balanced' ? 1 : mode === 'low' ? 0.45 : 0;
    const amp = amplitude * strengthMultiplier;
    if (amp <= 0) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let edgeMap = null;
    if (useEdgeDither) edgeMap = computeEdgeMap(data, width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const idx = i * 4;

        let localAmp = amp;
        if (edgeMap) localAmp = amp * (0.5 + edgeMap[i] * 1.5);

        let n = (Math.random() * 2 - 1) * localAmp;
        if (useSpectrum) {
          const parity = (x + y) % 2 === 0 ? 1 : -1;
          const stripe = Math.sin((x - y) * 0.9) * 0.5;
          n += parity * localAmp * 0.35 + stripe * localAmp * 0.25;
        }

        data[idx] = clamp255(data[idx] + n);
        data[idx + 1] = clamp255(data[idx + 1] + n * 0.85 + (Math.random() * 2 - 1) * localAmp * 0.15);
        data[idx + 2] = clamp255(data[idx + 2] + n * 0.7 + (Math.random() * 2 - 1) * localAmp * 0.15);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function computeEdgeMap(data, width, height) {
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    const edge = new Float32Array(width * height);
    let max = 1;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx = gray[i + 1] - gray[i - 1];
        const gy = gray[i + width] - gray[i - width];
        const mag = Math.sqrt(gx * gx + gy * gy);
        edge[i] = mag;
        if (mag > max) max = mag;
      }
    }
    for (let i = 0; i < edge.length; i++) edge[i] /= max;
    return edge;
  }

  // --- Watermark overlay drawing ---
  function drawWatermark(ctx, width, height, opts) {
    const { type, text, color, size, layout, opacityValue, angleDeg, logoImg } = opts;
    if (type === 'logo' && !logoImg) return; // nothing to stamp yet

    ctx.save();
    ctx.globalAlpha = opacityValue;
    if (type !== 'logo') {
      ctx.fillStyle = color;
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    const angleRad = (angleDeg * Math.PI) / 180;

    if (layout === 'center-stamp') {
      ctx.translate(width / 2, height / 2);
      ctx.rotate(angleRad);
      drawMark(ctx, 0, 0, type, text, size, logoImg);
    } else if (layout === 'corner') {
      // Clamp so a large watermark on a small image still lands on-canvas.
      const pad = Math.min(size * 1.2, width * 0.45, height * 0.45);
      ctx.translate(width - pad, height - pad);
      ctx.rotate(angleRad);
      drawMark(ctx, 0, 0, type, text, size, logoImg);
    } else {
      const spacingX = layout === 'dense-diagonal' ? size * 3 : size * 4.5;
      const spacingY = layout === 'dense-diagonal' ? size * 2.2 : size * 4.5;
      ctx.translate(width / 2, height / 2);
      ctx.rotate(angleRad);
      const diag = Math.sqrt(width * width + height * height);
      for (let y = -diag; y < diag; y += spacingY) {
        for (let x = -diag; x < diag; x += spacingX) {
          drawMark(ctx, x, y, type, text, size, logoImg);
        }
      }
    }
    ctx.restore();
  }

  function drawMark(ctx, x, y, type, text, size, logoImg) {
    if (type === 'logo' && logoImg) {
      const w = size * 2;
      const h = (logoImg.naturalHeight / logoImg.naturalWidth) * w || size * 2;
      ctx.drawImage(logoImg, x - w / 2, y - h / 2, w, h);
    } else {
      ctx.fillText(text || 'PROTECTED', x, y);
    }
  }

  // --- Download ---
  async function canvasToDataURL(canvas, mime, quality) {
    return canvas.toDataURL(mime, quality);
  }

  async function handleDownload() {
    if (!sourceImageEl) return;
    const format = exportFormat.value || 'image/png';
    const ext = format.split('/')[1] || 'png';
    const dataUrl = await canvasToDataURL(protectedCanvas, format, 0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ai_resistant_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
})();
