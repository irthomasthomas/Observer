import React, { useState, useEffect } from 'react';

const EyeLogo = ({ mousePosition }) => {
  const eyeRadius = 45;
  const pupilRadius = 12;
  const maxPupilOffset = eyeRadius - pupilRadius - 5;
  
  const calculatePupilPosition = () => {
    if (!mousePosition.x || !mousePosition.y) return { x: 0, y: 0 };
    
    const rect = document.getElementById('eye-container')?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    const eyeCenterX = rect.left + rect.width / 2;
    const eyeCenterY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(mousePosition.y - eyeCenterY, mousePosition.x - eyeCenterX);
    const distance = Math.min(
      maxPupilOffset,
      Math.sqrt(Math.pow(mousePosition.x - eyeCenterX, 2) + Math.pow(mousePosition.y - eyeCenterY, 2)) / 8
    );
    
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    };
  };
  
  const pupilPosition = calculatePupilPosition();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" className="w-full h-full">
      <circle cx="0" cy="0" r="45" fill="none" stroke="currentColor" strokeWidth="10"/>
      <circle 
        cx={pupilPosition.x} 
        cy={pupilPosition.y} 
        r="12" 
        fill="currentColor"
        className="transition-transform duration-75 ease-out"
      />
    </svg>
  );
};

const ObserverLanding = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="container mx-auto px-6 py-16 text-center">
      <h1 className="text-6xl font-bold mb-8 flex items-center justify-center">
        <span id="eye-container" className="w-32 h-32 text-white">
          <EyeLogo mousePosition={mousePosition} />
        </span>
        <span className="ml-2 font-golos">bserver</span>
      </h1>
    </div>
  );
};

export default ObserverLanding;
