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
        const originalPositions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const offsets = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * spread[0];
            const y = (Math.random() - 0.5) * spread[1];
            const z = (Math.random() - 0.5) * spread[2];

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            originalPositions[i * 3] = x;
            originalPositions[i * 3 + 1] = y;
            originalPositions[i * 3 + 2] = z;

            sizes[i] = Math.random() * 2 + 0.5;

            // Random movement offsets
            offsets[i * 3] = Math.random() * Math.PI * 2;
            offsets[i * 3 + 1] = Math.random() * Math.PI * 2;
            offsets[i * 3 + 2] = Math.random() * Math.PI * 2;
        }

        return { positions, originalPositions, sizes, offsets };
    }, [count, spread]);

    useFrame((state) => {
        const { originalPositions, offsets } = particles;
        const pos = points.current.geometry.attributes.position.array as Float32Array;
        const time = state.clock.getElapsedTime();

        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            // Gentle drift centered on original positions
            pos[ix] = originalPositions[ix] + Math.sin(time * 0.2 + offsets[ix]) * 0.5;
            pos[iy] = originalPositions[iy] + Math.cos(time * 0.15 + offsets[iy]) * 0.5;
            pos[iz] = originalPositions[iz] + Math.sin(time * 0.25 + offsets[iz]) * 0.5;
        }

        points.current.geometry.attributes.position.needsUpdate = true;
        points.current.rotation.y = time * 0.015;
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

const DataCluster: React.FC<{ color: string; progress?: number }> = ({ color, progress = 1 }) => {
    const points = useRef<THREE.Points>(null!);
    const count = 3000;
    const scrollRef = useRef(0);
    const smoothScrollRef = useRef(0);
    const progressRef = useRef(0);

    // Track scroll position
    useEffect(() => {
        const handleScroll = () => {
            scrollRef.current = window.scrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const data = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const originalPositions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const randoms = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const phi = Math.acos(-1 + (2 * i) / count);
            const theta = Math.sqrt(count * Math.PI) * phi;
            const r = Math.random() * 2.0;

            const x = r * Math.cos(theta) * Math.sin(phi);
            const y = r * Math.sin(theta) * Math.sin(phi);
            const z = r * Math.cos(phi);

            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            originalPositions[i * 3] = x;
            originalPositions[i * 3 + 1] = y;
            originalPositions[i * 3 + 2] = z;

            // RED CORE HEATMAP (Restore previous balance)
            const heatFactor = Math.max(0, 1 - r / 2.0);

            if (heatFactor > 0.8) {
                // CORE: Vivid Red-Orange
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 0.2;
                colors[i * 3 + 2] = 0.3;
            } else if (heatFactor > 0.4) {
                // INNER: Orange-Yellowish Glow
                const f = (heatFactor - 0.4) / 0.4;
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 0.4 + (0.6 * f);
                colors[i * 3 + 2] = 0.4 + (0.6 * f);
            } else {
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 1.0;
                colors[i * 3 + 2] = 1.0;
            }

            sizes[i] = Math.random() * 1.5 + 0.5;
            randoms[i] = Math.random();
        }

        return { positions, originalPositions, colors, sizes, randoms };
    }, []);

    useFrame((state) => {
        const time = state.clock.getElapsedTime();
        const pos = points.current.geometry.attributes.position.array as Float32Array;
        const { originalPositions, randoms } = data;

        progressRef.current += (progress - progressRef.current) * 0.05;

        smoothScrollRef.current += (scrollRef.current - smoothScrollRef.current) * 0.05;
        const scrollFactor = Math.min(smoothScrollRef.current / 800, 1.5);

        for (let i = 0; i < count; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            const speed = 0.5 + scrollFactor * 0.3;
            const intensity = 0.3 + scrollFactor * 0.1;
            const yOffset = 2.5 - (scrollFactor * 0.3);

            const dx = Math.sin(time * speed + originalPositions[ix] * 0.5 + randoms[i] * 10) * intensity;
            const dy = Math.cos(time * speed + originalPositions[iy] * 0.5 + randoms[i] * 10) * intensity;
            const dz = Math.sin(time * speed + originalPositions[iz] * 0.5 + randoms[i] * 10) * intensity;

            // ASSEMBLY EFFECT: Constrain scale from 5.0 down to 1.0 based on progress
            const assembleFactor = 1 + Math.pow(1 - progressRef.current, 1.5) * 4;
            const pulse = (1 + (Math.sin(time * 0.1) * 0.1) * (1 + scrollFactor * 0.5)) * assembleFactor;

            pos[ix] = originalPositions[ix] * pulse + dx * progressRef.current;
            pos[iy] = originalPositions[iy] * pulse + dy * progressRef.current + yOffset;
            pos[iz] = originalPositions[iz] * pulse + dz * progressRef.current;
        }

        points.current.geometry.attributes.position.needsUpdate = true;

        if (points.current.material instanceof THREE.PointsMaterial) {
            points.current.material.opacity = 0.4 * progressRef.current;
        }

        const wobble = Math.sin(time * 0.2) * 0.02;
        points.current.rotation.y = time * 0.03 + (smoothScrollRef.current * 0.0001) + wobble;
        points.current.rotation.z = time * 0.02 + (Math.cos(time * 0.1) * 0.01);
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[data.positions, 3]}
                />
                <bufferAttribute
                    attach="attributes-color"
                    args={[data.colors, 3]}
                />
                <bufferAttribute
                    attach="attributes-size"
                    args={[data.sizes, 1]}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.05}
                vertexColors
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
    progress?: number;
}

export const AuraR3F: React.FC<AuraR3FProps> = ({
    count = 160,
    color = "#ffffff",
    className = "",
    height = "100%",
    fullscreen = false,
    progress = 1
}) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div style={{ height }} />;

    const containerStyle: React.CSSProperties = fullscreen
        ? { position: 'fixed', inset: 0, height: '100vh', zIndex: 0 }
        : { position: 'absolute', inset: 0, height, zIndex: 0 };

    const spreadValue = useMemo<[number, number, number]>(() =>
        fullscreen ? [40, 20, 10] : [10, 4, 4],
        [fullscreen]);

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
                <DataCluster color={color} progress={progress} />
            </Canvas>
        </div>
    );
};
