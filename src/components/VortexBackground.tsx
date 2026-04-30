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

type ContentType = 'artist' | 'title' | 'metric' | 'counter' | 'dot' | 'node';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  driftTimer: number;
  age: number;
  maxAge: number;
  type: ContentType;
  text: string;
  targetValue: number;
  fontSize: number;
  bold: boolean;
  glitchTimer: number;
  glitchText: string;
  pulseOffset: number; // per-particle phase offset for neural pulses
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

function getOpacity(lifeRatio: number, base: number): number {
  if (lifeRatio < 0.08) return (lifeRatio / 0.08) * base;
  if (lifeRatio > 0.65) return (1 - (lifeRatio - 0.65) / 0.35) * base;
  return base;
}

function makeParticle(canvasW: number, canvasH: number): Particle {
  const roll = Math.random();
  let type: ContentType;
  let text = '';
  let targetValue = 0;
  let fontSize = 8;
  let bold = false;

  if (roll < 0.10) {
    type = 'node';
  } else if (roll < 0.14) {
    type = 'dot';
  } else if (roll < 0.36) {
    type = 'artist';
    text = pickRandom(ARTISTS);
    fontSize = 11;
    bold = true;
  } else if (roll < 0.56) {
    type = 'title';
    text = pickRandom(TITLES);
    fontSize = 9;
  } else if (roll < 0.76) {
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

  const margin = 60;
  const x = margin + Math.random() * (canvasW - margin * 2);
  const y = margin + Math.random() * (canvasH - margin * 2);
  const speed = 0.06 + Math.random() * 0.14;
  const angle = Math.random() * Math.PI * 2;

  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    ax: 0, ay: 0,
    driftTimer: 60 + Math.floor(Math.random() * 120),
    age: 0,
    maxAge: 340 + Math.floor(Math.random() * 300),
    type, text, targetValue, fontSize, bold,
    glitchTimer: 0,
    glitchText: text,
    pulseOffset: Math.random(),
  };
}

export const VortexBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      sizeRef.current = { w: canvas.width, h: canvas.height };
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = (timestamp: number) => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      if (timestamp - lastSpawnRef.current > 260 && particlesRef.current.length < 50) {
        particlesRef.current.push(makeParticle(w, h));
        lastSpawnRef.current = timestamp;
      }

      const alive: Particle[] = [];

      for (const p of particlesRef.current) {
        p.age++;

        p.driftTimer--;
        if (p.driftTimer <= 0) {
          const newAngle = Math.random() * Math.PI * 2;
          const speed = 0.06 + Math.random() * 0.14;
          p.ax = (Math.cos(newAngle) * speed - p.vx) * 0.025;
          p.ay = (Math.sin(newAngle) * speed - p.vy) * 0.025;
          p.driftTimer = 90 + Math.floor(Math.random() * 130);
        }
        p.vx += p.ax;
        p.vy += p.ay;
        p.ax *= 0.94;
        p.ay *= 0.94;
        p.x += p.vx;
        p.y += p.vy;

        if (p.age >= p.maxAge || p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) continue;
        alive.push(p);
      }

      particlesRef.current = alive;

      // ── Neural connections: node → nearby text particles ──
      const nodes = alive.filter(p => p.type === 'node');
      const textParticles = alive.filter(p => p.type !== 'node' && p.type !== 'dot');
      const CONNECT_RADIUS = 200;
      const PULSE_SPEED = 0.0055;

      for (const node of nodes) {
        for (const tp of textParticles) {
          const dx = node.x - tp.x;
          const dy = node.y - tp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > CONNECT_RADIUS) continue;

          const falloff = 1 - dist / CONNECT_RADIUS;

          // connection line: gradient brighter at node end
          const grad = ctx.createLinearGradient(node.x, node.y, tp.x, tp.y);
          grad.addColorStop(0, `rgba(255,255,255,${falloff * 0.55})`);
          grad.addColorStop(1, `rgba(255,255,255,${falloff * 0.15})`);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(tp.x, tp.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.7;
          ctx.stroke();

          // traveling pulse
          const phase = (node.age * PULSE_SPEED + tp.pulseOffset) % 1.0;
          const px = node.x + (tp.x - node.x) * phase;
          const py = node.y + (tp.y - node.y) * phase;
          const pulseAlpha = falloff * Math.sin(phase * Math.PI);
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${pulseAlpha})`;
          ctx.fill();
        }
      }

      // ── Draw particles ──
      for (const p of alive) {
        const lifeRatio = p.age / p.maxAge;
        const opacity = getOpacity(lifeRatio, 0.40);

        if (p.type === 'node') {
          // pulsing halo
          const pulse = 0.7 + 0.3 * Math.sin(p.age * 0.06);
          const r = 5 * pulse;
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
          glow.addColorStop(0, `rgba(255,255,255,${opacity * 1.8})`);
          glow.addColorStop(0.4, `rgba(255,255,255,${opacity * 0.5})`);
          glow.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
          ctx.fill();
          // solid core
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${opacity * 2})`;
          ctx.fill();
          continue;
        }

        if (p.type === 'dot') {
          const dotGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 2.5);
          dotGrad.addColorStop(0, `rgba(255,255,255,${opacity * 1.4})`);
          dotGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = dotGrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        // text particles
        let displayText: string;
        if (p.type === 'counter') {
          const countP = Math.min(lifeRatio * 3.0, 1);
          const ease = 1 - Math.pow(1 - countP, 2.5);
          const val = Math.floor(ease * p.targetValue);
          displayText = val >= 1000 ? val.toLocaleString() : val.toFixed(p.targetValue < 100 ? 1 : 0);
        } else {
          p.glitchTimer--;
          if (lifeRatio < 0.12 && p.glitchTimer <= 0) {
            p.glitchText = randomGlitch(p.text.length || 4);
            p.glitchTimer = 3 + Math.floor(Math.random() * 5);
          } else if (lifeRatio >= 0.12) {
            p.glitchText = p.text;
          }
          displayText = p.glitchText;
        }

        const weight = p.bold ? 'bold ' : '';
        ctx.font = `${weight}${p.fontSize}px 'Courier New', monospace`;

        if (p.type === 'artist') {
          ctx.shadowColor = 'rgba(255,255,255,0.22)';
          ctx.shadowBlur = 5;
        }

        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.fillText(displayText, p.x, p.y);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
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
