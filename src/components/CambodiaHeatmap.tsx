'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';

// ── SVG dimensions from Blender export ──────────────────────────────────────
const SVG_W = 380.257507;
const SVG_H = 197.516724;

// Cambodia polygon (Fills layer from khmap.svg)
const KH_FILLS_D =
  'M32.570923,156.96039L37.02307,164.21234L44.00757,173.75293L48.804016,178.68378' +
  'L46.14496,186.5227L95.2948,181.90308L153.31543,178.20422L192.65594,171.16815' +
  'L235.84381,168.9201L285.05475,176.27637L317.62738,158.20709L323.3288,133.62933' +
  'L348.62616,117.096375L362.45514,103.80023L369.3322,94.72113L361.31598,85.53967' +
  'L362.8703,76.65961L362.49445,68.079956L366.0091,59.643982L342.39313,53.93994' +
  'L318.04742,45.996704L280.37177,37.498962L234.04547,33.625305L188.74591,34.34796' +
  'L156.6159,32.897278L114.91095,22.621094L77.37897,14.4210205L32.302002,11.605713' +
  'L25.692566,17.796387L21.656555,23.321777L15.330811,31.042175L10.88446,40.190918' +
  'L11.414429,43.725586L12.440002,49.42047L12.181885,57.381104L15.292786,65.51941' +
  'L22.435974,75.204346L23.579773,84.36432L62.68799,72.724915L87.459595,94.53113' +
  'L58.20697,127.645996L16.42041,142.07465L21.702637,145.4585L28.041016,150.84265';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSvgD(d: string): [number, number][] {
  const pts: [number, number][] = [];
  const re = /[ML]\s*([\d.]+),([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) pts.push([+m[1], +m[2]]);
  return pts;
}

function pointInPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// SVG px → Three.js world  (x: −4…4,  z: −2.08…2.08)
function svgToWorld(sx: number, sy: number): [number, number] {
  return [(sx / SVG_W) * 8 - 4, (sy / SVG_H) * 4.16 - 2.08];
}

// ── Province data ─────────────────────────────────────────────────────────────
const PROVINCES = [
  { id: 'phnom_penh',       name: 'Phnom Penh',       cx: 267, cy: 296, value: 100 },
  { id: 'siem_reap',        name: 'Siem Reap',         cx: 171, cy: 107, value: 82  },
  { id: 'kandal',           name: 'Kandal',             cx: 281, cy: 303, value: 75  },
  { id: 'battambang',       name: 'Battambang',         cx: 76,  cy: 169, value: 70  },
  { id: 'kampong_cham',     name: 'Kampong Cham',       cx: 307, cy: 241, value: 68  },
  { id: 'prey_veng',        name: 'Prey Veng',          cx: 325, cy: 314, value: 62  },
  { id: 'kratie',           name: 'Kratie',             cx: 410, cy: 206, value: 60  },
  { id: 'kampong_thom',     name: 'Kampong Thom',       cx: 290, cy: 193, value: 58  },
  { id: 'takeo',            name: 'Takeo',              cx: 260, cy: 359, value: 58  },
  { id: 'kampong_chhnang',  name: 'Kampong Chhnang',    cx: 242, cy: 238, value: 55  },
  { id: 'tbong_khmum',      name: 'Tbong Khmum',        cx: 380, cy: 262, value: 55  },
  { id: 'preah_sihanouk',   name: 'Preah Sihanouk',     cx: 157, cy: 367, value: 55  },
  { id: 'kampong_speu',     name: 'Kampong Speu',       cx: 203, cy: 295, value: 52  },
  { id: 'svay_rieng',       name: 'Svay Rieng',         cx: 381, cy: 333, value: 50  },
  { id: 'kampot',           name: 'Kampot',             cx: 202, cy: 378, value: 50  },
  { id: 'pursat',           name: 'Pursat',             cx: 137, cy: 223, value: 48  },
  { id: 'banteay_meanchey', name: 'Banteay Meanchey',   cx: 71,  cy: 89,  value: 45  },
  { id: 'kep',              name: 'Kep',                cx: 207, cy: 404, value: 38  },
  { id: 'oddar_meanchey',   name: 'Oddar Meanchey',     cx: 152, cy: 47,  value: 38  },
  { id: 'preah_vihear',     name: 'Preah Vihear',       cx: 284, cy: 84,  value: 35  },
  { id: 'stung_treng',      name: 'Stung Treng',        cx: 408, cy: 69,  value: 32  },
  { id: 'pailin',           name: 'Pailin',             cx: 29,  cy: 171, value: 28  },
  { id: 'koh_kong',         name: 'Koh Kong',           cx: 126, cy: 292, value: 28  },
  { id: 'mondulkiri',       name: 'Mondulkiri',         cx: 500, cy: 178, value: 22  },
  { id: 'ratanakiri',       name: 'Ratanakiri',         cx: 515, cy: 67,  value: 18  },
];
type Province = typeof PROVINCES[number];

function amplify(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => 0.08 + Math.pow((v - min) / range, 0.55) * 0.88);
}

// Thermographic colormap  cold(blue) → cyan → green → yellow → hot(red)
const THERMO: [number, number, number, number][] = [
  [0,    0.05, 0.12, 0.65],
  [0.25, 0,    0.85, 1   ],
  [0.5,  0,    1,    0.2 ],
  [0.75, 1,    0.85, 0   ],
  [1,    1,    0.15, 0   ],
];
function thermoColor(t: number): THREE.Color {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 0; i < THERMO.length - 1; i++) {
    const [t0, r0, g0, b0] = THERMO[i];
    const [t1, r1, g1, b1] = THERMO[i + 1];
    if (v <= t1) {
      const f = (v - t0) / (t1 - t0);
      return new THREE.Color(r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f);
    }
  }
  return new THREE.Color(1, 0.15, 0);
}

// ── Dot grid constants ────────────────────────────────────────────────────────
const GRID_COLS = 100;
const SPACING   = SVG_W / GRID_COLS;          // ≈ 3.8 SVG units
const KH_POLY   = parseSvgD(KH_FILLS_D);      // module-level (computed once)

type Dot = { wx: number; wz: number; sx: number; sy: number; heat: number };

// ── DotMap component ──────────────────────────────────────────────────────────
function DotMap({ provinces }: { provinces: Province[] }) {
  const dummy      = useMemo(() => new THREE.Object3D(), []);
  const initialised = useRef(false);

  const amplified = useMemo(() => amplify(provinces.map(p => p.value)), [provinces]);

  const svgCentroids = useMemo(
    () => provinces.map((p, i) => ({ sx: p.cx * 0.643 + 10, sy: p.cy * 0.352 + 9, t: amplified[i] })),
    [provinces, amplified],
  );

  const dots = useMemo((): Dot[] => {
    const result: Dot[] = [];
    const rows = Math.ceil(SVG_H / SPACING);
    for (let col = 0; col <= GRID_COLS; col++) {
      for (let row = 0; row <= rows; row++) {
        const sx = col * SPACING;
        const sy = row * SPACING;
        if (!pointInPoly(sx, sy, KH_POLY)) continue;
        let heat = 0.5, nearestDist = Infinity;
        for (const c of svgCentroids) {
          const d = (sx - c.sx) ** 2 + (sy - c.sy) ** 2;
          if (d < nearestDist) { nearestDist = d; heat = c.t; }
        }
        const [wx, wz] = svgToWorld(sx, sy);
        result.push({ wx, wz, sx, sy, heat });
      }
    }
    return result;
  }, [svgCentroids]);

  // Create the mesh imperatively so geometry/material/count are all in sync
  const mesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.038, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const m   = new THREE.InstancedMesh(geo, mat, dots.length);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    dots.forEach((d, i) => {
      dummy.position.set(d.wx, 0, d.wz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, thermoColor(d.heat));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    initialised.current = true;
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dots]);

  useFrame(({ clock }) => {
    if (!initialised.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < dots.length; i++) {
      const { wx, wz, sx, sy } = dots[i];
      const y = Math.sin(sx * 0.052 + sy * 0.068 + t * 0.65) * 0.22;
      dummy.position.set(wx, y, wz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  // Dispose on unmount
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);

  if (!dots.length) return null;
  return <primitive object={mesh} />;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ provinces }: { provinces: Province[] }) {
  return (
    <>
      <DotMap provinces={provinces} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function CambodiaHeatmap({
  data,
  artistName,
}: {
  data?: { id: string; value: number }[];
  artistName?: string;
}) {
  const provinces = data
    ? PROVINCES.map(p => ({ ...p, ...(data.find(d => d.id === p.id) ?? {}) }))
    : PROVINCES;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, delay: 0.4 }}
      className="relative w-full max-w-2xl mx-auto px-4 py-10"
    >
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[8px] font-bold tracking-[0.5em] text-white/20 uppercase">
          Heat Zone
        </span>
        <div className="h-px flex-1 bg-white/5" />
        {artistName && (
          <span className="text-[9px] font-mono text-white/30 tracking-widest uppercase">
            {artistName}
          </span>
        )}
        <span className="text-[8px] font-mono text-white/15 tracking-widest">KH</span>
      </div>

      <div className="w-full rounded-sm overflow-hidden" style={{ height: '480px' }}>
        <Canvas
          camera={{ position: [0, 5, 7], fov: 45 }}
          style={{ background: '#00000f' }}
          gl={{ antialias: true, alpha: false }}
        >
          <Scene provinces={provinces} />
        </Canvas>
      </div>
    </motion.section>
  );
}
