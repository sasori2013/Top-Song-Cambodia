"use client";

import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

interface FaceTrackerProps {
  cameraMode?: 'mono' | 'color';
  onResult: (results: any) => void;
}

const FaceTracker = ({ onResult, cameraMode = 'mono' }: FaceTrackerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastUpdateTime = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].includes('INFO: Created TensorFlow Lite XNNPACK delegate')) {
        return;
      }
      originalConsoleError.apply(console, args);
    };

    const setup = async () => {
      setError(null);
      setLoading(true);
      try {
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
      } catch (err) {
        console.error("MediaPipe initialization error:", err);
        // We don't necessarily block the camera if face tracking fails, 
        // but we should warn the user.
      } finally {
        setLoading(false);
        startCamera();
      }
    };

    setup();

    return () => {
      console.error = originalConsoleError;
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [retryCount]);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Video play error:", e));
            predictWebcam();
          };
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError("CAMERA_PERMISSION_DENIED");
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError("CAMERA_NOT_FOUND");
        } else {
          setError("CAMERA_INIT_FAIL: " + (err.message || "UNKNOWN"));
        }
      }
    } else {
      setError("MEDIA_DEVICES_NOT_SUPPORTED");
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
    <div className="absolute inset-0 overflow-hidden flex items-center justify-center z-0 bg-black">
      {loading && (
        <div className="z-50 text-2xl font-black text-white animate-pulse uppercase tracking-[0.2em]">
          INITIALIZING BIOMETRIC SCANNER...
        </div>
      )}
      
      {error && (
        <div className="z-50 flex flex-col items-center gap-4 p-8 border-2 border-red-500/50 bg-black/80 backdrop-blur-md">
          <div className="text-xl font-black text-red-500 uppercase tracking-widest">
            SYSTEM_ERROR: {error}
          </div>
          <button 
            onClick={() => setRetryCount(prev => prev + 1)}
            className="px-6 py-2 border-2 border-white/20 text-white font-black hover:bg-white/10 transition-colors uppercase tracking-widest text-sm"
          >
            [ REBOOT_CAMERA_SYSTEM ]
          </button>
        </div>
      )}

      <video
        ref={videoRef}
        style={{
          filter: cameraMode === 'mono' ? 'grayscale(100%) contrast(110%) brightness(120%)' : 'contrast(110%) brightness(110%)',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          minHeight: '1px',
          opacity: (loading || error) ? 0 : 1,
          transition: 'opacity 0.5s ease-in-out'
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
