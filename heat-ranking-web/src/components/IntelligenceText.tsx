'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface IntelligenceTextProps {
  text: string;
  className?: string;
}

export const IntelligenceText: React.FC<IntelligenceTextProps> = ({ text }) => {
  const meshRef = useRef<any>(null!);

  // Custom Material for Glow/Discovery Effect
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScanPos: { value: -10 },
        uColor: { value: new THREE.Color("#ffffff") },
        uNoiseAmp: { value: 0.5 },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uScanPos;

        // Simple noise function for vertex displacement
        float rand(float n){return fract(sin(n) * 43758.5453123);}

        void main() {
          vPosition = position;
          vUv = uv;
          
          vec3 pos = position;
          
          // Synchronized Glitch: Subtle horizontal shift when near scanline
          float dist = abs(pos.x - uScanPos);
          if (dist < 1.5) {
            float glitch = (rand(floor(pos.y * 10.0 + uTime * 20.0)) - 0.5) * 0.2;
            pos.x += glitch * (1.0 - smoothstep(0.0, 1.5, dist));
          }

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uScanPos;
        uniform vec3 uColor;

        // Pseudo-random noise
        float noise(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
          // Discovery logic: text emerges from noise
          float dist = vPosition.x - uScanPos;
          
          // Noise mask
          float n = noise(vUv * 20.0 + uTime * 0.1);
          
          // SDF-like threshold for alpha
          // Much sharper transition to ensure it stays "discovered"
          float mask = 1.0 - smoothstep(-0.5, 0.5, dist + n * 0.2);
          
          // Edge glow exactly on the scanline front
          float edge = smoothstep(1.0, 0.0, abs(dist));
          vec3 finalColor = mix(uColor, vec3(0.0, 0.7, 1.0), edge);
          
          float alpha = mask;
          alpha += edge * 0.4;
          
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    material.uniforms.uTime.value = time;

    // Balanced scan speed for elegant discovery
    const scanSpeed = 4.5;
    const scanPos = -12 + time * scanSpeed;
    material.uniforms.uScanPos.value = Math.min(scanPos, 15);

    // Subtle breathing/fluctuation for the mesh itself
    if (meshRef.current) {
      meshRef.current.position.x = Math.sin(time * 0.4) * 0.15;
      meshRef.current.position.y = Math.cos(time * 0.3) * 0.1;
      meshRef.current.rotation.z = Math.sin(time * 0.2) * 0.02;
    }
  });

  return (
    <Text
      ref={meshRef}
      fontSize={1.8}
      maxWidth={10}
      textAlign="center"
      anchorX="center"
      anchorY="middle"
      material={material}
    >
      {text}
    </Text>
  );
};
