(function (root) {
  "use strict";

  function createPixelAgent(config, paletteHex) {
    if (!config || !Array.isArray(paletteHex) || paletteHex.length !== 128) {
      throw new Error("A valid pixel-agent contract is required");
    }
    const palette = paletteHex.map((hex) => hex.toUpperCase());
    const paletteRgb = palette.map(hexToRgb);
    const paletteLab = paletteRgb.map(rgbToOklab);

    function resolvePalette(options = {}) {
      const custom = Array.isArray(options.paletteHex) && options.paletteHex.length;
      const requested = custom
        ? options.paletteHex.map((hex) => String(hex).toUpperCase())
        : palette;
      if (requested[0] !== "#000000" || requested.some((hex) => !/^#[0-9A-F]{6}$/.test(hex))) {
        throw new Error("A custom palette must start with #000000 and contain only six-digit hex colors");
      }
      const unique = [...new Set(requested)];
      const maxColors = options.maxOpaqueColors || config.palette.maxOpaqueColors;
      if (!Number.isInteger(maxColors) || maxColors < 1 || (custom && unique.length > maxColors)) {
        throw new Error("Custom palette exceeds the opaque-color limit");
      }
      return { hex: unique, rgb: unique.map(hexToRgb), lab: unique.map((color) => rgbToOklab(hexToRgb(color))), maxColors };
    }

    function deriveSourcePalette(data, maxColors = config.palette.maxOpaqueColors) {
      if (!data || data.length % 4 !== 0 || !Number.isInteger(maxColors) || maxColors < 1) {
        throw new Error("A valid RGBA source and color limit are required");
      }
      const counts = new Map();
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) continue;
        const hex = rgbToHex(data[offset], data[offset + 1], data[offset + 2]);
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }
      counts.delete("#000000");
      const selected = ["#000000"];
      if (counts.has("#FFFFFF") && selected.length < maxColors) {
        selected.push("#FFFFFF");
        counts.delete("#FFFFFF");
      }
      if (counts.size <= maxColors - selected.length) {
        selected.push(...[...counts]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([hex]) => hex));
        return selected;
      }

      const buckets = new Map();
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) continue;
        const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
        const key = `${red >> 4},${green >> 4},${blue >> 4}`;
        if (!buckets.has(key)) buckets.set(key, { count: 0, sum: [0, 0, 0], exact: new Map() });
        const bucket = buckets.get(key);
        const hex = rgbToHex(red, green, blue);
        bucket.count++;
        bucket.sum[0] += red; bucket.sum[1] += green; bucket.sum[2] += blue;
        bucket.exact.set(hex, (bucket.exact.get(hex) || 0) + 1);
      }
      const minimumCount = Math.max(2, Math.floor(data.length / 4 * 0.0005));
      const candidates = [...buckets.values()]
        .filter((bucket) => bucket.count >= minimumCount)
        .map((bucket) => {
          const mean = bucket.sum.map((total) => total / bucket.count);
          const representative = [...bucket.exact]
            .map(([hex, count]) => ({ hex, count, rgb: hexToRgb(hex) }))
            .sort((left, right) => {
              const leftDistance = left.rgb.reduce((sum, value, index) => sum + (value - mean[index]) ** 2, 0);
              const rightDistance = right.rgb.reduce((sum, value, index) => sum + (value - mean[index]) ** 2, 0);
              return leftDistance - rightDistance || right.count - left.count || left.hex.localeCompare(right.hex);
            })[0];
          return { hex: representative.hex, count: bucket.count, lab: rgbToOklab(representative.rgb) };
        })
        .filter((candidate) => !selected.includes(candidate.hex));
      const selectedLabs = selected.map((hex) => rgbToOklab(hexToRgb(hex)));
      while (candidates.length && selected.length < maxColors) {
        let bestIndex = -1, bestScore = -1;
        for (let index = 0; index < candidates.length; index++) {
          const candidate = candidates[index];
          const distance = selectedLabs.reduce((nearest, color) => Math.min(nearest,
            (candidate.lab[0] - color[0]) ** 2 +
            (candidate.lab[1] - color[1]) ** 2 +
            (candidate.lab[2] - color[2]) ** 2), Infinity);
          const score = distance * Math.log2(candidate.count + 1);
          if (score > bestScore) { bestIndex = index; bestScore = score; }
        }
        if (bestIndex < 0) break;
        const [chosen] = candidates.splice(bestIndex, 1);
        selected.push(chosen.hex);
        selectedLabs.push(chosen.lab);
      }
      return selected;
    }

    function deriveClothingPalette(data, maxColors = config.palette.maxOpaqueColors) {
      if (!data || data.length % 4 !== 0 || !Number.isInteger(maxColors) || maxColors < 1) {
        throw new Error("A valid RGBA source and color limit are required");
      }
      const counts = new Map();
      const allIndexes = palette.map((_, index) => index);
      const neutralIndexes = allIndexes.filter((index) => {
        const [red, green, blue] = paletteRgb[index];
        return red === green && green === blue;
      });
      let opaque = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) continue;
        opaque++;
        const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
        const high = Math.max(red, green, blue), low = Math.min(red, green, blue);
        const candidates = high - low <= 18 ? neutralIndexes : allIndexes;
        const relativeIndex = nearestPaletteIndex([red, green, blue], candidates.map((index) => paletteLab[index]));
        const hex = palette[candidates[relativeIndex]];
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }

      const selected = ["#000000"];
      counts.delete("#000000");
      if (counts.has("#FFFFFF") && selected.length < maxColors) {
        selected.push("#FFFFFF");
        counts.delete("#FFFFFF");
      }
      const minimumCount = Math.max(2, Math.floor(opaque * 0.0005));
      const candidates = [...counts]
        .filter(([, count]) => count >= minimumCount)
        .map(([hex, count]) => ({ hex, count, lab: paletteLab[palette.indexOf(hex)] }))
        .sort((left, right) => right.count - left.count || left.hex.localeCompare(right.hex));
      const selectedLabs = selected.map((hex) => rgbToOklab(hexToRgb(hex)));
      while (candidates.length && selected.length < maxColors) {
        let bestIndex = -1, bestScore = -1, bestDistance = 0;
        for (let index = 0; index < candidates.length; index++) {
          const candidate = candidates[index];
          const distance = selectedLabs.reduce((nearest, color) => Math.min(nearest,
            (candidate.lab[0] - color[0]) ** 2 +
            (candidate.lab[1] - color[1]) ** 2 +
            (candidate.lab[2] - color[2]) ** 2), Infinity);
          const score = distance * Math.log2(candidate.count + 1);
          if (score > bestScore) {
            bestIndex = index; bestScore = score; bestDistance = distance;
          }
        }
        if (bestIndex < 0 || bestDistance < 0.0009) break;
        const [chosen] = candidates.splice(bestIndex, 1);
        selected.push(chosen.hex);
        selectedLabs.push(chosen.lab);
      }
      return selected;
    }

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

    function focusOpaqueRegion(source, sourceWidth, sourceHeight, options = {}) {
      if (!source || source.length !== sourceWidth * sourceHeight * 4 || sourceWidth !== sourceHeight) {
        throw new Error("A square RGBA source is required for focused generation");
      }
      const padding = Number.isInteger(options.padding) ? Math.max(0, options.padding) : 8;
      const targetSize = Number.isInteger(options.targetSize) && options.targetSize > 0
        ? options.targetSize : sourceWidth;
      let minX = sourceWidth, minY = sourceHeight, maxX = -1, maxY = -1;
      for (let y = 0; y < sourceHeight; y++) for (let x = 0; x < sourceWidth; x++) {
        if (source[(y * sourceWidth + x) * 4 + 3] >= config.alpha.threshold) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) {
        const whole = resizeNearest(source, sourceWidth, sourceHeight, targetSize, targetSize);
        return { ...whole, transform: { x: 0, y: 0, width: sourceWidth, height: sourceHeight, sourceWidth, sourceHeight } };
      }
      const contentWidth = maxX - minX + 1, contentHeight = maxY - minY + 1;
      const cropWidth = Math.min(sourceWidth, contentWidth + padding * 2);
      const cropHeight = Math.min(sourceHeight, contentHeight + padding * 2);
      const centerX = (minX + maxX + 1) / 2, centerY = (minY + maxY + 1) / 2;
      const x = Math.max(0, Math.min(sourceWidth - cropWidth, Math.floor(centerX - cropWidth / 2)));
      const y = Math.max(0, Math.min(sourceHeight - cropHeight, Math.floor(centerY - cropHeight / 2)));
      const crop = new Uint8ClampedArray(cropWidth * cropHeight * 4);
      for (let cy = 0; cy < cropHeight; cy++) for (let cx = 0; cx < cropWidth; cx++) {
        const from = ((y + cy) * sourceWidth + x + cx) * 4;
        crop.set(source.subarray(from, from + 4), (cy * cropWidth + cx) * 4);
      }
      const focused = resizeNearest(crop, cropWidth, cropHeight, targetSize, targetSize);
      return { ...focused, transform: { x, y, width: cropWidth, height: cropHeight, sourceWidth, sourceHeight } };
    }

    function restoreFocusedRegion(generated, generatedWidth, generatedHeight, transform) {
      if (!transform || !Number.isInteger(transform.width) || transform.width <= 0 ||
          !Number.isInteger(transform.height) || transform.height <= 0) {
        throw new Error("A valid focused-generation transform is required");
      }
      const restored = new Uint8ClampedArray(transform.sourceWidth * transform.sourceHeight * 4);
      for (let cy = 0; cy < transform.height; cy++) for (let cx = 0; cx < transform.width; cx++) {
        const to = ((transform.y + cy) * transform.sourceWidth + transform.x + cx) * 4;
        const generatedX = Math.min(generatedWidth - 1, Math.floor((cx + 0.5) * generatedWidth / transform.width));
        const generatedY = Math.min(generatedHeight - 1, Math.floor((cy + 0.5) * generatedHeight / transform.height));
        const from = (generatedY * generatedWidth + generatedX) * 4;
        restored.set(generated.subarray(from, from + 4), to);
      }
      return { data: restored, width: transform.sourceWidth, height: transform.sourceHeight };
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
      const selectedPalette = resolvePalette(options);
      hardenAlpha(data, config.alpha.threshold);
      applyVividPalette(data, selectedPalette.hex, selectedPalette.rgb, selectedPalette.lab, selectedPalette.maxColors);
      removeExteriorSpecks(data, width, height, config.cleanup.minimumComponentCells);
      enforceExteriorOutline(data, width, height);
      hardenAlpha(data, config.alpha.threshold);
      return { data, width, height, colors: usedColors(data, selectedPalette.hex) };
    }

    function finalizeCreative(input, source, width, height, options = {}) {
      const sourceRepair = repair(source, width, height, options).data;
      const alphaMask = options.canonicalAlphaMask
        ? canonicalizeAlphaMask(sourceRepair, options.canonicalAlphaMask, width, height, config.alpha.threshold)
        : sourceRepair;
      const anchoredWhiteMask = new Uint8Array(width * height);
      const anchoredBlackMask = new Uint8Array(width * height);
      const allowAnchoredWhiteRecolor = allowsAnchoredWhiteRecolor(options.instruction);
      let authorizedCells = 0;
      for (let point = 0; point < anchoredWhiteMask.length; point++) {
        const offset = point * 4;
        if (alphaMask[offset] === 255 && alphaMask[offset + 1] === 255 && alphaMask[offset + 2] === 255 && alphaMask[offset + 3] === 255) {
          const draftChangedWhite = input[offset] !== 255 || input[offset + 1] !== 255 || input[offset + 2] !== 255;
          if (allowAnchoredWhiteRecolor && draftChangedWhite) authorizedCells++;
          else anchoredWhiteMask[point] = 1;
        }
        if (options.preserveSourceBlack && source[offset + 3] >= config.alpha.threshold &&
            Math.max(source[offset], source[offset + 1], source[offset + 2]) <= 24) {
          anchoredBlackMask[point] = 1;
        }
      }
      if (options.preserveSourceBlack) {
        const exterior = exteriorTransparent(alphaMask, width, height);
        for (let point = 0; point < anchoredBlackMask.length; point++) {
          if (alphaMask[point * 4 + 3] !== 0 && touchesExterior(point, exterior, width, height)) {
            anchoredBlackMask[point] = 1;
          }
        }
      }
      const masked = new Uint8ClampedArray(input);
      for (let offset = 0; offset < masked.length; offset += 4) {
        if (alphaMask[offset + 3] === 0) masked.set([0, 0, 0, 0], offset);
        else masked[offset + 3] = 255;
      }
      let finalized = repair(masked, width, height, options);
      for (let point = 0; point < anchoredWhiteMask.length; point++) {
        if (anchoredWhiteMask[point]) finalized.data.set([255, 255, 255, 255], point * 4);
        if (anchoredBlackMask[point]) finalized.data.set([0, 0, 0, 255], point * 4);
      }
      // Re-run palette reduction after restoring white so the anchors count
      // toward the same sixteen-color ceiling instead of becoming color 17.
      finalized = repair(finalized.data, width, height, options);
      if (options.cleanClothingShading) {
        cleanIsolatedNeutralShading(finalized.data, width, height, anchoredWhiteMask, anchoredBlackMask);
      }
      finalized.colors = usedColors(finalized.data, resolvePalette(options).hex);
      return {
        ...finalized,
        alphaMask,
        anchoredWhiteMask,
        anchoredBlackMask,
        anchorAuthorization: { allowed: allowAnchoredWhiteRecolor, authorizedCells },
      };
    }

    return Object.freeze({
      resizeNearest,
      focusOpaqueRegion,
      restoreFocusedRegion,
      recoverToGrid,
      renderGridToCanvas: (data, grid, targetSize = 1024) => {
        if (!Number.isInteger(targetSize) || targetSize <= 0 || targetSize % grid !== 0) {
          throw new Error("Output canvas must be a positive integer multiple of the working grid");
        }
        return resizeNearest(data, grid, grid, targetSize, targetSize);
      },
      hardenAlpha: (data) => hardenAlpha(data, config.alpha.threshold),
      applyVividPalette: (data) => applyVividPalette(data, palette, paletteRgb, paletteLab, config.palette.maxOpaqueColors),
      enforceExteriorOutline,
      removeExteriorSpecks,
      repair,
      finalizeCreative,
      deriveSourcePalette,
      deriveClothingPalette,
      allowsAnchoredWhiteRecolor,
      verify: (data, width, height, options = {}) => {
        const selectedPalette = resolvePalette(options);
        return verify(data, width, height, options, config, selectedPalette.hex, selectedPalette.maxColors);
      },
      usedColors: (data, paletteOverride) => usedColors(data, paletteOverride || palette),
      renderSwatch: (colors, width, height, paletteOverride) => renderSwatch(colors, width, height, paletteOverride || palette),
    });
  }

  function allowsAnchoredWhiteRecolor(instruction) {
    const text = String(instruction || "").slice(0, 2000).replace(/[’]/g, "'");
    if (!text.trim()) return false;
    const namedNeetPart = "(?:text|letters?|lettering|emblem|logo)";
    const targetNoun = `(?:t\\b|neet\\s+${namedNeetPart}\\b|neet(?!\\s+${namedNeetPart}\\b)\\b|(?:white\\s+)?(?:text|letters?|lettering|emblem|logo|globe)\\b(?:\\s+artwork\\b)?)`;
    const target = `(?:the\\s+)?${targetNoun}(?!\\s*(?:'s\\s+)?(?:background|backdrop|box|container|panel|field|area|border|outline)\\b)`;
    const colorValue = "(?:#[0-9a-f]{3,8}\\b|(?:the\\s+)?(?:same|different)\\s+(?:colou?r|shade|tone)\\b(?:\\s+as\\b.{0,32})?|(?:bright|dark|light)?\\s*(?:red|orange|yellow|green|cyan|blue|indigo|purple|violet|magenta|pink|brown|tan|beige|gr[ae]y|white|black)\\b|darker\\b|lighter\\b)";
    const clauses = text.split(/(?:[.;\n]+|\bbut\b|\bwhile\b)/i);
    const directAction = new RegExp(`\\b(?:recolou?r|darken|lighten)\\s+(?:only\\s+)?${target}`, "i");
    const changeTarget = new RegExp(`\\bchange\\s+${target}(?:\\s*'s)?(?:\\s+(?:colou?r|shade|tone))?\\s+(?:to|into)\\s+(?:a\\s+)?${colorValue}`, "i");
    const changeTargetColor = new RegExp(`\\bchange\\s+(?:the\\s+)?(?:colou?r|shade|tone)\\s+of\\s+${target}\\s+(?:to|into)\\s+(?:a\\s+)?${colorValue}`, "i");
    const makeColor = new RegExp(`\\bmake\\s+${target}\\s+(?:a\\s+)?${colorValue}`, "i");
    const setColor = new RegExp(`\\b(?:set|turn)\\s+${target}\\s+(?:to|into)\\s+(?:a\\s+)?${colorValue}`, "i");
    const negatedOrPreserved = /\b(?:no|not|never|without|don't|dont|do\s+not|keep|preserve|retain|leave|unchanged|intact)\b/i;
    return clauses.some((clause) => {
      if (negatedOrPreserved.test(clause)) return false;
      return directAction.test(clause) || changeTarget.test(clause) || changeTargetColor.test(clause) || makeColor.test(clause) || setColor.test(clause);
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

  function rgbToHex(red, green, blue) {
    return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`.toUpperCase();
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

  function removeExteriorSpecks(data, width, height, maximumArtifactCells) {
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
      if (touches && component.length <= maximumArtifactCells) {
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

  function cleanIsolatedNeutralShading(data, width, height, anchoredWhiteMask, anchoredBlackMask, maximumCells = 16) {
    const counts = new Map();
    for (let point = 0; point < width * height; point++) {
      const offset = point * 4;
      if (data[offset + 3] === 0 || anchoredWhiteMask[point] || anchoredBlackMask[point]) continue;
      const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
      if (red !== green || green !== blue || red === 0 || red === 255) continue;
      counts.set(red, (counts.get(red) || 0) + 1);
    }
    if (!counts.size) return;
    const base = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0][0];
    const visited = new Uint8Array(width * height);
    const isWhite = (point) => data[point * 4] === 255 && data[point * 4 + 1] === 255 && data[point * 4 + 2] === 255 && data[point * 4 + 3] === 255;
    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || data[start * 4 + 3] === 0) continue;
      const offset = start * 4;
      const shade = data[offset];
      if (data[offset + 1] !== shade || data[offset + 2] !== shade || shade === 0 || shade === 255 || shade === base) continue;
      const component = [], queue = [start];
      visited[start] = 1;
      let touchesWhite = false;
      for (let head = 0; head < queue.length; head++) {
        const point = queue[head];
        component.push(point);
        const x = point % width, y = Math.floor(point / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (isWhite(neighbor) || anchoredWhiteMask[neighbor]) touchesWhite = true;
          if (!visited[neighbor]) {
            const next = neighbor * 4;
            if (data[next + 3] !== 0 && data[next] === shade && data[next + 1] === shade && data[next + 2] === shade) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
      }
      if (!touchesWhite && component.length <= maximumCells) {
        for (const point of component) data.set([base, base, base, 255], point * 4);
      }
    }
  }

  function canonicalizeAlphaMask(source, canonical, width, height, threshold) {
    if (!canonical || canonical.length !== width * height * 4) {
      throw new Error("Canonical alpha mask dimensions must match the working grid");
    }
    const data = new Uint8ClampedArray(source.length);
    for (let offset = 0; offset < data.length; offset += 4) {
      if (canonical[offset + 3] < threshold) continue;
      if (source[offset + 3] >= threshold) data.set(source.subarray(offset, offset + 3), offset);
      data[offset + 3] = 255;
    }
    enforceExteriorOutline(data, width, height);
    return data;
  }

  function usedColors(data, palette) {
    const used = new Set();
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] !== 0) used.add(`#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2].toString(16).padStart(2, "0")}`.toUpperCase());
    }
    return palette.filter((hex) => used.has(hex));
  }

  function verify(data, width, height, options = {}, config, palette, maxColors) {
    const errors = [];
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width !== height || !data || data.length !== width * height * 4) {
      return ["Invalid dimensions: expected a square RGBA buffer"];
    }
    const grid = options && options.grid === undefined ? config.grid.default : options.grid;
    if (!config.grid.allowed.includes(grid) || grid !== width || grid !== height) errors.push("Unsupported grid: use an approved square working grid");
    const paletteSet = new Set(palette);
    const alphaMask = options && options.alphaMask;
    const anchoredWhiteMask = options && options.anchoredWhiteMask;
    const anchoredBlackMask = options && options.anchoredBlackMask;
    if (alphaMask && alphaMask.length !== data.length) errors.push("Invalid source alpha mask");
    if (anchoredWhiteMask && anchoredWhiteMask.length !== width * height) errors.push("Invalid anchored white mask");
    if (anchoredBlackMask && anchoredBlackMask.length !== width * height) errors.push("Invalid anchored black mask");
    const colors = new Set();
    let alphaReported = false;
    let silhouetteReported = false;
    let anchoredWhiteReported = false;
    let anchoredBlackReported = false;
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
      const point = offset / 4;
      if (!anchoredWhiteReported && anchoredWhiteMask && anchoredWhiteMask.length === width * height && anchoredWhiteMask[point]) {
        if (data[offset] !== 255 || data[offset + 1] !== 255 || data[offset + 2] !== 255 || alpha !== 255) {
          errors.push(`Anchored white detail mismatch at pixel ${point}`);
          anchoredWhiteReported = true;
        }
      }
      if (!anchoredBlackReported && anchoredBlackMask && anchoredBlackMask.length === width * height && anchoredBlackMask[point]) {
        if (data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0 || alpha !== 255) {
          errors.push(`Anchored black detail mismatch at pixel ${point}`);
          anchoredBlackReported = true;
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
    if (colors.size > maxColors) errors.push(`Too many opaque colors: ${colors.size}`);
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
