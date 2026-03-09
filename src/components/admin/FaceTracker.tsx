"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

interface FaceTrackerProps {
  onResult: (results: any) => void;
}

const FaceTracker = ({ onResult }: FaceTrackerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastUpdateTime = useRef(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].includes('INFO: Created TensorFlow Lite XNNPACK delegate')) {
        return;
      }
      originalConsoleError.apply(console, args);
    };

    const setup = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      
      setLoading(false);
      startCamera();
    };

    setup();

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            predictWebcam();
          };
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }
  };

  let lastVideoTime = -1;
  const predictWebcam = async () => {
    if (!videoRef.current || !landmarkerRef.current) {
        window.requestAnimationFrame(predictWebcam);
        return;
    }

    if (videoRef.current.readyState < 2) {
        window.requestAnimationFrame(predictWebcam);
        return;
    }

    if (videoRef.current.currentTime !== lastVideoTime) {
      const now = performance.now();
      if (!lastUpdateTime.current || now - lastUpdateTime.current >= 100) {
        lastVideoTime = videoRef.current.currentTime;
        try {
          const results = landmarkerRef.current.detectForVideo(videoRef.current, now);
          if (results && onResult) {
              onResult(results);
              lastUpdateTime.current = now;
          }
        } catch (err: any) {
          if (!err.message?.includes('XNNPACK')) {
             console.warn('Face detection error:', err);
          }
        }
      }
    }
    window.requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center z-0">
      {loading && (
        <div className="z-50 text-2xl font-black text-black animate-pulse uppercase">
          INITIALIZING BIOMETRIC SCANNER...
        </div>
      )}
      <video
        ref={videoRef}
        style={{
          filter: 'grayscale(100%) contrast(110%) brightness(120%)',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          minHeight: '1px'
        }}
        autoPlay
        playsInline
        muted
      />
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />
    </div>
  );
};

export default FaceTracker;
