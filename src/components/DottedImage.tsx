'use client';

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { PresentationControls, Float } from '@react-three/drei';
import * as THREE from 'three';

interface DottedImageProps {
    src: string;
}

const DottedPlane: React.FC<{ src: string }> = ({ src }) => {
    const texture = useLoader(THREE.TextureLoader, src);

    const material = useMemo(() => {
        if (!texture) return null;
        return new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(120, 80) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform sampler2D uTexture;
                uniform float uTime;
                uniform vec2 uResolution;
                void main() {
                    vec2 gridUv = floor(vUv * uResolution) / uResolution;
                    vec2 localUv = vUv * uResolution - floor(vUv * uResolution);
                    vec4 color = texture2D(uTexture, gridUv + (0.5 / uResolution));
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 baseColor = mix(color.rgb, vec3(gray), 0.3);
                    vec3 aiColor = mix(baseColor, vec3(0.3, 0.6, 1.0), 0.2); 
                    float d = distance(localUv, vec2(0.5));
                    float dotMask = smoothstep(0.42, 0.35, d);
                    float glowMask = smoothstep(0.6, 0.1, d) * 0.45;
                    float pulse = sin(uTime * 1.5 + gridUv.x * 8.0 + gridUv.y * 4.0) * 0.15 + 0.85;
                    vec3 finalColor = aiColor * pulse;
                    float finalAlpha = (dotMask + glowMask) * color.a;
                    gl_FragColor = vec4(finalColor * (dotMask * 1.5 + glowMask), finalAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
    }, [texture]);

    useFrame((state) => {
        if (material) material.uniforms.uTime.value = state.clock.getElapsedTime();
    });

    if (!material) return null;

    return (
        <mesh material={material}>
            <planeGeometry args={[10, 5.625]} />
        </mesh>
    );
};

const ErrorFallback = () => (
    <mesh>
        <planeGeometry args={[10, 5.625]} />
        <meshBasicMaterial color="#111" transparent opacity={0.5} />
    </mesh>
);

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) return <ErrorFallback />;
        return this.props.children;
    }
}

export const DottedImage: React.FC<DottedImageProps> = ({ src }) => {
    return (
        <div className="h-full w-full bg-black flex items-center justify-center cursor-grab active:cursor-grabbing">
            <Canvas camera={{ position: [0, 0, 7.3], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <PresentationControls
                    global
                    config={{ mass: 2, tension: 500 }}
                    snap={{ mass: 4, tension: 1500 }}
                    rotation={[0, 0, 0]}
                    polar={[-Math.PI / 4, Math.PI / 4]}
                    azimuth={[-Math.PI / 4, Math.PI / 4]}
                >
                    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                        <CanvasErrorBoundary>
                            <Suspense fallback={null}>
                                <DottedPlane src={src} />
                            </Suspense>
                        </CanvasErrorBoundary>
                    </Float>
                </PresentationControls>
            </Canvas>
        </div>
    );
};
