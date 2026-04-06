'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, PerspectiveCamera, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// --- The Original Procedural 3D ShibaRobot ---
function ShibaRobot({ state = 'idle', onPet }) {
  const group = useRef();
  const head = useRef();
  const tail = useRef();
  const leftEar = useRef();
  const rightEar = useRef();
  const mouth = useRef();
  
  // Animation loop for ShibaRobot movements
  useFrame((stateObj, delta) => {
    const t = stateObj.clock.getElapsedTime();
    
    // Natural Idle swaying
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.5) * 0.05;
      group.current.rotation.y = Math.sin(t * 0.5) * 0.05;
    }
    
    // Head logic
    if (head.current) {
      if (state === 'nuzzling') {
        // "Licking" or nuzzling rotation
        head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, 0.4 + Math.sin(t * 4) * 0.1, 0.1);
        head.current.rotation.z = Math.sin(t * 3) * 0.1;
      } else {
        head.current.rotation.x = Math.sin(t * 1) * 0.1;
        head.current.rotation.y = Math.sin(t * 0.8) * 0.1;
      }
    }
    
    // Tail Wagging (Speed up when happy/activity)
    if (tail.current) {
      const wagSpeed = (state === 'buying' || state === 'selling' || state === 'nuzzling') ? 15 : 2;
      tail.current.rotation.z = Math.sin(t * wagSpeed) * 0.3;
    }
    
    // Mouth open for trade assets
    if (mouth.current) {
      mouth.current.position.y = (state === 'buying' || state === 'selling') ? -0.2 : -0.15;
    }
  });

  return (
    <group ref={group} dispose={null} onClick={onPet} cursor="pointer">
      {/* BODY */}
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.6, 0.9]} />
        <meshStandardMaterial color="#f0932b" roughness={0.1} metalness={0.8} />
      </mesh>
      
      {/* HEAD */}
      <group ref={head} position={[0, 0.5, 0.5]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#f0932b" roughness={0.1} metalness={0.8} />
        </mesh>
        
        {/* Snout */}
        <mesh position={[0, -0.1, 0.35]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#ffffff" roughness={0.1} />
        </mesh>
        
        {/* Ears */}
        <mesh ref={leftEar} position={[0.2, 0.35, 0]}>
          <coneGeometry args={[0.1, 0.2, 4]} />
          <meshStandardMaterial color="#f0932b" />
        </mesh>
        <mesh ref={rightEar} position={[-0.2, 0.35, 0]}>
          <coneGeometry args={[0.1, 0.2, 4]} />
          <meshStandardMaterial color="#f0932b" />
        </mesh>
        
        {/* Eyes (Digital glowing eyes) */}
        <mesh position={[0.15, 0.1, 0.26]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial color="#2d3436" emissive="#00d2d3" emissiveIntensity={2} />
        </mesh>
        <mesh position={[-0.15, 0.1, 0.26]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial color="#2d3436" emissive="#00d2d3" emissiveIntensity={2} />
        </mesh>

        {/* Mouth/Jaw */}
        <mesh ref={mouth} position={[0, -0.15, 0.3]}>
          <boxGeometry args={[0.2, 0.05, 0.15]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>

        {/* Trade Assets in Mouth */}
        {state === 'buying' && (
          <group position={[0, -0.25, 0.4]}>
             <mesh castShadow>
               <boxGeometry args={[0.2, 0.25, 0.2]} />
               <meshStandardMaterial color="#2ecc71" emissive="#2ecc71" emissiveIntensity={1} />
             </mesh>
             <mesh position={[0, 0.15, 0]}>
                <sphereGeometry args={[0.05]} />
                <meshStandardMaterial color="#ffffff" />
             </mesh>
          </group>
        )}
        {state === 'selling' && (
           <group position={[0, -0.25, 0.4]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.15, 0.15, 0.04, 24]} />
                <meshStandardMaterial color="#f1c40f" metalness={0.9} roughness={0.1} />
              </mesh>
           </group>
        )}
      </group>

      {/* LEGS */}
      {[[-0.3,-0.4, 0.3], [0.3,-0.4, 0.3], [-0.3,-0.4, -0.3], [0.3,-0.4, -0.3]].map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <boxGeometry args={[0.15, 0.3, 0.15]} />
          <meshStandardMaterial color="#2d3436" metalness={0.9} />
        </mesh>
      ))}

      {/* TAIL (Cyber curl) */}
      <mesh ref={tail} position={[0, 0.2, -0.5]}>
        <torusGeometry args={[0.15, 0.05, 16, 32]} />
        <meshStandardMaterial color="#f0932b" metalness={0.7} />
      </mesh>
    </group>
  );
}

export default function ShibaMascotContainer({ tradeEvent = null, isVisible = true }) {
  const [shibaState, setShibaState] = useState('idle');
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Handle detection of trades
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

  // Idle Licking/Nuzzling Logic (15s inactivity)
  useEffect(() => {
    const interval = setInterval(() => {
      const inactive = Date.now() - lastActivity;
      if (inactive > 15000 && shibaState === 'idle') {
        setShibaState('nuzzling');
        setTimeout(() => setShibaState('idle'), 6000);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastActivity, shibaState]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 w-64 h-64 z-[10000] pointer-events-none group">
      <div className="w-full h-full pointer-events-auto cursor-pointer relative" onClick={() => setLastActivity(Date.now())}>
        
        {/* Status Bubble (Modern Cyber Style) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 opacity-0 group-hover:opacity-100 transition-all bg-indigo-900/90 text-indigo-300 text-[10px] px-3 py-1.5 rounded-2xl border border-indigo-500/30 font-bold tracking-tight shadow-xl">
           ShibaBot AI • {shibaState === 'idle' ? 'Scanning...' : 'Active'}
        </div>
        
        <Canvas shadows gl={{ antialias: true, alpha: true }}>
          <PerspectiveCamera makeDefault position={[0, 1.5, 4]} fov={35} />
          <ambientLight intensity={0.6} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={3} castShadow />
          <pointLight position={[-10, -10, -10]} color="indigo" intensity={1} />
          
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
            <ShibaRobot state={shibaState} onPet={() => setLastActivity(Date.now())} />
          </Float>
          
          <ContactShadows position={[0, -0.6, 0]} opacity={0.4} scale={5} blur={2} far={1} />
          <Environment preset="city" />
          
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            minPolarAngle={Math.PI / 4} 
            maxPolarAngle={Math.PI / 1.8} 
          />
        </Canvas>
      </div>
    </div>
  );
}
