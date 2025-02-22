import React, { useState, useEffect } from 'react';

const EyeLogo = ({ mousePosition }) => {
  const eyeRadius = 67; // Increased by 1.5x from 45
  const pupilRadius = 18; // Increased by 1.5x from 12
  const maxPupilOffset = eyeRadius - pupilRadius - 7;
  
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-75 -75 150 150" className="w-full h-full">
      <circle cx="0" cy="0" r={eyeRadius} fill="none" stroke="currentColor" strokeWidth="15"/>
      <circle 
        cx={pupilPosition.x} 
        cy={pupilPosition.y} 
        r={pupilRadius} 
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
      <div className="flex items-end justify-center">
        <div id="eye-container" className="w-16 h-16 md:w-32 md:h-32 text-white">
          <EyeLogo mousePosition={mousePosition} />
        </div>
        <span className="ml-2 md:ml-4 text-[64px] md:text-[128px] font-golos leading-none">bserver</span>
      </div>
    </div>
  );
};

export default ObserverLanding;
