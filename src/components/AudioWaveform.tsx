import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking';
  isActive: boolean;
  isMuted?: boolean;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ status, isActive, isMuted = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = (rect?.width || 300) * window.devicePixelRatio;
      canvas.height = (rect?.height || 180) * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clear the canvas with transparent black
      ctx.clearRect(0, 0, width, height);

      phaseRef.current += 0.05; // speed of moving wave

      if (status === 'disconnected' || (status === 'listening' && isMuted)) {
        // Draw a straight dim line
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (status === 'connecting') {
        // Draw a rotating loading circle/radar pulse
        const centerX = width / 2;
        const centerY = height / 2;
        // Make radius scale naturally with canvas size, but never negative
        const radius = Math.max(4, Math.min(centerX, centerY) * 0.7);

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius,
          phaseRef.current % (2 * Math.PI),
          (phaseRef.current + Math.PI / 2) % (2 * Math.PI)
        );
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        // Connected / Listening / Speaking state -> render complex sine waves
        // Adjust settings based on state
        let numWaves = 4;
        let baseAmplitude = status === 'speaking' ? 30 : 12; // taller waves when speaking
        let frequencyScale = status === 'speaking' ? 0.025 : 0.015;
        let speed = status === 'speaking' ? 0.08 : 0.04;

        // Add a breathing effect to base amplitude
        baseAmplitude += Math.sin(phaseRef.current * 0.8) * (status === 'speaking' ? 8 : 3);

        const colors = [
          'rgba(139, 92, 246, 0.65)', // Violet
          'rgba(6, 182, 212, 0.65)',  // Cyan
          'rgba(236, 72, 153, 0.55)',  // Rose
          'rgba(99, 102, 241, 0.45)'   // Indigo
        ];

        ctx.globalCompositeOperation = 'screen';

        for (let i = 0; i < numWaves; i++) {
          ctx.beginPath();
          
          const waveAmplitude = baseAmplitude * (1 - i * 0.2);
          const wavePhase = phaseRef.current * (1 + i * 0.1) * speed * 15;
          
          ctx.moveTo(0, height / 2);

          for (let x = 0; x < width; x++) {
            // Apply a nice bell curve window so the wave tapers off at the left and right edges
            const windowPercent = Math.sin((x / width) * Math.PI);
            const y =
              height / 2 +
              Math.sin(x * frequencyScale * (1 + i * 0.15) + wavePhase) *
                waveAmplitude *
                windowPercent;
            
            ctx.lineTo(x, y);
          }

          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth = i === 0 ? 3.5 : 2;
          ctx.stroke();
        }
        
        ctx.globalCompositeOperation = 'source-over';
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    if (isActive) {
      draw();
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'block',
        filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.2))'
      }} 
    />
  );
};
