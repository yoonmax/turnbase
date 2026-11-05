import { Suspense, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import gsap from 'gsap';
import { CubeRenderer } from './CubeRenderer.jsx';
import { resolveScheme } from './CubeThemes.js';
import { libraryColors } from '../algorithms/libraryColors.js';
import { useApp } from '../app/store.js';
import { prefersReducedMotion } from '../app/appearance.js';
import { CubeNet } from '../scrambles/CubeNet.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

// Camera directions, as unit-ish vectors. The default shows U, F and R, which is
// how algorithm diagrams and instructions conventionally present the cube.
export const CAMERA_VIEWS = {
  front: { label: 'Front', dir: [0.72, 0.78, 1.15] },
  back: { label: 'Back', dir: [-0.72, 0.78, -1.15] },
  top: { label: 'Top', dir: [0.001, 1.6, 0.42] },
  under: { label: 'Under', dir: [0.72, -0.9, 1.1] },
};

function Rig({ n, controlsRef, apiRef, autoFrame }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  const distance = useMemo(() => {
    // Keep the whole cube in frame in narrow views too.
    const aspect = size.width / Math.max(size.height, 1);
    const fit = aspect < 1 ? 1 / aspect : 1;
    return (11.2 + (n - 3) * 3.5) * fit;
  }, [n, size]);

  const place = (dir, animate) => {
    const v = dir.slice();
    const length = Math.hypot(...v);
    const target = v.map((c) => (c / length) * distance);
    if (!animate || prefersReducedMotion()) {
      camera.position.set(...target);
      controlsRef.current?.update();
      invalidate();
      return;
    }
    gsap.to(camera.position, {
      x: target[0],
      y: target[1],
      z: target[2],
      duration: 0.55,
      ease: 'power2.inOut',
      onUpdate: () => {
        controlsRef.current?.update();
        invalidate();
      },
    });
  };

  useEffect(() => {
    if (autoFrame) place(CAMERA_VIEWS.front.dir, false);
    // Refit when the canvas or cube size changes.
  }, [distance]); // eslint-disable-line react-hooks/exhaustive-deps

  apiRef.current = { setView: (name) => place(CAMERA_VIEWS[name].dir, true) };
  return null;
}

function Lighting({ dark }) {
  return (
    <>
      <ambientLight intensity={dark ? 1.55 : 1.65} />
      <directionalLight position={[2, 8, 4]} intensity={1.35} />
      <directionalLight position={[6, 2, 3]} intensity={0.75} />
      <directionalLight position={[-5, 1, 4]} intensity={0.55} />
      <directionalLight position={[-3, -4, -5]} intensity={0.6} />
      <Suspense fallback={null}>
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={0.55} position={[0, 7, 1]} rotation={[-Math.PI / 2, 0, 0]} scale={[6, 4, 1]} color="#ffffff" />
          <Lightformer form="rect" intensity={0.3} position={[7, 1, 3]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 5, 1]} color="#fff6ea" />
          <Lightformer form="rect" intensity={0.2} position={[-7, 0, 2]} rotation={[0, Math.PI / 2, 0]} scale={[4, 5, 1]} color="#eef3ff" />
        </Environment>
      </Suspense>
    </>
  );
}

function useResolvedDark(environment) {
  const [systemDark, setSystemDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => setSystemDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  if (environment === 'light') return false;
  if (environment === 'dark') return true;
  return systemDark;
}

/**
 * A complete cube view: canvas, lighting and camera. Falls back to a flat net if
 * WebGL is unavailable, because the cube state is still fully usable without it.
 */
export const CubeScene = forwardRef(function CubeScene({ controller, interactive = false, onMove = null, className = '', minHeight = 280, testId = 'cube-canvas', library = false }, ref) {
  const settings = useApp((s) => s.settings);
  const colors = useMemo(() => {
    const scheme = resolveScheme(settings);
    return library ? libraryColors(scheme) : scheme;
  }, [settings, library]);
  const orbit = useRef(null);
  const api = useRef(null);
  const dark = useResolvedDark(settings.cubeEnvironment);
  const [lostGl, setLostGl] = useState(false);

  useImperativeHandle(ref, () => ({ setView: (name) => api.current?.setView(name) }), []);

  useEffect(() => {
    controller.configure({ turnMs: settings.turnMs, easing: settings.turnEasing, instant: settings.instantMoves });
  }, [controller, settings.turnMs, settings.turnEasing, settings.instantMoves]);

  const fallback = (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-4" data-testid="cube-fallback">
      <CubeNet state={controller.state} n={controller.n} width={260} colorsOverride={library ? colors : null} />
      <p className="m-0 text-[0.8125rem] text-graphite text-center">The 3D cube needs WebGL, which is not available here. This diagram still follows every move.</p>
    </div>
  );

  // Weak devices get a lower pixel ratio. Timing is unaffected either way.
  const dpr = useMemo(() => {
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 4;
    return weak ? [1, 1.25] : [1, 2];
  }, []);

  const background = settings.cubeEnvironment === 'dark' ? '#17181a' : settings.cubeEnvironment === 'light' ? '#f7f6f2' : 'transparent';

  return (
    <div className={`${className.includes('absolute') ? '' : 'relative'} ${className}`} style={{ minHeight, background, touchAction: 'none' }} data-testid={testId}>
      {lostGl ? (
        fallback
      ) : (
        <ErrorBoundary title="The 3D cube could not start.">
          <Canvas
            frameloop="demand"
            flat
            dpr={dpr}
            camera={{ position: [3.4, 3.6, 5.4], fov: 30, near: 0.1, far: 100 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                setLostGl(true);
              });
            }}
            style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
          >
            <Lighting dark={dark} />
            <CubeRenderer
              controller={controller}
              colors={colors}
              style={settings.cubeStyle}
              bodyColor={settings.cubeStyle === 'stickerless' ? '#26272b' : '#141518'}
              interactive={interactive}
              onMove={onMove}
              orbit={orbit}
            />
            <OrbitControls ref={orbit} makeDefault enablePan={false} enableDamping dampingFactor={0.12} minDistance={3 + controller.n} maxDistance={18 + controller.n * 2} rotateSpeed={0.85} />
            <Rig n={controller.n} controlsRef={orbit} apiRef={api} autoFrame />
          </Canvas>
        </ErrorBoundary>
      )}
    </div>
  );
});

export function CameraViews({ sceneRef }) {
  return (
    <div className="segmented self-start" role="group" aria-label="Camera angle">
      {Object.entries(CAMERA_VIEWS).map(([id, view]) => (
        <button key={id} type="button" data-testid={`view-${id}`} onClick={() => sceneRef.current?.setView(id)}>
          {view.label}
        </button>
      ))}
    </div>
  );
}
