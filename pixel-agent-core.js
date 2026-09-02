(function (root) {
  "use strict";

  function createPixelAgent(config, paletteHex) {
    if (!config || !Array.isArray(paletteHex) || paletteHex.length !== 128) {
      throw new Error("A valid pixel-agent contract is required");
    }
    const palette = paletteHex.map((hex) => hex.toUpperCase());
    const paletteRgb = palette.map(hexToRgb);
    const paletteLab = paletteRgb.map(rgbToOklab);

    function resizeNearest(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
      const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
      for (let y = 0; y < targetHeight; y++) {
        const sy = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
        for (let x = 0; x < targetWidth; x++) {
          const sx = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
          const sourceIndex = (sy * sourceWidth + sx) * 4;
          out.set(source.subarray(sourceIndex, sourceIndex + 4), (y * targetWidth + x) * 4);
        }
      }
      return { data: out, width: targetWidth, height: targetHeight };
    }

    function recoverToGrid(source, sourceWidth, sourceHeight, grid) {
      if (!config.grid.allowed.includes(grid)) throw new Error("Unsupported working grid");
      const out = new Uint8ClampedArray(grid * grid * 4);
      for (let y = 0; y < grid; y++) {
        const sy0 = Math.floor(y * sourceHeight / grid);
        const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * sourceHeight / grid));
        for (let x = 0; x < grid; x++) {
          const sx0 = Math.floor(x * sourceWidth / grid);
          const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * sourceWidth / grid));
          writeMedianRgba(out, (y * grid + x) * 4, source, sourceWidth, sx0, sy0, sx1, sy1);
        }
      }
      return { data: out, width: grid, height: grid };
    }

    function repair(input, width, height, options = {}) {
      const data = new Uint8ClampedArray(input);
      hardenAlpha(data, config.alpha.threshold);
      applyVividPalette(data, palette, paletteRgb, paletteLab, config.palette.maxOpaqueColors);
      removeExteriorSpecks(data, width, height, config.cleanup.minimumComponentCells);
      enforceExteriorOutline(data, width, height);
      hardenAlpha(data, config.alpha.threshold);
      return { data, width, height, colors: usedColors(data, palette) };
    }

    function finalizeCreative(input, source, width, height, options = {}) {
      const alphaMask = repair(source, width, height, options).data;
      const masked = new Uint8ClampedArray(input);
      for (let offset = 0; offset < masked.length; offset += 4) {
        if (alphaMask[offset + 3] === 0) masked.set([0, 0, 0, 0], offset);
        else masked[offset + 3] = 255;
      }
      return { ...repair(masked, width, height, options), alphaMask };
    }

    return Object.freeze({
      resizeNearest,
      recoverToGrid,
      renderGridToCanvas: (data, grid) => resizeNearest(data, grid, grid, 1024, 1024),
      hardenAlpha: (data) => hardenAlpha(data, config.alpha.threshold),
      applyVividPalette: (data) => applyVividPalette(data, palette, paletteRgb, paletteLab, config.palette.maxOpaqueColors),
      enforceExteriorOutline,
      removeExteriorSpecks,
      repair,
      finalizeCreative,
      verify: (data, width, height, options) => verify(data, width, height, options, config, palette),
      usedColors: (data) => usedColors(data, palette),
      renderSwatch: (colors, width, height) => renderSwatch(colors, width, height, palette),
    });
  }

  function hexToRgb(hex) {
    return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  }

  function hardenAlpha(data, threshold) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < threshold) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      else data[i + 3] = 255;
    }
  }

  function writeMedianRgba(out, offset, source, sourceWidth, sx0, sy0, sx1, sy1) {
    const channels = [[], [], [], []];
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const index = (y * sourceWidth + x) * 4;
      for (let channel = 0; channel < 4; channel++) channels[channel].push(source[index + channel]);
    }
    for (let channel = 0; channel < 4; channel++) {
      channels[channel].sort((a, b) => a - b);
      out[offset + channel] = channels[channel][Math.floor(channels[channel].length / 2)];
    }
  }

  function applyVividPalette(data, palette, paletteRgb, paletteLab, maxColors) {
    const mapped = new Uint16Array(data.length / 4);
    const counts = new Uint32Array(palette.length);
    for (let pixel = 0; pixel < mapped.length; pixel++) {
      const offset = pixel * 4;
      if (data[offset + 3] === 0) continue;
      const index = nearestPaletteIndex([data[offset], data[offset + 1], data[offset + 2]], paletteLab);
      mapped[pixel] = index;
      counts[index]++;
    }
    const whiteIndex = palette.indexOf("#FFFFFF");
    const selected = [0];
    if (whiteIndex !== -1 && counts[whiteIndex] > 0) selected.push(whiteIndex);
    const ranked = Array.from({ length: palette.length }, (_, index) => index)
      .filter((index) => counts[index] > 0 && !selected.includes(index))
      .sort((left, right) => counts[right] - counts[left] || left - right);
    selected.push(...ranked.slice(0, Math.max(0, maxColors - selected.length)));
    for (let pixel = 0; pixel < mapped.length; pixel++) {
      const offset = pixel * 4;
      if (data[offset + 3] === 0) continue;
      let index = mapped[pixel];
      if (!selected.includes(index)) {
        index = nearestPaletteIndex(paletteRgb[index], selected.map((selectedIndex) => paletteLab[selectedIndex]));
        index = selected[index];
      }
      data.set([...paletteRgb[index], 255], offset);
    }
  }

  function nearestPaletteIndex(rgb, paletteLab) {
    const lab = rgbToOklab(rgb);
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < paletteLab.length; index++) {
      const candidate = paletteLab[index];
      const distance = (lab[0] - candidate[0]) ** 2 + (lab[1] - candidate[1]) ** 2 + (lab[2] - candidate[2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function rgbToOklab([red, green, blue]) {
    const linear = [red, green, blue].map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * linear[0] + 0.5363325363 * linear[1] + 0.0514459929 * linear[2]);
    const m = Math.cbrt(0.2119034982 * linear[0] + 0.6806995451 * linear[1] + 0.1073969566 * linear[2]);
    const s = Math.cbrt(0.0883024619 * linear[0] + 0.2817188376 * linear[1] + 0.6299787005 * linear[2]);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }

  function exteriorTransparent(data, width, height) {
    const exterior = new Uint8Array(width * height);
    const queue = [];
    for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
    for (let head = 0; head < queue.length; head++) {
      const point = queue[head];
      if (exterior[point] || data[point * 4 + 3] !== 0) continue;
      exterior[point] = 1;
      const x = point % width;
      if (x > 0) queue.push(point - 1);
      if (x + 1 < width) queue.push(point + 1);
      if (point >= width) queue.push(point - width);
      if (point < width * (height - 1)) queue.push(point + width);
    }
    return exterior;
  }

  function touchesExterior(pixel, exterior, width, height) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (exterior[(y + dy) * width + x + dx]) return true;
    }
    return false;
  }

  function removeExteriorSpecks(data, width, height, minimumCells) {
    const exterior = exteriorTransparent(data, width, height);
    const visited = new Uint8Array(width * height);
    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || data[start * 4 + 3] === 0) continue;
      const component = [];
      const queue = [start];
      visited[start] = 1;
      let touches = false;
      for (let head = 0; head < queue.length; head++) {
        const point = queue[head];
        component.push(point);
        if (touchesExterior(point, exterior, width, height)) touches = true;
        const x = point % width;
        const y = Math.floor(point / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          const neighbor = ny * width + nx;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && !visited[neighbor] && data[neighbor * 4 + 3] !== 0) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
      if (touches && component.length < minimumCells) {
        for (const point of component) data.set([0, 0, 0, 0], point * 4);
      }
    }
  }

  function enforceExteriorOutline(data, width, height) {
    const exterior = exteriorTransparent(data, width, height);
    for (let point = 0; point < exterior.length; point++) {
      if (data[point * 4 + 3] !== 0 && touchesExterior(point, exterior, width, height)) {
        data.set([0, 0, 0, 255], point * 4);
      }
    }
  }

  function usedColors(data, palette) {
    const used = new Set();
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] !== 0) used.add(`#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2].toString(16).padStart(2, "0")}`.toUpperCase());
    }
    return palette.filter((hex) => used.has(hex));
  }

  function verify(data, width, height, options = {}, config, palette) {
    const errors = [];
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width !== height || !data || data.length !== width * height * 4) {
      return ["Invalid dimensions: expected a square RGBA buffer"];
    }
    const grid = options && options.grid === undefined ? config.grid.default : options.grid;
    if (!config.grid.allowed.includes(grid) || grid !== width || grid !== height) errors.push("Unsupported grid: use an approved square working grid");
    const paletteSet = new Set(palette);
    const alphaMask = options && options.alphaMask;
    if (alphaMask && alphaMask.length !== data.length) errors.push("Invalid source alpha mask");
    const colors = new Set();
    let alphaReported = false;
    let silhouetteReported = false;
    let paletteReported = false;
    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = data[offset + 3];
      if (!alphaReported && alpha !== 0 && alpha !== 255) {
        errors.push(`Non-binary alpha at pixel ${offset / 4}`);
        alphaReported = true;
      }
      if (!silhouetteReported && alphaMask && alphaMask.length === data.length) {
        const expectedAlpha = alphaMask[offset + 3] < config.alpha.threshold ? 0 : 255;
        if (alpha !== expectedAlpha) {
          errors.push(`Source silhouette mismatch at pixel ${offset / 4}`);
          silhouetteReported = true;
        }
      }
      if (alpha === 0) continue;
      const hex = `#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2].toString(16).padStart(2, "0")}`.toUpperCase();
      colors.add(hex);
      if (!paletteReported && !paletteSet.has(hex)) {
        errors.push(`Off-palette color at pixel ${offset / 4}: ${hex}`);
        paletteReported = true;
      }
    }
    if (colors.size > config.palette.maxOpaqueColors) errors.push(`Too many opaque colors: ${colors.size}`);
    const exterior = exteriorTransparent(data, width, height);
    for (let point = 0; point < exterior.length; point++) {
      const offset = point * 4;
      if (data[offset + 3] !== 0 && touchesExterior(point, exterior, width, height) && (data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0)) {
        errors.push(`Non-black exterior boundary at pixel ${point}`);
        break;
      }
    }
    return errors;
  }

  function renderSwatch(colors, width = 1024, height = 128, palette) {
    const data = new Uint8ClampedArray(width * height * 4);
    const selected = palette.filter((hex) => colors.map((color) => color.toUpperCase()).includes(hex));
    for (let slot = 0; slot < Math.min(16, selected.length); slot++) {
      const [red, green, blue] = hexToRgb(selected[slot]);
      const x0 = Math.floor(slot * width / 16);
      const x1 = Math.floor((slot + 1) * width / 16);
      for (let y = 0; y < height; y++) for (let x = x0; x < x1; x++) data.set([red, green, blue, 255], (y * width + x) * 4);
    }
    return { data, width, height };
  }

  root.ChatNftPixelAgent = Object.freeze({ create: createPixelAgent });
})(typeof window === "object" ? window : globalThis);
