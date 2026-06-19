'use client';

import { useEffect, useRef } from 'react';
import PROVINCES from '../data/provinces.json';

const SVG_W = 1000, SVG_H = 834;

// [name, lon, lat, population(thousands)]
const CITIES: [string, number, number, number][] = [
  ['PHNOM PENH',    104.9282, 11.5625, 2282],
  ['SIEM REAP',     103.8590, 13.3633,  700],
  ['BATTAMBANG',    103.2022, 13.0957,  250],
  ['SIHANOUKVILLE', 103.5294, 10.6097,  300],
  ['KAMPONG CHAM',  105.4645, 11.9902,  200],
  ['KAMPONG THOM',  104.8884, 12.7110,  180],
  ['KAMPOT',        104.1814, 10.5930,  130],
  ['KRATIE',        106.0168, 12.4880,  120],
  ['TAKEO',         104.7998, 10.9899,  160],
  ['SVAY RIENG',    105.7998, 11.0870,  100],
  ['PURSAT',        103.9193, 12.5344,  140],
  ['KEP',           104.3167, 10.4833,   50],
  ['SISOPHON',      102.9728, 13.5862,   80],
  ['PREY VENG',     105.3253, 11.4858,  100],
  ['KAMPONG SPEU',  104.5198, 11.4546,   80],
  ['KAMPONG CHHNANG',104.6659,12.2500,   50],
  ['STUNG TRENG',   105.9700, 13.5236,   30],
  ['PAILIN',        102.6095, 12.8489,   35],
  ['KOH KONG',      103.0000, 11.6200,   35],
  ['TBENG MEANCHEY',104.9733, 13.8101,   20],
  ['SAMRAONG',      103.5163, 14.1820,   30],
  ['SUONG',         105.6616, 11.9256,   60],
  ['BANLUNG',       107.0000, 13.7400,   25],
  ['SEN MONOROM',   107.1880, 12.4560,   30],
];

const MAX_POP = 2282;
const popWeight = (pop: number) => Math.sqrt(pop / MAX_POP);

const LON_MIN = 102.35, LON_MAX = 107.63;
const LAT_MIN = 10.41,  LAT_MAX = 14.69;

const SVG_X_MIN = 49.3,  SVG_X_MAX = 948.4;
const SVG_Y_MIN = 181.2, SVG_Y_MAX = 796.3;

function projectToSvg(lon: number, lat: number): [number, number] {
  const x = SVG_X_MIN + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (SVG_X_MAX - SVG_X_MIN);
  const y = SVG_Y_MAX - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (SVG_Y_MAX - SVG_Y_MIN);
  return [x, y];
}

const CITY_TO_PROVINCE: { [key: string]: string } = {
  'PHNOM PENH': 'Phnom Penh',
  'SIEM REAP': 'Siemreap',
  'BATTAMBANG': 'Battambang',
  'SIHANOUKVILLE': 'Preah Sihanouk',
  'KAMPONG CHAM': 'Kampong Cham',
  'KAMPONG THOM': 'Kampong Thom',
  'KAMPOT': 'Kampot',
  'KRATIE': 'Kratie',
  'TAKEO': 'Takeo',
  'SVAY RIENG': 'Svay Rieng',
  'PURSAT': 'Pursat',
  'KEP': 'Kep',
  'SISOPHON': 'Banteay Meanchey',
  'PREY VENG': 'Prey Veng',
  'KAMPONG SPEU': 'Kampong Speu',
  'KAMPONG CHHNANG': 'Kampong Chhnang',
  'STUNG TRENG': 'Stung Treng',
  'PAILIN': 'Pailin',
  'KOH KONG': 'Koh Kong',
  'TBENG MEANCHEY': 'Preah Vihear',
  'SAMRAONG': 'Oddar Meanchey',
  'SUONG': 'Tboung Khmum',
  'BANLUNG': 'Ratanak Kiri',
  'SEN MONOROM': 'Mondul Kiri',
};

function getPathCentroid(path: string): [number, number] {
  const tokens = path.match(/[a-df-z]|-?\d+(\.\d+)?/gi);
  if (!tokens) return [500, 417];
  let cx = 0, cy = 0, count = 0, sx = 0, sy = 0;
  let activeCmd = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/[a-df-z]/i.test(token)) {
      activeCmd = token;
      continue;
    }
    const num1 = parseFloat(token);
    const num2 = parseFloat(tokens[++i]);
    if (activeCmd === "M" || activeCmd === "L") {
      cx = num1; cy = num2;
    } else if (activeCmd === "m") {
      cx += num1; cy += num2;
    } else if (activeCmd === "l") {
      cx += num1; cy += num2;
    } else if (activeCmd === "c") {
      i += 4;
      const num5 = parseFloat(tokens[i-1]);
      const num6 = parseFloat(tokens[i]);
      cx += num5; cy += num6;
    } else if (activeCmd === "C") {
      i += 4;
      const num5 = parseFloat(tokens[i-1]);
      const num6 = parseFloat(tokens[i]);
      cx = num5; cy = num6;
    } else if (activeCmd === "s") {
      i += 2;
      const num3 = parseFloat(tokens[i-1]);
      const num4 = parseFloat(tokens[i]);
      cx += num3; cy += num4;
    } else if (activeCmd === "S") {
      i += 2;
      const num3 = parseFloat(tokens[i-1]);
      const num4 = parseFloat(tokens[i]);
      cx = num3; cy = num4;
    }
    sx += cx; sy += cy;
    count++;
  }
  return count > 0 ? [sx / count, sy / count] : [500, 417];
}



interface LightDot {
  x: number; y: number; r: number;
  alpha: number; flicker: number; phase: number; speed: number;
  lum: number; // grayscale luminance 0–255
  cityIndex: number;
}


function gauss(): number {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}





function knnEdges(coords: [number, number][], k: number): [number, number][] {
  const seen = new Set<string>();
  const result: [number, number][] = [];
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    const sorted = coords
      .map(([x, y], j) => ({ j, d: Math.hypot(x - coords[i][0], y - coords[i][1]) }))
      .filter(e => e.j !== i)
      .sort((a, b) => a.d - b.d);
    
    const targets = sorted.slice(0, k);
    targets.forEach(({ j }) => {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push([i, j]);
      }
    });
  }
  return result;
}

function genSparkline(n: number): number[] {
  const a: number[] = []; let v = 0.4;
  for (let i = 0; i < n; i++) {
    v = Math.max(0.05, Math.min(0.95, v + (Math.random() - 0.49) * 0.18));
    a.push(v);
  }
  return a;
}

const SPARK_L = genSparkline(44);
const SPARK_R = genSparkline(38);

export function IntelligenceOSMap({
  totalSongs = 15323,
}: {
  totalSongs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({
    dots: [] as LightDot[],
    provincePaths: [] as Path2D[],
    coords: [] as [number, number][],
    isSubNode: [] as boolean[],
    edges: [] as [number, number][],
    edgePhases: [] as number[],
    edgeSpeeds: [] as number[],
    edgeThresh: [] as number[],
    edgeConns: [] as number[],
    songs: 0,
    blink: 0,
    focusX: 500,
    focusY: 417,
    targetCityIndex: 0,
    nextSwitchTime: 0,
    boxW: 0,
    boxH: 0,
    targetBoxW: 0,
    targetBoxH: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let prev = performance.now();
    const s = st.current;

    const build = () => {
      const dpr = window.devicePixelRatio || 1;
      const lw = canvas.width / dpr;
      const lh = canvas.height / dpr;
      const sideW = lw < 640 ? 0 : Math.min(160, lw * 0.15);
      const padH  = lw < 640 ? 20 : 60;
      const mapX  = sideW + padH;
      const mapY  = 40;
      const mw    = lw - sideW * 2 - padH * 2;
      const mh    = lh - 80;
      const scale = Math.min((mw - 24 * 2) / SVG_W, (mh - 24 * 2) / SVG_H);
      const mapWidth = SVG_W * scale;
      const mapHeight = SVG_H * scale;
      const offsetX = mapX + 24 + (mw - 24 * 2 - mapWidth) / 2;
      const offsetY = mapY + 24 + (mh - 24 * 2 - mapHeight) / 2;

      // Pre-calculate SVG centroids for all provinces
      const provinceCentroids: { [name: string]: [number, number] } = {};
      PROVINCES.forEach(p => {
        provinceCentroids[p.name] = getPathCentroid(p.path);
      });

      const realCoords = CITIES.map(([cityName, lon, lat]) => {
        const provName = CITY_TO_PROVINCE[cityName];
        let svgX = 500, svgY = 417;
        if (provName && provinceCentroids[provName]) {
          [svgX, svgY] = provinceCentroids[provName];
        } else {
          [svgX, svgY] = projectToSvg(lon, lat);
        }
        const cx = offsetX + svgX * scale;
        const cy = offsetY + svgY * scale;
        return [cx, cy] as [number, number];
      });

      // Generate offset sub-nodes around major cities to create a dense neuron-like connection mesh
      const allCoords = [...realCoords];
      const isSubNode = new Array(realCoords.length).fill(false);

      for (let ci = 0; ci < realCoords.length; ci++) {
        const [cx, cy] = realCoords[ci];
        const [, , , pop] = CITIES[ci];
        const wt = popWeight(pop);
        // Larger cities generate more nearby sub-nodes for higher visual complexity
        const subCount = wt > 0.48 ? 2 : 1;
        for (let j = 0; j < subCount; j++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = (20 + Math.random() * 35) * scale; // Generate node offset
          allCoords.push([cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist]);
          isSubNode.push(true);
        }
      }

      s.coords = allCoords;
      s.isSubNode = isSubNode;

      // Initialize routing focus points (only target real cities)
      s.targetCityIndex = Math.floor(Math.random() * CITIES.length);
      const initialCity = s.coords[s.targetCityIndex] || [500, 417];
      s.focusX = initialCity[0];
      s.focusY = initialCity[1];
      s.nextSwitchTime = 0;

      // Initialize scanner box dimensions (enlarged: 180px to 320px width, 140px to 280px height)
      s.targetBoxW = (180 + Math.random() * 140) * scale;
      s.targetBoxH = (140 + Math.random() * 140) * scale;
      s.boxW = s.targetBoxW;
      s.boxH = s.targetBoxH;



      // Build a local nearest-neighbor network grid with k=7 for dense but clean mesh
      s.edges = knnEdges(s.coords, 7);
      // Initialize dynamic connection speeds, phases, and activation thresholds
      s.edgePhases = s.edges.map(() => Math.random() * Math.PI * 2);
      s.edgeSpeeds = s.edges.map(() => 0.25 + Math.random() * 0.45); // Calm natural speeds
      s.edgeThresh = s.edges.map(() => -0.3 + Math.random() * 0.45); // Lower threshold makes lines stay active longer
      s.edgeConns = new Array(s.edges.length).fill(0);

      s.dots = [];

      for (let ci = 0; ci < CITIES.length; ci++) {
        const [, , , pop] = CITIES[ci];
        const wt = popWeight(pop);
        const [px, py] = s.coords[ci];

        const total = Math.floor(360 * Math.pow(wt, 0.72));
        const sigma = (30 + wt * 90) * scale;

        for (let i = 0; i < total; i++) {
          const dist  = Math.abs(gauss()) * sigma;
          const angle = Math.random() * Math.PI * 2;
          const x = px + Math.cos(angle) * dist;
          const y = py + Math.sin(angle) * dist;
          const norm = dist / sigma;

          let lum: number, alpha: number, r: number, flicker: number;

          if (norm < 0.25) {
            lum = 255;
            alpha = (0.70 + Math.random() * 0.30) * wt;
            r = 1.2 + Math.random() * 1.2;
            flicker = 0.06 + Math.random() * 0.08;
          } else if (norm < 0.7) {
            lum = 210;
            alpha = (0.22 + Math.random() * 0.26) * wt;
            r = 0.8 + Math.random() * 0.8;
            flicker = 0.04 + Math.random() * 0.06;
          } else if (norm < 1.5) {
            lum = 160;
            alpha = (0.06 + Math.random() * 0.09) * wt;
            r = 0.55 + Math.random() * 0.55;
            flicker = 0.02 + Math.random() * 0.04;
          } else {
            lum = 100;
            alpha = (0.018 + Math.random() * 0.025) * wt;
            r = 0.45; flicker = 0.01;
          }

          s.dots.push({
            x, y, r, alpha, flicker, lum,
            phase: Math.random() * 2000,
            speed: 0.8 + Math.random() * 1.5, // Faster speed for visible twinkling
            cityIndex: ci,
          });
        }
      }

      s.provincePaths = PROVINCES.map(p => new Path2D(p.path));
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      build();
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      s.blink = (s.blink + dt * 0.9) % 1;

      // Update real-time connection strength for each dynamic network link
      const t = now * 0.001;
      for (let i = 0; i < s.edges.length; i++) {
        const phase = s.edgePhases[i];
        const speed = s.edgeSpeeds[i];
        const thresh = s.edgeThresh[i];
        const wave = Math.sin(t * speed + phase);
        let conn = 0;
        if (wave > thresh) {
          conn = (wave - thresh) / (1 - thresh);
          conn = Math.sin(conn * Math.PI * 0.5); // Smooth ease-in-out curve
        }
        s.edgeConns[i] = conn;
      }


      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width, H = canvas.height;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
      ctx.scale(dpr, dpr);

      const lw = W / dpr, lh = H / dpr;
      const sideW = lw < 640 ? 0 : Math.min(160, lw * 0.15);
      const padH  = lw < 640 ? 20 : 60;
      const mapX  = sideW + padH, mapY = 40;
      const mw    = lw - sideW * 2 - padH * 2, mh = lh - 80;

      const pad = 24;
      const scale = Math.min((mw - pad * 2) / SVG_W, (mh - pad * 2) / SVG_H);
      const mapWidth = SVG_W * scale;
      const mapHeight = SVG_H * scale;
      const offsetX = mapX + pad + (mw - pad * 2 - mapWidth) / 2;
      const offsetY = mapY + pad + (mh - pad * 2 - mapHeight) / 2;

      // Random target routing: switch to a new target city index every 6.0 to 9.0 seconds
      if (now > s.nextSwitchTime) {
        const currentTarget = s.coords[s.targetCityIndex] || [500, 417];
        let nextIdx = s.targetCityIndex;
        let attempts = 0;
        
        while (attempts < 20) {
          const randIdx = Math.floor(Math.random() * CITIES.length);
          const candidate = s.coords[randIdx];
          if (candidate) {
            const dist = Math.hypot(candidate[0] - currentTarget[0], candidate[1] - currentTarget[1]);
            // Ensure the next target is physically far away on the canvas (at least 250px) to move widely
            if (dist > 250 && randIdx !== s.targetCityIndex) {
              nextIdx = randIdx;
              break;
            }
          }
          attempts++;
        }

        if (nextIdx === s.targetCityIndex) {
          nextIdx = (s.targetCityIndex + 1) % CITIES.length;
        }

        s.targetCityIndex = nextIdx;
        s.nextSwitchTime = now + 6000 + Math.random() * 3000;

        // Randomly set new large target dimensions with varying aspect ratios (width & height)
        // Range: 180px to 320px for width, 140px to 280px for height
        s.targetBoxW = (180 + Math.random() * 140) * scale;
        s.targetBoxH = (140 + Math.random() * 140) * scale;
      }
      
      // Interpolate towards the target city coordinates very slowly
      const [tx, ty] = s.coords[s.targetCityIndex] || [500, 417];
      s.focusX += (tx - s.focusX) * (1 - Math.exp(-0.45 * dt));
      s.focusY += (ty - s.focusY) * (1 - Math.exp(-0.45 * dt));

      // Smoothly morph box dimensions
      s.boxW += (s.targetBoxW - s.boxW) * (1 - Math.exp(-0.45 * dt));
      s.boxH += (s.targetBoxH - s.boxH) * (1 - Math.exp(-0.45 * dt));

      const focusX = s.focusX;
      const focusY = s.focusY;

      // ---- PROVINCE OUTLINES ----
      if (s.provincePaths.length > 0) {
        ctx.save();
        ctx.transform(scale, 0, 0, scale, offsetX, offsetY);
        
        // 1. Draw thick outer country outline (will be masked internally by province fills)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
        ctx.lineWidth   = 1.5 / scale;
        for (const path of s.provincePaths) {
          ctx.stroke(path);
        }

        // 2. Fill provinces to cover internal thick lines, and draw thin internal boundaries
        for (const path of s.provincePaths) {
          ctx.fillStyle = '#000000';
          ctx.fill(path);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.lineWidth   = 0.5 / scale;
          ctx.stroke(path);
        }

        // Faint duplicate outline slightly shifted for 3D holographic wireframe effect
        ctx.save();
        ctx.translate(1.5 / scale, 1.5 / scale);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth   = 0.4 / scale;
        for (const path of s.provincePaths) {
          ctx.stroke(path);
        }
        ctx.restore();

        ctx.restore();
      }

      // Scanner Box Dimensions (dynamically morphing width/height)
      const boxW = s.boxW;
      const boxH = s.boxH;
      const hW = boxW / 2;
      const hH = boxH / 2;

      // ---- CITY LIGHT DOTS ----
      for (const d of s.dots) {
        let hoverGlow = 0;
        const dx = d.x - focusX;
        const dy = d.y - focusY;
        const distSq = dx * dx + dy * dy;
        const maxDistSq = 80 * 80;
        if (distSq < maxDistSq) {
          hoverGlow = (1 - Math.sqrt(distSq) / 80) * 0.6;
        }

        // Twinkle between 20% and 180% of the base alpha, at a visible pace
        const twinkle = Math.sin((now * 0.002 * d.speed) + d.phase * Math.PI * 2);
        const aBase = d.alpha * (1.0 + 0.6 * twinkle);

        // Occasional organic flares
        const flare = Math.max(0, Math.sin(now * 0.001 * d.speed + d.phase * 5) - 0.70) * 2.2 * d.alpha;

        // Organic coordinate wave
        const wave = Math.sin(d.x * 0.015 - d.y * 0.015 + now * 0.001) * 0.20 * d.alpha;

        const a = Math.max(0.02, aBase + wave + flare + hoverGlow);
        if (a < 0.01) continue;

        // Check if dot falls inside the scanner box (overlapping region)
        const inBox = (d.x >= focusX - hW) && (d.x <= focusX + hW) &&
                      (d.y >= focusY - hH) && (d.y <= focusY + hH);

        if (inBox) {
          // Thermal Heatmap Mode: Render smooth, overlapping thermal gradients (no sharp particle circles)
          // Scale heat radius based on city weight and d.r to create a smooth, cloud-like temperature map
          const [, , , pop] = CITIES[d.cityIndex];
          const wt = popWeight(pop);
          const heatRadius = (24 + wt * 36) * scale;
          const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, heatRadius);
          
          // Smooth color transitions representing thermal sensors (Core Yellow -> Cyber Pink -> Crimson -> Transparent)
          // Low baseline alphas because many gradients will overlap and blend
          const aFactor = a * 0.16; 
          
          if (d.lum === 255) {
            grad.addColorStop(0, `rgba(255, 235, 100, ${aFactor.toFixed(3)})`);
            grad.addColorStop(0.4, `rgba(255, 150, 0, ${(aFactor * 0.8).toFixed(3)})`);
            grad.addColorStop(0.8, `rgba(255, 60, 0, ${(aFactor * 0.3).toFixed(3)})`);
          } else if (d.lum === 210) {
            grad.addColorStop(0, `rgba(255, 150, 0, ${(aFactor * 0.8).toFixed(3)})`);
            grad.addColorStop(0.6, `rgba(255, 60, 0, ${(aFactor * 0.4).toFixed(3)})`);
          } else {
            grad.addColorStop(0, `rgba(255, 60, 0, ${(aFactor * 0.5).toFixed(3)})`);
            grad.addColorStop(0.6, `rgba(180, 0, 0, ${(aFactor * 0.25).toFixed(3)})`);
          }
          grad.addColorStop(1, 'rgba(255, 50, 0, 0)'); // Soft edge fade out

          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(d.x, d.y, heatRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Normal HUD Rendering Mode: sharp grayscale
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.lum},${d.lum},${d.lum},${a.toFixed(3)})`;
          ctx.fill();
        }
      }

      const coords = s.coords;

      // ---- NEURAL NET EDGES (City connections) ----
      for (let i = 0; i < s.edges.length; i++) {
        const conn = s.edgeConns[i];
        if (conn <= 0.01) continue; // Skip completely faded/disconnected edges

        const [a, b] = s.edges[i];
        if (!coords[a] || !coords[b]) continue;
        const [x1, y1] = coords[a], [x2, y2] = coords[b];

        const eitherSub = s.isSubNode[a] || s.isSubNode[b];

        // Base opacity scaled by connection strength (sub-node lines are much fainter, but boosted for brightness)
        let baseAlpha = (eitherSub ? 0.28 : 0.60) * conn;

        // Highlight connection lines near the active focus point
        const d1Sq = (x1 - focusX) ** 2 + (y1 - focusY) ** 2;
        const d2Sq = (x2 - focusX) ** 2 + (y2 - focusY) ** 2;
        const maxDistSq = 80 * 80;
        if (d1Sq < maxDistSq || d2Sq < maxDistSq) {
          const prox1 = d1Sq < maxDistSq ? (1 - Math.sqrt(d1Sq) / 80) : 0;
          const prox2 = d2Sq < maxDistSq ? (1 - Math.sqrt(d2Sq) / 80) : 0;
          baseAlpha += Math.max(prox1, prox2) * 0.30 * conn;
        }

        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = eitherSub 
          ? `rgba(255, 255, 255, ${(baseAlpha * 0.85).toFixed(3)})` 
          : `rgba(255, 255, 255, ${baseAlpha.toFixed(3)})`;
        ctx.lineWidth = eitherSub ? 0.35 : 0.7;
        ctx.stroke();
      }

      // ---- OVERLAY SCANNER BOX (HUD Finder Brackets) ----
      ctx.save();
      // Border color: semi-transparent white theme
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.0;

      // Draw Corner Brackets [ ]
      ctx.beginPath();
      const bLen = 14; // Bracket length
      // Top-Left [
      ctx.moveTo(focusX - hW, focusY - hH + bLen);
      ctx.lineTo(focusX - hW, focusY - hH);
      ctx.lineTo(focusX - hW + bLen, focusY - hH);
      // Top-Right ]
      ctx.moveTo(focusX + hW - bLen, focusY - hH);
      ctx.lineTo(focusX + hW, focusY - hH);
      ctx.lineTo(focusX + hW, focusY - hH + bLen);
      // Bottom-Right ]
      ctx.moveTo(focusX + hW, focusY + hH - bLen);
      ctx.lineTo(focusX + hW, focusY + hH);
      ctx.lineTo(focusX + hW - bLen, focusY + hH);
      // Bottom-Left [
      ctx.moveTo(focusX - hW + bLen, focusY + hH);
      ctx.lineTo(focusX - hW, focusY + hH);
      ctx.lineTo(focusX - hW, focusY + hH - bLen);
      ctx.stroke();

      // Draw scanner box background border (faint dotted or dashed border for the inner box)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(focusX - hW, focusY - hH, boxW, boxH);
      ctx.setLineDash([]); // Reset dash

      // Draw scanner diagnostic HUD texts
      ctx.font = '6px "Courier New",monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.textAlign = 'left';
      ctx.fillText('SYS: HEAT.OS // AREA SCAN', focusX - hW + 4, focusY - hH - 5);
      ctx.textAlign = 'right';
      ctx.fillText(`LOC: [${Math.round(focusX)},${Math.round(focusY)}]`, focusX + hW - 4, focusY + hH + 9);
      
      ctx.restore();

      // ---- ACTIVE CITY RINGS (Signal waves) ----
      for (let i = 0; i < CITIES.length; i++) {
        if (!coords[i]) continue;
        const [cx, cy] = coords[i];
        const [, , , pop] = CITIES[i];
        const wt = popWeight(pop);

        // Only pulse for major cities (population weight > 0.15)
        if (wt < 0.15) continue;

        // Draw concentric expanding rings (up to 2 rings, out of phase)
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const phaseOffset = rIdx * 0.5;
          const progress = ((now * 0.0003 + i * 0.07 + phaseOffset) % 1.0);
          const radius = progress * 45 * wt;
          const alpha = Math.sin(progress * Math.PI) * 0.18 * wt; // Fade in, then fade out

          if (radius > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // ---- CITY LABELS ----
      if (lw >= 480) {
        for (let i = 0; i < CITIES.length; i++) {
          if (!coords[i]) continue;
          const [cx, cy] = coords[i];
          const [name, , , pop] = CITIES[i];
          const wt = popWeight(pop);
          if (wt < 0.22) continue;

          // Gentle automatic breathing animation for labels
          const labelBreathe = Math.sin(now * 0.0015 + i * 0.5) * 0.05;
          // Raise overall opacity for clearer legibility
          let labelAlpha = Math.max(0.40, 0.55 + wt * 0.35 + labelBreathe);
          const dx = cx - focusX;
          const dy = cy - focusY;
          const distSq = dx * dx + dy * dy;
          const maxDistSq = 60 * 60;
          if (distSq < maxDistSq) {
            const proximity = 1 - Math.sqrt(distSq) / 60;
            labelAlpha = labelAlpha + proximity * 0.50; // Brighten dynamically
          }
          labelAlpha = Math.min(0.95, labelAlpha);

          ctx.save();
          ctx.font = 'bold 6.5px "Courier New",monospace';
          ctx.fillStyle = `rgba(255,255,255,${labelAlpha.toFixed(2)})`;
          ctx.textAlign = cx > lw / 2 ? 'right' : 'left';
          ctx.fillText(name, cx > lw / 2 ? cx - 7 : cx + 7, cy - 5);
          ctx.restore();
        }
      }

      // ---- SIDE PANELS ----
      if (sideW > 80) {
        drawPanel(ctx, lw, lh, sideW, s.blink, s.songs, false);
        drawPanel(ctx, lw, lh, sideW, s.blink, s.songs, true);
      }



      if (s.songs < totalSongs) {
        s.songs = Math.min(totalSongs, s.songs + Math.ceil(totalSongs * dt * 0.7));
      }

      drawHUD(ctx, lw, lh, s.blink, now);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [totalSongs]);

  return (
    <section className="relative z-10 w-full bg-black overflow-hidden" style={{ height: 'clamp(442px,71.5vw,832px)' }}>
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.4) 85%, #000 100%)' }}
      />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </section>
  );
}

function drawHUD(ctx: CanvasRenderingContext2D, lw: number, lh: number, blink: number, now: number) {
  const b = 0.5 + 0.5 * Math.sin(blink * Math.PI * 2);
  ctx.save();
  ctx.font = '6.5px "Courier New",monospace';
  ctx.fillStyle = `rgba(255,255,255,${0.35 + b * 0.15})`;
  ctx.fillText('HEAT INTELLIGENCE OS  v4.2', 12, 18);
  ctx.fillStyle = `rgba(255,255,255,${0.25 + b * 0.10})`;
  ctx.fillText('AUDIT ACTIVE  ◆  KH-NATIONWIDE  ◆  ' + new Date(now).toISOString().slice(11, 19) + ' UTC', 12, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = b > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.30)';
  ctx.fillText('● LIVE', lw - 12, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('SIGNAL  ████████░░', lw - 12, 30);
  ctx.beginPath(); ctx.moveTo(0, lh - 22); ctx.lineTo(lw, lh - 22);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(255,255,255,${0.25 + b * 0.12})`;
  ctx.fillText('SYS:NOMINAL  ◆  NODES:12  ◆  LATENCY:7ms  ◆  MESH:KNN-4X', 12, lh - 8);
  ctx.textAlign = 'right';
  ctx.fillText('© HEAT DATA ENGINE  ◆  ALL CHANNELS MONITORED', lw - 12, lh - 8);
  ctx.restore();
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  lw: number, lh: number, sw: number,
  blink: number, songs: number, right: boolean,
) {
  const b = 0.5 + 0.5 * Math.sin(blink * Math.PI * 2);
  const x0 = right ? lw - sw + 8 : 8;
  const data = right ? SPARK_R : SPARK_L;

  ctx.save();
  if (!right) {
    ctx.font = '6px "Courier New",monospace';
    ctx.fillStyle = `rgba(255,255,255,${0.18 + b * 0.07})`;
    ctx.fillText('SONGS ARCHIVED', x0, lh * 0.28);
    ctx.font = '12px "Courier New",monospace';
    ctx.fillStyle = `rgba(255,255,255,${0.50 + b * 0.28})`;
    ctx.fillText(songs.toLocaleString(), x0, lh * 0.28 + 18);
    ctx.font = '6px "Courier New",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('MOMENTUM INDEX', x0, lh * 0.50);
    drawSpark(ctx, x0, lh * 0.53, sw - 18, 34, data, blink);
    ctx.fillStyle = `rgba(255,255,255,${0.12 + b * 0.08})`;
    ctx.fillText('DATA STREAMS', x0, lh * 0.74);
    ctx.font = '9px "Courier New",monospace';
    ctx.fillStyle = `rgba(255,255,255,${0.28 + b * 0.18})`;
    ctx.fillText('12 CITIES', x0, lh * 0.74 + 13);
  } else {
    ctx.font = '6px "Courier New",monospace';
    ctx.fillStyle = `rgba(255,255,255,${0.18 + b * 0.07})`;
    ctx.fillText('AUDIT CYCLE', x0, lh * 0.28);
    ctx.font = '9px "Courier New",monospace';
    ctx.fillStyle = `rgba(255,255,255,${0.40 + b * 0.25})`;
    ctx.fillText('DAILY', x0, lh * 0.28 + 13);
    ctx.font = '6px "Courier New",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('SIGNAL INDEX', x0, lh * 0.50);
    drawSpark(ctx, x0, lh * 0.53, sw - 18, 34, data, blink);
    ['YOUTUBE', 'SPOTIFY', 'APPLE MX', 'FACEBOOK'].forEach((c, i) => {
      const on = Math.sin((blink + i * 0.28) * Math.PI * 2) > 0;
      ctx.fillStyle = on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.10)';
      ctx.fillText(`◆ ${c}`, x0, lh * 0.74 + i * 13);
    });
  }
  ctx.restore();
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, data: number[], blink: number) {
  const b = 0.5 + 0.5 * Math.sin(blink * Math.PI * 2);
  ctx.save();
  ctx.beginPath();
  data.forEach((v, i) => {
    const px = x + (i / (data.length - 1)) * w;
    const py = y + h - v * h;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.strokeStyle = `rgba(255,255,255,${0.28 + b * 0.22})`;
  ctx.lineWidth = 0.8; ctx.stroke();
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(255,255,255,${0.07 + b * 0.05})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}
