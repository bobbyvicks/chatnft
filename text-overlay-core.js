/**
 * Composite a transparent text sprite over artwork without resampling either
 * buffer. Fully transparent sprite pixels are skipped, so every byte outside
 * the visible text remains identical to the source artwork.
 */
function applyTextOverlay(
  base,
  baseWidth,
  baseHeight,
  overlay,
  overlayWidth,
  overlayHeight,
  offsetX = 0,
  offsetY = 0,
) {
  assertImageBuffer("base", base, baseWidth, baseHeight);
  assertImageBuffer("overlay", overlay, overlayWidth, overlayHeight);
  if (!Number.isInteger(offsetX) || !Number.isInteger(offsetY)) {
    throw new TypeError("text overlay offsets must be whole pixels");
  }

  const output = new Uint8ClampedArray(base);

  for (let sy = 0; sy < overlayHeight; sy += 1) {
    const dy = sy + offsetY;
    if (dy < 0 || dy >= baseHeight) continue;

    for (let sx = 0; sx < overlayWidth; sx += 1) {
      const dx = sx + offsetX;
      if (dx < 0 || dx >= baseWidth) continue;

      const si = (sy * overlayWidth + sx) * 4;
      const sourceAlphaByte = overlay[si + 3];
      if (sourceAlphaByte === 0) continue;

      const di = (dy * baseWidth + dx) * 4;
      if (sourceAlphaByte === 255) {
        output[di] = overlay[si];
        output[di + 1] = overlay[si + 1];
        output[di + 2] = overlay[si + 2];
        output[di + 3] = 255;
        continue;
      }

      const sourceAlpha = sourceAlphaByte / 255;
      const baseAlpha = output[di + 3] / 255;
      const outputAlpha = sourceAlpha + baseAlpha * (1 - sourceAlpha);

      for (let channel = 0; channel < 3; channel += 1) {
        output[di + channel] = outputAlpha === 0
          ? 0
          : Math.round(
            (overlay[si + channel] * sourceAlpha
              + output[di + channel] * baseAlpha * (1 - sourceAlpha))
            / outputAlpha,
          );
      }
      output[di + 3] = Math.round(outputAlpha * 255);
    }
  }

  return output;
}

function applyTextOverlays(base, baseWidth, baseHeight, patches) {
  assertImageBuffer("base", base, baseWidth, baseHeight);
  if (!Array.isArray(patches)) throw new TypeError("text patches must be an array");
  return patches.reduce((output, patch) => {
    if (!patch || typeof patch !== "object") throw new TypeError("each text patch must be an object");
    return applyTextOverlay(
      output,
      baseWidth,
      baseHeight,
      patch.data,
      patch.width,
      patch.height,
      patch.x,
      patch.y,
    );
  }, new Uint8ClampedArray(base));
}

function hitTestTextPatches(patches, x, y) {
  if (!Array.isArray(patches)) throw new TypeError("text patches must be an array");
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new TypeError("text hit-test coordinates must be whole pixels");
  }
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index];
    if (!patch || typeof patch !== "object") continue;
    assertImageBuffer("text patch", patch.data, patch.width, patch.height);
    const localX = x - patch.x;
    const localY = y - patch.y;
    if (localX < 0 || localY < 0 || localX >= patch.width || localY >= patch.height) continue;
    if (patch.data[(localY * patch.width + localX) * 4 + 3] !== 0) return patch;
  }
  return null;
}

function assertImageBuffer(label, data, width, height) {
  if (!Number.isInteger(width) || width < 0 || !Number.isInteger(height) || height < 0) {
    throw new TypeError(`${label} dimensions must be non-negative whole pixels`);
  }
  if (!(data instanceof Uint8ClampedArray)) {
    throw new TypeError(`${label} buffer must be a Uint8ClampedArray`);
  }
  const expected = width * height * 4;
  if (data.length !== expected) {
    throw new RangeError(`${label} buffer length ${data.length} does not match ${expected}`);
  }
}

/**
 * Replace only visible pixels that differ from the selected garment colour
 * inside an explicit text box. Pixels outside the box (for example a hoodie
 * strap) are never inspected or changed.
 */
function clearNonMatchingPixelsInBox(
  base,
  baseWidth,
  baseHeight,
  boxX,
  boxY,
  boxWidth,
  boxHeight,
  replacement,
) {
  assertImageBuffer("base", base, baseWidth, baseHeight);
  for (const [label, value] of Object.entries({ boxX, boxY, boxWidth, boxHeight })) {
    if (!Number.isInteger(value)) throw new TypeError(`${label} must be a whole pixel`);
  }
  if (boxWidth < 0 || boxHeight < 0) {
    throw new RangeError("text cleanup box dimensions must be non-negative");
  }
  if (!Array.isArray(replacement) || replacement.length !== 4
      || replacement.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new TypeError("text cleanup colour must be four byte values");
  }

  const output = new Uint8ClampedArray(base);
  const minX = Math.max(0, boxX);
  const minY = Math.max(0, boxY);
  const maxX = Math.min(baseWidth, boxX + boxWidth);
  const maxY = Math.min(baseHeight, boxY + boxHeight);
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const i = (y * baseWidth + x) * 4;
      if (output[i + 3] === 0) continue;
      if (output[i] === replacement[0] && output[i + 1] === replacement[1]
          && output[i + 2] === replacement[2] && output[i + 3] === replacement[3]) continue;
      output[i] = replacement[0];
      output[i + 1] = replacement[1];
      output[i + 2] = replacement[2];
      output[i + 3] = replacement[3];
    }
  }
  return output;
}

const PIXEL_GLYPHS = {
  " ":["00000","00000","00000","00000","00000","00000","00000"],
  "?":["01110","10001","00001","00010","00100","00000","00100"],
  A:["01110","10001","10001","11111","10001","10001","10001"],
  B:["11110","10001","10001","11110","10001","10001","11110"],
  C:["01111","10000","10000","10000","10000","10000","01111"],
  D:["11110","10001","10001","10001","10001","10001","11110"],
  E:["11111","10000","10000","11110","10000","10000","11111"],
  F:["11111","10000","10000","11110","10000","10000","10000"],
  G:["01111","10000","10000","10111","10001","10001","01111"],
  H:["10001","10001","10001","11111","10001","10001","10001"],
  I:["11111","00100","00100","00100","00100","00100","11111"],
  J:["00111","00010","00010","00010","10010","10010","01100"],
  K:["10001","10010","10100","11000","10100","10010","10001"],
  L:["10000","10000","10000","10000","10000","10000","11111"],
  M:["10001","11011","10101","10101","10001","10001","10001"],
  N:["10001","11001","10101","10011","10001","10001","10001"],
  O:["01110","10001","10001","10001","10001","10001","01110"],
  P:["11110","10001","10001","11110","10000","10000","10000"],
  Q:["01110","10001","10001","10001","10101","10010","01101"],
  R:["11110","10001","10001","11110","10100","10010","10001"],
  S:["01111","10000","10000","01110","00001","00001","11110"],
  T:["11111","00100","00100","00100","00100","00100","00100"],
  U:["10001","10001","10001","10001","10001","10001","01110"],
  V:["10001","10001","10001","10001","10001","01010","00100"],
  W:["10001","10001","10001","10101","10101","10101","01010"],
  X:["10001","10001","01010","00100","01010","10001","10001"],
  Y:["10001","10001","01010","00100","00100","00100","00100"],
  Z:["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"],
  "1":["00100","01100","00100","00100","00100","00100","01110"],
  "2":["01110","10001","00001","00010","00100","01000","11111"],
  "3":["11110","00001","00001","01110","00001","00001","11110"],
  "4":["00010","00110","01010","10010","11111","00010","00010"],
  "5":["11111","10000","10000","11110","00001","00001","11110"],
  "6":["01110","10000","10000","11110","10001","10001","01110"],
  "7":["11111","00001","00010","00100","01000","01000","01000"],
  "8":["01110","10001","10001","01110","10001","10001","01110"],
  "9":["01110","10001","10001","01111","00001","00001","01110"],
  a:["00000","00000","01110","00001","01111","10001","01111"],
  h:["10000","10000","10110","11001","10001","10001","10001"],
  i:["00100","00000","01100","00100","00100","00100","01110"],
  m:["00000","00000","11010","10101","10101","10101","10101"],
  o:["00000","00000","01110","10001","10001","10001","01110"],
  s:["00000","00000","01111","10000","01110","00001","11110"],
  t:["00100","00100","11111","00100","00100","00100","00011"],
};

const COMPACT_GLYPHS = {
  " ":["000","000","000","000","000"],
  "?":["110","001","010","000","010"],
  A:["010","101","111","101","101"],
  B:["110","101","110","101","110"],
  C:["011","100","100","100","011"],
  D:["110","101","101","101","110"],
  E:["111","100","110","100","111"],
  F:["111","100","110","100","100"],
  G:["011","100","101","101","011"],
  H:["101","101","111","101","101"],
  I:["111","010","010","010","111"],
  J:["001","001","001","101","010"],
  K:["101","101","110","101","101"],
  L:["100","100","100","100","111"],
  M:["101","111","111","101","101"],
  N:["101","111","111","111","101"],
  O:["010","101","101","101","010"],
  P:["110","101","110","100","100"],
  Q:["010","101","101","111","011"],
  R:["110","101","110","101","101"],
  S:["011","100","010","001","110"],
  T:["111","010","010","010","010"],
  U:["101","101","101","101","111"],
  V:["101","101","101","101","010"],
  W:["101","101","111","111","101"],
  X:["101","101","010","101","101"],
  Y:["101","101","010","010","010"],
  Z:["111","001","010","100","111"],
  "0":["111","101","101","101","111"],
  "1":["010","110","010","010","111"],
  "2":["110","001","010","100","111"],
  "3":["110","001","010","001","110"],
  "4":["101","101","111","001","001"],
  "5":["111","100","110","001","110"],
  "6":["011","100","111","101","111"],
  "7":["111","001","010","010","010"],
  "8":["111","101","111","101","111"],
  "9":["111","101","111","001","110"],
};

function arcadeGlyph(rows) {
  const center = Math.floor(rows.length / 2);
  return rows.map((row, y) => {
    if (y !== center || row.length < 3) return row;
    const bits = [...row];
    const middle = Math.floor(bits.length / 2);
    if (bits.filter(bit => bit === "1").length >= 4 && bits[middle] === "1") bits[middle] = "0";
    return bits.join("");
  });
}

function roundedGlyph(rows) {
  return rows.map((row, y) => {
    if (y !== 0 && y !== rows.length - 1) return row;
    const bits = [...row];
    if (bits.filter(bit => bit === "1").length >= 3) {
      bits[0] = "0";
      bits[bits.length - 1] = "0";
    }
    return bits.join("");
  });
}

function stencilGlyph(rows) {
  const center = Math.floor(rows.length / 2);
  return rows.map((row, y) => {
    if (y !== center || y === 0 || y === rows.length - 1) return row;
    const above = rows[y - 1], below = rows[y + 1], bits = [...row];
    for (let x = 0; x < bits.length; x += 1) {
      if (bits[x] === "1" && above[x] === "1" && below[x] === "1") bits[x] = "0";
    }
    return bits.join("");
  });
}

const PIXEL_FONTS = {
  classic:{id:"classic",name:"Classic 5×7",width:5,height:7,glyphs:PIXEL_GLYPHS},
  compact:{id:"compact",name:"Compact 3×5",width:3,height:5,glyphs:COMPACT_GLYPHS},
  arcade:{id:"arcade",name:"Arcade 5×7",width:5,height:7,glyphs:PIXEL_GLYPHS,transform:arcadeGlyph},
  rounded:{id:"rounded",name:"Rounded 5×7",width:5,height:7,glyphs:PIXEL_GLYPHS,transform:roundedGlyph},
  stencil:{id:"stencil",name:"Stencil 5×7",width:5,height:7,glyphs:PIXEL_GLYPHS,transform:stencilGlyph},
};

function listPixelFonts() {
  return Object.values(PIXEL_FONTS).map(({id,name,width,height})=>({id,name,width,height}));
}

function pixelFontGlyph(font, char) {
  const rows=font.glyphs[char]||font.glyphs[char.toUpperCase()]||font.glyphs["?"];
  return font.transform?font.transform(rows):rows;
}

function readTextRenderOptions(scaleOrOptions, legacyLineGap) {
  if (typeof scaleOrOptions === "number" || scaleOrOptions == null) {
    const scale = scaleOrOptions == null ? 1 : scaleOrOptions;
    if (!Number.isInteger(scale) || scale < 1) {
      throw new TypeError("pixel text scale must be a positive whole number");
    }
    if (!Number.isInteger(legacyLineGap) || legacyLineGap < 0) {
      throw new TypeError("pixel text line gap must be a non-negative whole number");
    }
    return {
      pixelWidth: scale,
      pixelHeight: scale,
      letterSpacing: scale,
      lineSpacing: legacyLineGap * scale,
      align: "left",
      bold: 0,
      lean: 0,
      slope: 0,
      outlineSize: 0,
      outlineColor: [0, 0, 0, 255],
      shadowEnabled: false,
      shadowOffsetX: 1,
      shadowOffsetY: 1,
      shadowColor: [0, 0, 0, 255],
      wrapX: 0,
      wrapY: 0,
      font: "classic",
    };
  }
  if (typeof scaleOrOptions !== "object" || Array.isArray(scaleOrOptions)) {
    throw new TypeError("pixel text options must be an object");
  }
  const options = {
    pixelWidth: scaleOrOptions.pixelWidth ?? 1,
    pixelHeight: scaleOrOptions.pixelHeight ?? scaleOrOptions.pixelWidth ?? 1,
    letterSpacing: scaleOrOptions.letterSpacing ?? scaleOrOptions.pixelWidth ?? 1,
    lineSpacing: scaleOrOptions.lineSpacing ?? scaleOrOptions.pixelHeight ?? 1,
    align: scaleOrOptions.align ?? "left",
    bold: scaleOrOptions.bold ?? 0,
    lean: scaleOrOptions.lean ?? 0,
    slope: scaleOrOptions.slope ?? 0,
    outlineSize: scaleOrOptions.outlineSize ?? 0,
    outlineColor: scaleOrOptions.outlineColor ?? [0, 0, 0, 255],
    shadowEnabled: scaleOrOptions.shadowEnabled ?? false,
    shadowOffsetX: scaleOrOptions.shadowOffsetX ?? 1,
    shadowOffsetY: scaleOrOptions.shadowOffsetY ?? 1,
    shadowColor: scaleOrOptions.shadowColor ?? [0, 0, 0, 255],
    wrapX: scaleOrOptions.wrapX ?? 0,
    wrapY: scaleOrOptions.wrapY ?? 0,
    font: scaleOrOptions.font ?? "classic",
  };
  for (const key of ["pixelWidth", "pixelHeight"]) {
    if (!Number.isFinite(options[key]) || options[key] < 1) {
      throw new TypeError(`${key} must be a positive number`);
    }
  }
  for (const key of ["letterSpacing", "lineSpacing"]) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new TypeError(`${key} must be a non-negative number`);
    }
  }
  for (const key of ["bold", "outlineSize"]) {
    if (!Number.isInteger(options[key]) || options[key] < 0) {
      throw new TypeError(`${key} must be a non-negative whole pixel`);
    }
  }
  for (const key of ["lean", "slope", "shadowOffsetX", "shadowOffsetY", "wrapX", "wrapY"]) {
    if (!Number.isFinite(options[key])) throw new TypeError(`${key} must be a finite number`);
  }
  if (typeof options.shadowEnabled !== "boolean") {
    throw new TypeError("shadowEnabled must be true or false");
  }
  if (!["left", "center", "right"].includes(options.align)) {
    throw new TypeError("pixel text alignment must be left, center, or right");
  }
  if (!Object.hasOwn(PIXEL_FONTS, options.font)) {
    throw new TypeError(`pixel text font is unknown: ${options.font}`);
  }
  if (!Array.isArray(options.outlineColor) || options.outlineColor.length !== 4 ||
      options.outlineColor.some(v=>!Number.isInteger(v)||v<0||v>255)) {
    throw new TypeError("pixel text outline colour must be four byte values");
  }
  if (!Array.isArray(options.shadowColor) || options.shadowColor.length !== 4 ||
      options.shadowColor.some(v=>!Number.isInteger(v)||v<0||v>255)) {
    throw new TypeError("pixel text shadow colour must be four byte values");
  }
  return options;
}

function renderPixelText(text, rgba, scaleOrOptions = 1, legacyLineGap = 1) {
  if (!Array.isArray(rgba) || rgba.length !== 4 || rgba.some(v=>!Number.isInteger(v)||v<0||v>255)) {
    throw new TypeError("pixel text colour must be four byte values");
  }
  const options = readTextRenderOptions(scaleOrOptions, legacyLineGap);
  const font=PIXEL_FONTS[options.font];
  const lines=String(text||"").replace(/\r/g,"").split("\n");
  if(!lines.some(line=>line.length)) throw new TypeError("pixel text cannot be empty");
  const lineWidths=lines.map(line=>line.length
    ? Math.round(line.length*font.width*options.pixelWidth+(line.length-1)*options.letterSpacing)
    : 0);
  const baseWidth=Math.max(...lineWidths);
  const baseHeight=Math.round(lines.length*font.height*options.pixelHeight+(lines.length-1)*options.lineSpacing);
  const inkWidth=baseWidth+options.bold;
  const inkHeight=baseHeight+options.bold;
  const ink=new Uint8ClampedArray(inkWidth*inkHeight*4);
  lines.forEach((line,lineIndex)=>{
    const yStart=lineIndex*(font.height*options.pixelHeight+options.lineSpacing);
    const spare=baseWidth-lineWidths[lineIndex];
    const lineStart=options.align==="right"?spare:options.align==="center"?Math.floor(spare/2):0;
    [...line].forEach((char,charIndex)=>{
      const glyph=pixelFontGlyph(font,char);
      const xStart=lineStart+charIndex*(font.width*options.pixelWidth+options.letterSpacing);
      glyph.forEach((row,gy)=>{
        [...row].forEach((bit,gx)=>{
          if(bit!=="1") return;
          const startX=Math.round(xStart+gx*options.pixelWidth);
          const endX=Math.max(startX+1,Math.round(xStart+(gx+1)*options.pixelWidth));
          const startY=Math.round(yStart+gy*options.pixelHeight);
          const endY=Math.max(startY+1,Math.round(yStart+(gy+1)*options.pixelHeight));
          for(let sourceY=startY;sourceY<endY;sourceY++) for(let sourceX=startX;sourceX<endX;sourceX++){
            for(let by=0;by<=options.bold;by++) for(let bx=0;bx<=options.bold;bx++){
              const x=sourceX+bx, y=sourceY+by;
              const i=(y*inkWidth+x)*4;
              ink[i]=rgba[0]; ink[i+1]=rgba[1]; ink[i+2]=rgba[2]; ink[i+3]=rgba[3];
            }
          }
        });
      });
    });
  });
  const xShifts=Array.from({length:inkHeight},(_,y)=>
    inkHeight<=1?0:Math.round(options.lean*(1-y/(inkHeight-1))));
  const yShifts=Array.from({length:inkWidth},(_,x)=>
    inkWidth<=1?0:Math.round(options.slope*x/(inkWidth-1)));
  const minX=Math.min(0,...xShifts), maxX=Math.max(0,...xShifts);
  const minY=Math.min(0,...yShifts), maxY=Math.max(0,...yShifts);
  const width=inkWidth+maxX-minX, height=inkHeight+maxY-minY;
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<inkHeight;y++) for(let x=0;x<inkWidth;x++){
    const source=(y*inkWidth+x)*4;
    if(ink[source+3]===0) continue;
    const xShift=xShifts[y], yShift=yShifts[x];
    const target=((y+yShift-minY)*width+(x+xShift-minX))*4;
    data[target]=ink[source]; data[target+1]=ink[source+1];
    data[target+2]=ink[source+2]; data[target+3]=ink[source+3];
  }
  let completedData=data, completedWidth=width, completedHeight=height;
  if(options.outlineSize>0){
    const outline=options.outlineSize;
    const outlinedWidth=width+outline*2, outlinedHeight=height+outline*2;
    const outlined=new Uint8ClampedArray(outlinedWidth*outlinedHeight*4);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
      const source=(y*width+x)*4;
      if(data[source+3]===0) continue;
      for(let oy=-outline;oy<=outline;oy++) for(let ox=-outline;ox<=outline;ox++){
        const targetY=y+outline+oy, targetX=x+outline+ox;
        const target=(targetY*outlinedWidth+targetX)*4;
        outlined[target]=options.outlineColor[0]; outlined[target+1]=options.outlineColor[1];
        outlined[target+2]=options.outlineColor[2]; outlined[target+3]=options.outlineColor[3];
      }
    }
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
      const source=(y*width+x)*4;
      if(data[source+3]===0) continue;
      const target=((y+outline)*outlinedWidth+x+outline)*4;
      outlined[target]=data[source]; outlined[target+1]=data[source+1];
      outlined[target+2]=data[source+2]; outlined[target+3]=data[source+3];
    }
    completedData=outlined; completedWidth=outlinedWidth; completedHeight=outlinedHeight;
  }
  let output={data:completedData,width:completedWidth,height:completedHeight,contentOffsetX:0,contentOffsetY:0};
  if(options.shadowEnabled){
    const shadowX=Math.round(options.shadowOffsetX), shadowY=Math.round(options.shadowOffsetY);
    const minShadowX=Math.min(0,shadowX), minShadowY=Math.min(0,shadowY);
    const contentOffsetX=Math.max(0,-minShadowX), contentOffsetY=Math.max(0,-minShadowY);
    const shadowOriginX=contentOffsetX+shadowX, shadowOriginY=contentOffsetY+shadowY;
    const shadowWidth=completedWidth+Math.abs(shadowX), shadowHeight=completedHeight+Math.abs(shadowY);
    const shadowData=new Uint8ClampedArray(shadowWidth*shadowHeight*4);
    for(let y=0;y<completedHeight;y++) for(let x=0;x<completedWidth;x++){
      const source=(y*completedWidth+x)*4;
      if(completedData[source+3]===0) continue;
      const target=((y+shadowOriginY)*shadowWidth+x+shadowOriginX)*4;
      shadowData[target]=options.shadowColor[0]; shadowData[target+1]=options.shadowColor[1];
      shadowData[target+2]=options.shadowColor[2];
      shadowData[target+3]=Math.round(options.shadowColor[3]*completedData[source+3]/255);
    }
    output={
      data:applyTextOverlay(
        shadowData,shadowWidth,shadowHeight,
        completedData,completedWidth,completedHeight,contentOffsetX,contentOffsetY,
      ),
      width:shadowWidth,height:shadowHeight,contentOffsetX,contentOffsetY,
    };
  }
  const wrapXShifts=Array.from({length:output.height},(_,y)=>
    output.height<=1?0:Math.round(options.wrapX*(1-y/(output.height-1))));
  const wrapYShifts=Array.from({length:output.width},(_,x)=>
    output.width<=1?0:Math.round(options.wrapY*x/(output.width-1)));
  const wrapMinX=Math.min(0,...wrapXShifts), wrapMaxX=Math.max(0,...wrapXShifts);
  const wrapMinY=Math.min(0,...wrapYShifts), wrapMaxY=Math.max(0,...wrapYShifts);
  if(wrapMinX===0&&wrapMaxX===0&&wrapMinY===0&&wrapMaxY===0) return output;
  const wrappedWidth=output.width+wrapMaxX-wrapMinX;
  const wrappedHeight=output.height+wrapMaxY-wrapMinY;
  const wrappedData=new Uint8ClampedArray(wrappedWidth*wrappedHeight*4);
  for(let y=0;y<output.height;y++) for(let x=0;x<output.width;x++){
    const source=(y*output.width+x)*4;
    if(output.data[source+3]===0) continue;
    const targetX=x+wrapXShifts[y]-wrapMinX;
    const targetY=y+wrapYShifts[x]-wrapMinY;
    const target=(targetY*wrappedWidth+targetX)*4;
    wrappedData[target]=output.data[source]; wrappedData[target+1]=output.data[source+1];
    wrappedData[target+2]=output.data[source+2]; wrappedData[target+3]=output.data[source+3];
  }
  return {
    data:wrappedData,width:wrappedWidth,height:wrappedHeight,
    contentOffsetX:output.contentOffsetX-wrapMinX,
    contentOffsetY:output.contentOffsetY-wrapMinY,
  };
}

globalThis.ChatNftTextOverlay = {
  applyTextOverlay,
  applyTextOverlays,
  clearNonMatchingPixelsInBox,
  hitTestTextPatches,
  listPixelFonts,
  renderPixelText,
};
