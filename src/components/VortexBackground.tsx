'use client';

import React, { useRef, useEffect } from 'react';

const ARTISTS = [
  'VANN DA', 'TENA', 'G-DEVITH', 'KMENG KHMER', 'PREAP SOVATH',
  'YCN TOMIE', 'LAURA MAM', 'MANITH', 'SULY PHENG', 'CHHAY VIRAKYUTH',
  'SMALLWORLD', 'STEP', 'KIM TANHA', 'SINN SISAMOUTH',
];
const TITLES = [
  'NEON LIGHT', 'DIT-WAY', 'FLOW', 'MISSING YOU', 'UNITY',
  'VOICE', 'DANCE', 'SOUL', 'FIRE', 'GOLDEN ERA', 'MIDNIGHT',
];
const METRICS = [
  'HEAT INDEX', 'VELOCITY', 'ENGAGEMENT', 'DAILY RANK',
  'TRENDING', 'AI SCAN', 'LIVE DATA', 'INDEXING...', 'HEAT.V2',
  'DATA SYNC', '///LIVE///', 'STREAM ACTIVE', 'SYS.HEAT',
];
const COUNTERS = [1330000, 950000, 880000, 146, 15516, 98.4, 22.5, 45000, 12500];

type ContentType = 'artist' | 'title' | 'metric' | 'counter' | 'dot';

interface Particle {
  angle: number;
  radius: number;
  angularVel: number;
  radialVel: number;
  age: number;
  maxAge: number;
  type: ContentType;
  text: string;
  targetValue: number;
  fontSize: number;
  bold: boolean;
  x: number;
  y: number;
  glitchTimer: number;
  glitchText: string;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&?';
function randomGlitch(len: number): string {
  return Array.from({ length: len }, () =>
    GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
  ).join('');
}

function makeParticle(): Particle {
  const roll = Math.random();
  let type: ContentType;
  let text = '';
  let targetValue = 0;
  let fontSize = 8;
  let bold = false;

  if (roll < 0.05) {
    type = 'dot';
    text = '';
  } else if (roll < 0.28) {
    type = 'artist';
    text = pickRandom(ARTISTS);
    fontSize = 10;
    bold = true;
  } else if (roll < 0.50) {
    type = 'title';
    text = pickRandom(TITLES);
    fontSize = 9;
  } else if (roll < 0.72) {
    type = 'metric';
    text = pickRandom(METRICS);
    fontSize = 8;
  } else {
    type = 'counter';
    targetValue = pickRandom(COUNTERS);
    text = '0';
    fontSize = 9;
    bold = true;
  }

  return {
    angle: Math.random() * Math.PI * 2,
    radius: 4 + Math.random() * 18,
    angularVel: (0.003 + Math.random() * 0.014) * (Math.random() < 0.5 ? 1 : -1),
    radialVel: 0.35 + Math.random() * 1.6,
    age: 0,
    maxAge: 180 + Math.floor(Math.random() * 220),
    type,
    text,
    targetValue,
    fontSize,
    bold,
    x: 0,
    y: 0,
    glitchTimer: 0,
    glitchText: text,
  };
}

export const VortexBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.42;

      // Vortex center subtle glow
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      cg.addColorStop(0, 'rgba(255,255,255,0.035)');
      cg.addColorStop(0.5, 'rgba(255,255,255,0.008)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      // Spawn
      if (timestamp - lastSpawnRef.current > 220 && particlesRef.current.length < 38) {
        particlesRef.current.push(makeParticle());
        lastSpawnRef.current = timestamp;
      }

      const alive: Particle[] = [];

      for (const p of particlesRef.current) {
        p.age++;
        p.angle += p.angularVel;
        p.radius += p.radialVel;
        p.radialVel *= 0.9985;

        if (p.age >= p.maxAge) continue;
        alive.push(p);

        const lifeRatio = p.age / p.maxAge;
        let opacity: number;
        if (lifeRatio < 0.07) opacity = lifeRatio / 0.07;
        else if (lifeRatio > 0.62) opacity = 1 - (lifeRatio - 0.62) / 0.38;
        else opacity = 1;
        opacity *= 0.42;

        p.x = cx + Math.cos(p.angle) * p.radius;
        p.y = cy + Math.sin(p.angle) * p.radius;

        if (p.type === 'dot') {
          // Small glowing dot
          const dotGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 3);
          dotGrad.addColorStop(0, `rgba(255,255,255,${opacity * 1.4})`);
          dotGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = dotGrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        // Trail line toward vortex center
        const trailLen = Math.min(p.radius * 0.55, 55);
        const tEx = cx + Math.cos(p.angle) * Math.max(4, p.radius - trailLen);
        const tEy = cy + Math.sin(p.angle) * Math.max(4, p.radius - trailLen);

        const lineGrad = ctx.createLinearGradient(p.x, p.y, tEx, tEy);
        lineGrad.addColorStop(0, `rgba(255,255,255,${opacity * 0.45})`);
        lineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tEx, tEy);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        // Compute display text
        let displayText: string;
        if (p.type === 'counter') {
          const countP = Math.min(lifeRatio * 3.5, 1);
          const ease = 1 - Math.pow(1 - countP, 2.5);
          const val = Math.floor(ease * p.targetValue);
          displayText = val >= 1000 ? val.toLocaleString() : val.toFixed(p.targetValue < 100 ? 1 : 0);
        } else {
          // Occasional glitch on entry
          p.glitchTimer--;
          if (lifeRatio < 0.15 && p.glitchTimer <= 0) {
            p.glitchText = randomGlitch(p.text.length || 4);
            p.glitchTimer = 3 + Math.floor(Math.random() * 4);
          } else if (lifeRatio >= 0.15) {
            p.glitchText = p.text;
          }
          displayText = p.glitchText;
        }

        const weight = p.bold ? 'bold ' : '';
        ctx.font = `${weight}${p.fontSize}px 'Courier New', monospace`;

        // Subtle white glow for artists
        if (p.type === 'artist') {
          ctx.shadowColor = 'rgba(255,255,255,0.3)';
          ctx.shadowBlur = 6;
        }

        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.fillText(displayText, p.x + 4, p.y);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      particlesRef.current = alive;

      // Faint connecting lines between nearby particles
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const dx = alive[i].x - alive[j].x;
          const dy = alive[i].y - alive[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 75) {
            const linkOpacity = (1 - dist / 75) * 0.065;
            ctx.beginPath();
            ctx.moveTo(alive[i].x, alive[i].y);
            ctx.lineTo(alive[j].x, alive[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${linkOpacity})`;
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};
