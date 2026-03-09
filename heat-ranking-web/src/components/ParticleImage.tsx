'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleImageProps {
    src: string;
    width?: number;
    height?: number;
}

const ImagePoints: React.FC<ParticleImageProps> = ({ src }) => {
    const meshRef = useRef<THREE.Points>(null!);

    // Attempt to load texture with CORS support
    const texture = useMemo(() => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        return loader.load(src);
    }, [src]);

    const count = 120 * 80; // Total particles for a clear yet performant look

    const [positions, uvs, offsets] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const uv = new Float32Array(count * 2);
        const off = new Float32Array(count); // Random offset for individual motion

        const cols = 120;
        const rows = 80;

        for (let i = 0; i < count; i++) {
            const x = i % cols;
            const y = Math.floor(i / cols);

            // Grid positions
            pos[i * 3] = (x / cols - 0.5) * 6;
            pos[i * 3 + 1] = (y / rows - 0.5) * -4;
            pos[i * 3 + 2] = 0;

            // UV mapping
            uv[i * 2] = x / cols;
            uv[i * 2 + 1] = 1.0 - (y / rows);

            off[i] = Math.random();
        }
        return [pos, uv, off];
    }, []);

    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uTime: { value: 0 },
                uScanPos: { value: -1.0 },
            },
            vertexShader: `
                varying vec2 vUv;
                varying float vAlpha;
                uniform float uTime;
                uniform float uScanPos;
                attribute float aOffset;

                void main() {
                    vUv = uv;
                    vec3 pos = position;

                    // AI Assembly Effect: Particles drift in from noise
                    float phase = sin(uTime * 0.5 + aOffset * 6.28) * 0.1;
                    
                    // Wave based on uScanPos
                    float dist = pos.x - (uScanPos * 6.0 - 3.0);
                    float influence = smoothstep(1.5, -1.5, dist);
                    
                    // Scatter particles before they are 'scanned'
                    if (influence < 0.9) {
                        float n = sin(aOffset * 100.0) * (1.0 - influence) * 2.0;
                        pos.z += n;
                        pos.x += n * 0.5;
                        vAlpha = influence * 0.5;
                    } else {
                        vAlpha = 1.0;
                    }

                    // Subtle breathing
                    pos.x += sin(uTime * 0.3 + pos.y) * 0.05;
                    pos.y += cos(uTime * 0.4 + pos.x) * 0.05;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = (5.0 * (1.0 / -mvPosition.z));
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                varying float vAlpha;
                uniform sampler2D uTexture;

                void main() {
                    vec4 color = texture2D(uTexture, vUv);
                    
                    // If texture fails to load (CORS), use a default data-blue color
                    if (color.a < 0.1) color = vec4(0.0, 0.8, 1.0, 1.0);
                    
                    // Apply grayscale/glitch look if needed
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 finalColor = mix(color.rgb, vec3(gray), 0.5);

                    // Fade in based on vertex calculation
                    gl_FragColor = vec4(finalColor, color.a * vAlpha);
                    
                    // Make it look like dots
                    float d = distance(gl_PointCoord, vec2(0.5));
                    if (d > 0.5) discard;
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }, [texture]);

    useFrame((state) => {
        const time = state.clock.getElapsedTime();
        material.uniforms.uTime.value = time;

        // Loop a scan transition
        material.uniforms.uScanPos.value = (Math.sin(time * 0.2) + 1.0) / 2.0;
    });

    return (
        <points ref={meshRef} material={material}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
                <bufferAttribute
                    attach="attributes-uv"
                    args={[uvs, 2]}
                />
                <bufferAttribute
                    attach="attributes-aOffset"
                    args={[offsets, 1]}
                />
            </bufferGeometry>
        </points>
    );
};

export const ParticleImage: React.FC<ParticleImageProps> = ({ src }) => {
    return (
        <div className="h-full w-full bg-black/40">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <ImagePoints src={src} />
            </Canvas>
        </div>
    );
};
