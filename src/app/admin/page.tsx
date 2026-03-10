"use client";

import React, { useState, useEffect } from 'react';
import FaceTracker from '@/components/admin/FaceTracker';
import HUDOverlay from '@/components/admin/HUDOverlay';
import { fetchData } from '@/services/DataService';
import '../admin.css';

export default function AdminPage() {
  const [faceData, setFaceData] = useState(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [sheetData, setSheetData] = useState({
    totalProduction: 0,
    totalArtist: 0,
    totalTracks: 0,
    totalEntries: 0
  });

  const [guiInverted, setGuiInverted] = useState(false);
  const [cameraMode, setCameraMode] = useState<'mono' | 'color'>('mono');
  
  const [envData, setEnvData] = useState({
    location: "SCANNING...",
    temp: "--°C",
    coord: "0.0000° N, 0.0000° E"
  });

  useEffect(() => {
    const fetchLocation = async (lat: number, lon: number) => {
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await response.json();
        
        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const geoData = await geoResponse.json();
        
        const city = geoData.address.city || 
                     geoData.address.state || 
                     geoData.address.town || 
                     geoData.address.village || 
                     "PHNOM PENH";
        const country = geoData.address.country_code?.toUpperCase() || "KH";

        setEnvData({
          location: `${city.toUpperCase()}, ${country}`,
          temp: `${Math.round(data.current_weather.temperature)}°C`,
          coord: `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`
        });
      } catch (error) {
        console.error("Location Fetch Error:", error);
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Geolocation Error:", error);
          setEnvData(prev => ({ ...prev, location: "LOCAL_OFFLINE" }));
        }
      );
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchData();
      setSheetData(data);
    };
    loadData();
    const interval = setInterval(loadData, 3600000); // Once per hour
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`hud-page relative w-full h-screen overflow-hidden scanlines ${guiInverted ? 'bg-white' : 'bg-black'}`}>
      <FaceTracker onResult={setFaceData} cameraMode={cameraMode} />
      <div className={`absolute inset-0 pointer-events-none ${guiInverted ? 'invert hue-rotate-180' : ''}`}>
        <HUDOverlay 
          faceData={faceData} 
          sheetData={sheetData} 
          time={currentTime}
          env={envData}
          guiInverted={guiInverted}
          cameraMode={cameraMode}
          onToggleGuiInvert={() => setGuiInverted(prev => !prev)}
          onToggleCameraMode={() => setCameraMode(prev => (prev === 'mono' ? 'color' : 'mono'))}
        />
      </div>
    </div>
  );
}
