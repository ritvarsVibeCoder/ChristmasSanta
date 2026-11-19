// A gold-foil scratch-off layer drawn on a <canvas> over the card.
// onFirstScratch: called once when the person starts scratching.
// onDone: called once enough foil is cleared (or reveal() is called).

export function createScratchCard(canvas, { onFirstScratch, onDone, threshold = 0.6 } = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let dpr = 1;
  let drawing = false;
  let last = null;
  let started = false;
  let finished = false;
  let checkQueued = false;

  function paintFoil() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const w = canvas.width;
    const h = canvas.height;

    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#F3D07A');
    g.addColorStop(0.45, '#D9A33A');
    g.addColorStop(0.7, '#F6DA92');
    g.addColorStop(1, '#C98F2A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // little stars
    const step = 34 * dpr;
    ctx.fillStyle = 'rgba(255, 243, 207, 0.45)';
    for (let y = step / 2; y < h + step; y += step) {
      for (let x = step / 2; x < w + step; x += step) {
        star(ctx, x, y, 7 * dpr);
      }
    }

    ctx.fillStyle = '#6B4508';
    ctx.font = `700 ${14 * dpr}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${2 * dpr}px`;
    ctx.fillText('SCRATCH HERE', w / 2, h - 30 * dpr);
  }

  function star(c, cx, cy, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      c.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
    }
    c.closePath();
    c.fill();
  }

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  function scratchTo(p) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 46 * dpr;
    ctx.beginPath();
    ctx.moveTo(last ? last.x : p.x, last ? last.y : p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    last = p;
    queueCheck();
  }

  function queueCheck() {
    if (checkQueued || finished) return;
    checkQueued = true;
    setTimeout(() => {
      checkQueued = false;
      if (clearedRatio() >= threshold) finish();
    }, 180);
  }

  function clearedRatio() {
    const { width: w, height: h } = canvas;
    const data = ctx.getImageData(0, 0, w, h).data;
    const stride = 4 * 12; // sample every 12th pixel
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += stride) {
      total++;
      if (data[i] < 40) clear++;
    }
    return total ? clear / total : 0;
  }

  function begin() {
    if (!started) {
      started = true;
      onFirstScratch && onFirstScratch();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    canvas.classList.add('cleared');
    onDone && onDone();
  }

  function onDown(e) {
    if (finished) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    drawing = true;
    last = null;
    begin();
    scratchTo(pos(e));
  }
  function onMove(e) {
    if (!drawing || finished) return;
    e.preventDefault();
    scratchTo(pos(e));
  }
  function onUp() {
    drawing = false;
    last = null;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);

  paintFoil();
  // Repaint once web fonts are ready so the label uses DM Sans.
  document.fonts?.ready.then(() => {
    if (!started) paintFoil();
  });

  return {
    reveal() {
      begin();
      finish();
    },
  };
}
