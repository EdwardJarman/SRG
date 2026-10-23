import { BedLayout, GardenLayout, PlacedPlant } from "./layout";
import { PlantModel } from "./plantModel";

const TAU = Math.PI * 2;

type RGB = [number, number, number];

export interface GardenPalette {
  ground: string;
  bedFill: string;
  bedStroke: string;
  bedLabel: string;
  bedCount: string;
  soil: string;
  seed: string;
  seedShade: string;
  stem: string;
  leaf: string;
  wiltStem: string;
  wiltLeaf: string;
  wiltPetal: string;
  missingStem: string;
  missingLeaf: string;
  missingHalo: string;
  missingMark: string;
  hover: string;
  dot: string;
  shadow: string;
}

export function paletteForTheme(dark: boolean): GardenPalette {
  return dark
    ? {
        ground: "#101410",
        bedFill: "rgba(255,255,255,0.045)",
        bedStroke: "rgba(150,190,140,0.22)",
        bedLabel: "#9dbf94",
        bedCount: "rgba(157,191,148,0.55)",
        soil: "#6b4f38",
        seed: "#d9b062",
        seedShade: "rgba(255,255,255,0.35)",
        stem: "#5fb86a",
        leaf: "#6fc87a",
        wiltStem: "#9c8448",
        wiltLeaf: "#a89253",
        wiltPetal: "#b9a06a",
        missingStem: "#8b9690",
        missingLeaf: "#98a49d",
        missingHalo: "rgba(170,190,180,0.5)",
        missingMark: "rgba(220,235,225,0.75)",
        hover: "rgba(255,196,90,0.9)",
        dot: "rgba(255,255,255,0.045)",
        shadow: "rgba(0,0,0,0.35)",
      }
    : {
        ground: "#eef2e6",
        bedFill: "rgba(255,255,255,0.6)",
        bedStroke: "rgba(90,120,80,0.35)",
        bedLabel: "#57684b",
        bedCount: "rgba(87,104,75,0.6)",
        soil: "#c9a06f",
        seed: "#c98f2e",
        seedShade: "rgba(255,255,255,0.55)",
        stem: "#3f8f4b",
        leaf: "#4fa35a",
        wiltStem: "#a08a4f",
        wiltLeaf: "#b09a58",
        wiltPetal: "#bda065",
        missingStem: "#8a9188",
        missingLeaf: "#97a093",
        missingHalo: "rgba(95,110,95,0.5)",
        missingMark: "rgba(70,80,70,0.65)",
        hover: "rgba(230,140,30,0.95)",
        dot: "rgba(0,0,0,0.055)",
        shadow: "rgba(0,0,0,0.14)",
      };
}

export interface GardenRenderOptions {
  layout: GardenLayout;
  palette: GardenPalette;
  width: number;
  height: number;
  panX: number;
  panY: number;
  zoom: number;
  hoverId: string | null;
  timeMs: number;
  reduceMotion: boolean;
  fontFamily?: string;
}

export function renderGarden(ctx: CanvasRenderingContext2D, options: GardenRenderOptions): void {
  const { layout, palette, width, height, panX, panY, zoom } = options;
  const fontFamily = options.fontFamily ?? "system-ui, -apple-system, sans-serif";

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, width, height);
  drawDotGrid(ctx, width, height, panX, panY, palette.dot);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  for (const bed of layout.beds) drawBed(ctx, bed, palette, fontFamily);

  const time = options.reduceMotion ? 0 : options.timeMs / 1000;
  for (const bed of layout.beds) {
    for (const plant of bed.plants) {
      drawPlant(ctx, plant, palette, time, options.reduceMotion, options.hoverId === plant.model.card.id);
    }
  }

  ctx.restore();
}

export function findPlantAt(layout: GardenLayout, x: number, y: number, minRadius = 20): PlacedPlant | null {
  let best: PlacedPlant | null = null;
  let bestDist = Infinity;
  for (const bed of layout.beds) {
    if (x < bed.x - 12 || y < bed.y - 12 || x > bed.x + bed.width + 12 || y > bed.y + bed.height + 12) {
      continue;
    }
    for (const plant of bed.plants) {
      const dx = plant.x - x;
      const dy = plant.y - 14 - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = Math.max(plant.radius, minRadius);
      if (dist <= hitRadius && dist < bestDist) {
        best = plant;
        bestDist = dist;
      }
    }
  }
  return best;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  panX: number,
  panY: number,
  color: string,
): void {
  const step = 44;
  const ox = ((panX % step) + step) % step;
  const oy = ((panY % step) + step) % step;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = ox + step / 2; x < width; x += step) {
    for (let y = oy + step / 2; y < height; y += step) {
      ctx.moveTo(x + 1.2, y);
      ctx.arc(x, y, 1.2, 0, TAU);
    }
  }
  ctx.fill();
}

function drawBed(
  ctx: CanvasRenderingContext2D,
  bed: BedLayout,
  palette: GardenPalette,
  fontFamily: string,
): void {
  ctx.save();
  roundedRectPath(ctx, bed.x, bed.y, bed.width, bed.height, 14);
  ctx.fillStyle = palette.bedFill;
  ctx.fill();
  ctx.strokeStyle = palette.bedStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `600 12px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = palette.bedLabel;
  const countLabel = `${bed.plants.length}`;
  const countWidth = Math.max(14, ctx.measureText(countLabel).width + 6);
  const labelX = bed.x + 14;
  const labelY = bed.y + 15;
  const label = fitLabel(ctx, bed.name, bed.width - 28 - countWidth - 8);
  ctx.fillText(label, labelX, labelY);

  ctx.textAlign = "right";
  ctx.fillStyle = palette.bedCount;
  ctx.fillText(countLabel, bed.x + bed.width - 14, labelY);
  ctx.restore();
}

function fitLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 10) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}\u2026`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}\u2026`;
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  plant: PlacedPlant,
  palette: GardenPalette,
  time: number,
  reduceMotion: boolean,
  hovered: boolean,
): void {
  const model = plant.model;
  const missing = model.condition === "missing";
  const wilt = !missing && model.condition === "wilting";
  const bloom = !missing && model.condition === "blooming";

  ctx.save();
  ctx.translate(plant.x, plant.y);
  if (missing) ctx.globalAlpha = 0.55;
  else if (model.card.suspended) ctx.globalAlpha = 0.45;

  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 13 * model.size, 4.5, 0, 0, TAU);
  ctx.fill();

  if (bloom) drawBloomRing(ctx, model, time, reduceMotion);

  if (missing) {
    drawMissingPlant(ctx, model, palette, reduceMotion);
  } else {
    const sway =
      reduceMotion || model.stage === "seed" ? 0 : Math.sin(time * model.swaySpeed * 1.7 + model.swayPhase);
    const droop = wilt ? 1 : 0;
    const bend = model.seed % 2 === 0 ? 1 : -1;

    if (model.stage === "seed") {
      drawSeed(ctx, palette, wilt);
    } else {
      const stemColor = wilt ? palette.wiltStem : palette.stem;
      const leafColor = wilt ? palette.wiltLeaf : palette.leaf;
      drawStem(ctx, model, sway, droop, bend, stemColor);
      const top = stemTop(model, sway, droop, bend);

      if (model.stage === "sprout") {
        drawLeaf(ctx, top.x * 0.7, top.y * 0.75, 1, 7 * model.size, leafColor);
        drawLeaf(ctx, top.x * 0.7, top.y * 0.75, -1, 7 * model.size, leafColor);
      } else if (model.stage === "growing") {
        const p1 = quadPoint([0, 0], [top.x * 0.25, top.y * 0.55], [top.x, top.y], 0.45);
        const p2 = quadPoint([0, 0], [top.x * 0.25, top.y * 0.55], [top.x, top.y], 0.78);
        drawLeaf(ctx, p1[0], p1[1], 1, 9 * model.size, leafColor);
        drawLeaf(ctx, p2[0], p2[1], -1, 9 * model.size, leafColor);
        ctx.fillStyle = wilt ? palette.wiltPetal : mixCss(leafColor, rgbCss(petalRgb(model.hue, wilt)), 0.45);
        ctx.beginPath();
        ctx.arc(top.x, top.y, 4 * model.size, 0, TAU);
        ctx.fill();
      } else {
        const base = quadPoint([0, 0], [top.x * 0.25, top.y * 0.55], [top.x, top.y], 0.35);
        const mid = quadPoint([0, 0], [top.x * 0.25, top.y * 0.55], [top.x, top.y], 0.62);
        const upper = quadPoint([0, 0], [top.x * 0.25, top.y * 0.55], [top.x, top.y], 0.85);
        drawLeaf(ctx, base[0], base[1], 1, 10 * model.size, leafColor);
        drawLeaf(ctx, mid[0], mid[1], -1, 10 * model.size, leafColor);
        drawLeaf(ctx, upper[0], upper[1], 1, 8 * model.size, leafColor);

        const petals = model.card.reps >= 8 ? 6 : 5;
        const flowerR = (model.card.reps >= 8 ? 12 : 10.5) * model.size;
        drawFlower(ctx, top.x, top.y, flowerR, petals, model, wilt, time, reduceMotion);
        if (wilt) drawFallenPetals(ctx, palette);
      }
    }
  }

  if (hovered) {
    ctx.strokeStyle = palette.hover;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, -12, 25 * model.size, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawMissingPlant(
  ctx: CanvasRenderingContext2D,
  model: PlantModel,
  palette: GardenPalette,
  reduceMotion: boolean,
): void {
  const sway = reduceMotion ? 0 : Math.sin(model.swayPhase) * 1.5;
  const height = Math.max(18, stemHeight(model) * 0.72);

  ctx.strokeStyle = palette.missingHalo;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.arc(0, -height * 0.45, 19 + model.size * 5, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = palette.missingStem;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(sway * 0.3, -height * 0.55, sway + 4, -height);
  ctx.stroke();

  drawLeaf(ctx, sway + 1, -height * 0.62, 1, 6.5 * model.size, palette.missingLeaf);
  drawLeaf(ctx, sway + 2.5, -height * 0.42, -1, 5.8 * model.size, palette.missingLeaf);

  ctx.strokeStyle = palette.missingMark;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sway + 0.5, -height - 3);
  ctx.lineTo(sway + 7.5, -height + 4);
  ctx.moveTo(sway + 7.5, -height - 3);
  ctx.lineTo(sway + 0.5, -height + 4);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function stemHeight(model: PlantModel): number {
  if (model.stage === "sprout") return 13 * model.size;
  if (model.stage === "growing") return 24 * model.size;
  const extra = Math.min(model.card.reps - 4, 8) * 1.6;
  return (32 + extra) * model.size;
}

function stemTop(model: PlantModel, sway: number, droop: number, bend: number): { x: number; y: number } {
  const h = stemHeight(model);
  const x = sway * 3.5 + droop * bend * 13;
  const y = -h * (1 - droop * 0.5);
  return { x, y };
}

function drawStem(
  ctx: CanvasRenderingContext2D,
  model: PlantModel,
  sway: number,
  droop: number,
  bend: number,
  color: string,
): void {
  const { x, y } = stemTop(model, sway, droop, bend);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(x * 0.25, y * 0.55, x, y);
  ctx.stroke();
}

function drawSeed(ctx: CanvasRenderingContext2D, palette: GardenPalette, wilt: boolean): void {
  ctx.fillStyle = palette.soil;
  ctx.beginPath();
  ctx.ellipse(0, -1, 10.5, 4.4, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(0, -3.6);
  ctx.rotate(-0.45);
  ctx.fillStyle = wilt ? mixCss(palette.seed, palette.wiltLeaf, 0.5) : palette.seed;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.6, 3.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = palette.seedShade;
  ctx.beginPath();
  ctx.ellipse(-1.4, -1.2, 2.1, 1.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 1 | -1,
  length: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir === 1 ? -0.5 : Math.PI + 0.5);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(length * 0.5, 0, length * 0.55, length * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  petals: number,
  model: PlantModel,
  wilt: boolean,
  time: number,
  reduceMotion: boolean,
): void {
  const petal = petalRgb(model.hue, wilt);
  const center = wilt ? mixCss(petalCss(petal), "#8a6a2f", 0.5) : petalCss(hslToRgb(model.hue + 34, 75, 55));
  const rot = ((model.seed % 360) / 360) * TAU + (reduceMotion ? 0 : Math.sin(time * 0.5 + model.swayPhase) * 0.08);

  ctx.fillStyle = petalCss(petal);
  for (let i = 0; i < petals; i++) {
    const angle = rot + (i / petals) * TAU;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.7, radius * 0.4, radius * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.42, 0, TAU);
  ctx.fill();
}

function drawFallenPetals(ctx: CanvasRenderingContext2D, palette: GardenPalette): void {
  ctx.fillStyle = palette.wiltPetal;
  ctx.save();
  ctx.translate(-9, -1.5);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.6, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(8, 0.5);
  ctx.rotate(0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, 5, 2.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBloomRing(
  ctx: CanvasRenderingContext2D,
  model: PlantModel,
  time: number,
  reduceMotion: boolean,
): void {
  const pulse = reduceMotion ? 0.5 : (Math.sin(time * 2.4 + model.swayPhase) + 1) / 2;
  const radius = (16 + pulse * 5) * model.size;
  ctx.strokeStyle = rgbaCss(hslToRgb(model.hue, 70, 62), 0.3 + pulse * 0.4);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -8, radius, 0, TAU);
  ctx.stroke();
}

function quadPoint(
  p0: [number, number],
  cp: [number, number],
  p1: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * cp[0] + t * t * p1[0],
    u * u * p0[1] + 2 * u * t * cp[1] + t * t * p1[1],
  ];
}

function petalRgb(hue: number, wilt: boolean): RGB {
  const base = hslToRgb(hue, wilt ? 34 : 64, wilt ? 58 : 62);
  return wilt ? mixRgb(base, [170, 150, 100], 0.55) : base;
}

function petalCss(rgb: RGB): string {
  return rgbCss(rgb);
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbCss(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function rgbaCss(rgb: RGB, alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function parseCssColor(color: string): RGB | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function mixCss(a: string, b: string, t: number): string {
  const ra = parseCssColor(a);
  const rb = parseCssColor(b);
  if (!ra || !rb) return a;
  return rgbCss(mixRgb(ra, rb, t));
}
