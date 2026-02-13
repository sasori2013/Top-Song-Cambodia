'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticlesProps {
    count: number;
    color: string;
}

const Particles: React.FC<ParticlesProps & { spread?: [number, number, number] }> = ({
    count,
    color,
    spread = [10, 4, 4]
}) => {
    const points = useRef<THREE.Points>(null!);

    // Create randomized particle data
    const particles = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const velocities = new Float32Array(count * 3);
        const phases = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Spread depends on mode
            positions[i * 3] = (Math.random() - 0.5) * spread[0];
            positions[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
            positions[i * 3 + 2] = (Math.random() - 0.5) * spread[2];

            sizes[i] = Math.random() * 2 + 0.5;

            velocities[i * 3] = (Math.random() - 0.5) * 0.005;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.005 + 0.002;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005;

            phases[i] = Math.random() * Math.PI * 2;
        }

        return { positions, sizes, velocities, phases };
    }, [count, spread]);

    useFrame((state) => {
        const { positions, velocities } = particles;
        const time = state.clock.getElapsedTime();

        const limitX = spread[0] * 0.6;
        const limitY = spread[1] * 0.6;
        const limitZ = spread[2] * 0.6;

        for (let i = 0; i < count; i++) {
            positions[i * 3] += velocities[i * 3];
            positions[i * 3 + 1] += velocities[i * 3 + 1];
            positions[i * 3 + 2] += velocities[i * 3 + 2];

            if (Math.abs(positions[i * 3]) > limitX) positions[i * 3] *= -0.9;
            if (positions[i * 3 + 1] > limitY) positions[i * 3 + 1] = -limitY;
            if (Math.abs(positions[i * 3 + 2]) > limitZ) positions[i * 3 + 2] *= -0.9;
        }

        points.current.geometry.attributes.position.needsUpdate = true;
        points.current.rotation.y = time * 0.02;
        points.current.rotation.x = Math.sin(time * 0.05) * 0.05;
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[particles.positions, 3]}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.06}
                color={color}
                transparent
                opacity={0.4}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    );
};

interface AuraR3FProps {
    count?: number;
    color?: string;
    className?: string;
    height?: string;
    fullscreen?: boolean;
}

export const AuraR3F: React.FC<AuraR3FProps> = ({
    count = 80,
    color = "#ffffff",
    className = "",
    height = "100%",
    fullscreen = false
}) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div style={{ height }} />;

    const containerStyle: React.CSSProperties = fullscreen
        ? { position: 'fixed', inset: 0, height: '100vh', zIndex: 0 }
        : { position: 'absolute', inset: 0, height, zIndex: 0 };

    const spreadValue: [number, number, number] = fullscreen ? [40, 20, 10] : [10, 4, 4];

    return (
        <div className={`${fullscreen ? 'fixed' : 'absolute'} inset-0 pointer-events-none ${className}`} style={containerStyle}>
            <Canvas
                camera={{ position: [0, 0, fullscreen ? 15 : 5], fov: 60 }}
                gl={{ alpha: true, antialias: true }}
                onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                }}
            >
                <ambientLight intensity={0.5} />
                <Particles count={count} color={color} spread={spreadValue} />
            </Canvas>
        </div>
    );
};
