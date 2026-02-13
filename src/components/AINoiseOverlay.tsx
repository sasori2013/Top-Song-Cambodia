'use client';

import React, { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ParticleField: React.FC = () => {
    const pointsRef = useRef<THREE.Points>(null!);
    const count = 100;

    const [positions, velocities] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 6;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 2;

            vel[i * 3] = (Math.random() - 0.5) * 0.005;
            vel[i * 3 + 1] = (Math.random() - 0.5) * 0.005;
            vel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
        }
        return [pos, vel];
    }, []);

    useFrame((state) => {
        if (!pointsRef.current) return;
        const positionsArr = pointsRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < count; i++) {
            positionsArr[i * 3] += velocities[i * 3];
            positionsArr[i * 3 + 1] += velocities[i * 3 + 1];
            positionsArr[i * 3 + 2] += velocities[i * 3 + 2];

            // Subtle drift loop
            if (Math.abs(positionsArr[i * 3]) > 4) positionsArr[i * 3] *= -0.9;
            if (Math.abs(positionsArr[i * 3 + 1]) > 3) positionsArr[i * 3 + 1] *= -0.9;
        }
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.25}
                color="#ffffff"
                transparent
                opacity={0.3}
                blending={THREE.AdditiveBlending}
                sizeAttenuation={true}
            />
        </points>
    );
};

export const AINoiseOverlay: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {/* R3F Particles */}
            <div className="absolute inset-0 z-10">
                <Canvas camera={{ position: [0, 0, 4], fov: 60 }}>
                    <ParticleField />
                </Canvas>
            </div>

            {/* Grain / Static Noise layer */}
            <div
                className="absolute inset-0 opacity-[0.05] z-20"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Scanning Laser Line */}
            <motion.div
                className="absolute left-0 right-0 h-[1.5px] bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.8)] z-30"
                initial={{ top: '-10%' }}
                animate={{ top: '110%' }}
                transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "linear",
                }}
            />

            {/* Digital Corner Brackets */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-white/60" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-white/60" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-white/60" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-white/60" />

            {/* Data Stream Markers */}
            <div className="absolute bottom-4 left-4 text-[7px] font-mono text-white/30 uppercase tracking-[0.3em]">
                SYS.V_DATA_FLUX
            </div>
            <div className="absolute bottom-4 right-4 text-[7px] font-mono text-white/30 uppercase tracking-tighter">
                PRC: {Math.random().toString(16).slice(2, 6)}-{Math.random().toString(16).slice(2, 6)}
            </div>
        </div>
    );
};
