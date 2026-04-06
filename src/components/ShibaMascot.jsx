'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, PerspectiveCamera, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// --- Smooth 3D Shiba Model using High-Poly Primitives ---
function SmoothShiba({ state = 'idle', onPet }) {
  const group = useRef();
  const head = useRef();
  const tail = useRef();
  const mouth = useRef();
  
  // Animation loop for natural movement
  useFrame((stateObj, delta) => {
    const t = stateObj.clock.getElapsedTime();
    
    // Smooth idle breathing & swaying
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.5) * 0.05;
      group.current.rotation.y = Math.sin(t * 0.5) * 0.05;
    }
    
    // Head movement
    if (head.current) {
      if (state === 'nuzzling') {
        head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, 0.4 + Math.sin(t * 4) * 0.1, 0.1);
        head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, Math.sin(t * 3) * 0.15, 0.1);
      } else {
        head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, Math.sin(t * 0.8) * 0.05, 0.1);
        head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, Math.sin(t * 1.2) * 0.1, 0.1);
        head.current.rotation.z = THREE.MathUtils.lerp(head.current.rotation.z, 0, 0.1);
      }
    }
    
    // Tail Wagging (Super happy when trading or nuzzling)
    if (tail.current) {
      const wagSpeed = (state === 'buying' || state === 'selling' || state === 'nuzzling') ? 20 : 3;
      tail.current.rotation.y = Math.sin(t * wagSpeed) * 0.35;
    }
    
    // Mouth open if carrying something
    if (mouth.current) {
      mouth.current.position.y = (state === 'buying' || state === 'selling') ? -0.22 : -0.15;
    }
  });

  return (
    <group ref={group} dispose={null} onClick={onPet} cursor="pointer">
      {/* --- BODY --- */}
      <mesh position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="#f0932b" roughness={0.7} />
      </mesh>
      {/* Butt part of body to elongate */}
      <mesh position={[0, -0.05, -0.4]} castShadow>
        <sphereGeometry args={[0.48, 32, 32]} />
        <meshStandardMaterial color="#f0932b" roughness={0.7} />
      </mesh>
      {/* Underbelly (White) */}
      <mesh position={[0, -0.18, -0.1]} scale={[0.8, 0.5, 1.2]}>
        <sphereGeometry args={[0.48, 24, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} />
      </mesh>

      {/* --- HEAD --- */}
      <group ref={head} position={[0, 0.45, 0.45]}>
        {/* Main Head Sphere */}
        <mesh castShadow>
          <sphereGeometry args={[0.45, 32, 32]} />
          <meshStandardMaterial color="#f0932b" roughness={0.7} />
        </mesh>
        
        {/* Cheeks (Rounded Shiba cheeks) */}
        <mesh position={[0.25, -0.1, 0.1]} scale={[1, 0.85, 1]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.8} />
        </mesh>
        <mesh position={[-0.25, -0.1, 0.1]} scale={[1, 0.85, 1]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.8} />
        </mesh>

        {/* Snout Area (White) */}
        <mesh position={[0, -0.15, 0.3]} scale={[1, 0.7, 1]}>
          <sphereGeometry args={[0.25, 16, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.8} />
        </mesh>
        
        {/* Actual Nose Hub */}
        <mesh position={[0, -0.05, 0.45]}>
           <sphereGeometry args={[0.08, 12, 12]} />
           <meshStandardMaterial color="#2d3436" />
        </mesh>

        {/* Eyes (Shiny Dark Bubbles) */}
        <mesh position={[0.18, 0.1, 0.35]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color="#2d3436" metalness={0.8} roughness={0.1} />
        </mesh>
        <mesh position={[-0.18, 0.1, 0.35]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color="#2d3436" metalness={0.8} roughness={0.1} />
        </mesh>
        
        {/* Eyebrow dots (Light cream) */}
        <mesh position={[0.15, 0.25, 0.38]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#f9ca24" opacity={0.6} transparent />
        </mesh>
        <mesh position={[-0.15, 0.25, 0.38]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#f9ca24" opacity={0.6} transparent />
        </mesh>

        {/* Ears */}
        <group position={[0.3, 0.35, 0]} rotation={[0, 0, -0.2]}>
           <mesh castShadow>
             <coneGeometry args={[0.15, 0.35, 16]} />
             <meshStandardMaterial color="#f0932b" />
           </mesh>
           <mesh position={[0, -0.05, 0.05]} scale={[0.6, 0.6, 0.5]}>
             <coneGeometry args={[0.15, 0.3, 16]} />
             <meshStandardMaterial color="#ffffff" />
           </mesh>
        </group>
        <group position={[-0.3, 0.35, 0]} rotation={[0, 0, 0.2]}>
           <mesh castShadow>
             <coneGeometry args={[0.15, 0.35, 16]} />
             <meshStandardMaterial color="#f0932b" />
           </mesh>
           <mesh position={[0, -0.05, 0.05]} scale={[0.6, 0.6, 0.5]}>
             <coneGeometry args={[0.15, 0.3, 16]} />
             <meshStandardMaterial color="#ffffff" />
           </mesh>
        </group>

        {/* Lower Jaw (Mouth Area) */}
        <mesh ref={mouth} position={[0, -0.15, 0.35]} scale={[0.8, 0.5, 0.8]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color="#ffffff" />
        </mesh>

        {/* Trade Assets */}
        {state === 'buying' && (
          <group position={[0, -0.25, 0.55]}>
            <mesh castShadow>
              <sphereGeometry args={[0.18, 16, 16]} />
              <meshStandardMaterial color="#27ae60" emissive="#16a085" emissiveIntensity={0.5} />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
              <boxGeometry args={[0.04, 0.1, 0.04]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        )}
        {state === 'selling' && (
          <group position={[0, -0.25, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
             <mesh castShadow>
              <cylinderGeometry args={[0.2, 0.2, 0.04, 24]} />
              <meshStandardMaterial color="#f1c40f" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        )}
      </group>

      {/* --- LEGS --- */}
      {[[-0.28,-0.4, 0.3], [0.28,-0.4, 0.3], [-0.28,-0.4, -0.5], [0.28,-0.4, -0.5]].map((pos, i) => (
        <group key={i} position={pos}>
           <mesh castShadow>
              <capsuleGeometry args={[0.12, 0.4, 8, 16]} />
              <meshStandardMaterial color="#f0932b" />
           </mesh>
           <mesh position={[0, -0.25, 0]}>
              <sphereGeometry args={[0.14, 16, 16]} />
              <meshStandardMaterial color="#ffffff" />
           </mesh>
        </group>
      ))}

      {/* --- TAIL (Curled Shiba Tail) --- */}
      <group ref={tail} position={[0, 0.3, -0.7]} rotation={[0.4, 0, 0]}>
        <mesh castShadow position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#f0932b" />
        </mesh>
        <mesh position={[0, 0.2, 0.12]} scale={[0.7, 0.7, 0.7]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

export default function ShibaMascotContainer({ tradeEvent = null, isVisible = true }) {
  const [shibaState, setShibaState] = useState('idle');
  const [lastActivity, setLastActivity] = useState(Date.now());

  useEffect(() => {
    if (tradeEvent === 'BUY') {
      setShibaState('buying');
      const timer = setTimeout(() => setShibaState('idle'), 5000);
      setLastActivity(Date.now());
      return () => clearTimeout(timer);
    } else if (tradeEvent === 'SELL') {
      setShibaState('selling');
      const timer = setTimeout(() => setShibaState('idle'), 5000);
      setLastActivity(Date.now());
      return () => clearTimeout(timer);
    }
  }, [tradeEvent]);

  // Idle Nuzzling Logic
  useEffect(() => {
    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivity;
      if (inactiveTime > 20000 && shibaState === 'idle') {
        setShibaState('nuzzling');
        setTimeout(() => setShibaState('idle'), 6000);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastActivity, shibaState]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 w-64 h-64 z-[9999] pointer-events-none">
      <div className="w-full h-full pointer-events-auto cursor-pointer group" onClick={() => setLastActivity(Date.now())}>
        
        {/* Status Bubble */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity bg-teal-900/90 text-teal-300 text-[10px] px-3 py-1.5 rounded-2xl whitespace-nowrap mb-4 border border-teal-500/30 font-bold tracking-tight shadow-xl">
           Shiba AI • {shibaState === 'idle' ? 'Scanning...' : shibaState.toUpperCase()}
        </div>
        
        <Canvas shadows gl={{ antialias: true, alpha: true }}>
          <PerspectiveCamera makeDefault position={[0, 2, 5]} fov={40} />
          <ambientLight intensity={0.6} />
          <spotLight position={[5, 10, 5]} angle={0.3} penumbra={1} intensity={2.5} castShadow />
          <pointLight position={[-10, 0, 5]} intensity={0.8} color="#f9ca24" />
          <pointLight position={[10, 0, -5]} intensity={0.5} color="#ecf0f1" />
          
          <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.6}>
            <SmoothShiba state={shibaState} onPet={() => setLastActivity(Date.now())} />
          </Float>
          
          <ContactShadows position={[0, -0.65, 0]} opacity={0.4} scale={6} blur={3} far={1} />
          <Environment preset="city" />
          
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            minPolarAngle={Math.PI / 4} 
            maxPolarAngle={Math.PI / 2} 
          />
        </Canvas>
      </div>
    </div>
  );
}
