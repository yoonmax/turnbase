import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACE_ORDER, faceletString, getCubeModel } from './CubeEngine.js';
import { moveFromDrag } from './CubeControls.js';

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const CUBIE = 0.985;
const SHELL_DEPTH = CUBIE / 2 + 0.002;

function roundedSquareShape(size, radius) {
  const s = size / 2;
  const r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

function stickerGeometry(style) {
  const stickerless = style === 'stickerless';
  const size = stickerless ? 0.93 : 0.82;
  const radius = stickerless ? 0.15 : 0.11;
  const geometry = new THREE.ExtrudeGeometry(roundedSquareShape(size, radius), {
    depth: 0.006,
    bevelEnabled: true,
    bevelSize: stickerless ? 0.012 : 0.008,
    bevelThickness: 0.008,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Draws a controller's pose. The pieces have fixed places, colours come straight
 * from the exact state, and the only motion is the current layer's rotation, so
 * the picture can never disagree with the logic once a turn ends.
 */
export function CubeRenderer({ controller, colors, style = 'stickered', bodyColor = '#17181b', interactive = false, onMove = null, orbit = null }) {
  const { n } = controller;
  const model = useMemo(() => getCubeModel(n), [n]);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const stickerMesh = useRef(null);
  const bodyMesh = useRef(null);
  const drag = useRef(null);
  const renderCount = useRef(0);
  const lastDrawn = useRef({ visual: null, colors: null, rotating: false });

  // Cube-space scale: pieces are one unit wide and centred on the origin.
  const bodies = useMemo(() => {
    const seen = [];
    const half = (n - 1) / 2;
    for (let x = -half; x <= half; x += 1) {
      for (let y = -half; y <= half; y += 1) {
        for (let z = -half; z <= half; z += 1) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === half) seen.push([x, y, z]);
        }
      }
    }
    return seen;
  }, [n]);

  const bases = useMemo(() => {
    const object = new THREE.Object3D();
    const forward = new THREE.Vector3(0, 0, 1);
    const stickerMatrices = model.stickers.map((sticker) => {
      const normal = new THREE.Vector3(...sticker.normal);
      object.position.set(...sticker.pos.map((c) => c / 2)).addScaledVector(normal, SHELL_DEPTH);
      object.quaternion.setFromUnitVectors(forward, normal);
      object.updateMatrix();
      return object.matrix.clone();
    });
    object.quaternion.identity();
    const bodyMatrices = bodies.map((pos) => {
      object.position.set(...pos);
      object.updateMatrix();
      return object.matrix.clone();
    });
    return { stickerMatrices, bodyMatrices };
  }, [model, bodies]);

  const geometries = useMemo(
    () => ({
      sticker: stickerGeometry(style),
      body: new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 3, 0.075),
    }),
    [style],
  );

  useEffect(
    () => () => {
      geometries.sticker.dispose();
      geometries.body.dispose();
    },
    [geometries],
  );

  const palette = useMemo(() => FACE_ORDER.map((face) => new THREE.Color(colors[face])), [colors]);

  useLayoutEffect(() => {
    lastDrawn.current = { visual: null, colors: null, rotating: true };
    invalidate();
  }, [geometries, palette, invalidate]);

  useEffect(() => controller.subscribe(() => invalidate()), [controller, invalidate]);

  // Browser tests compare rendered pixels with the logic, through this one door.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return undefined;
    window.__turnbaseCube = {
      controller,
      facelets: () => faceletString(controller.state, n),
      frames: () => renderCount.current,
      visible: () =>
        model.stickers
          .map((sticker) => {
            const point = new THREE.Vector3(...sticker.pos.map((c, i) => c / 2 + sticker.normal[i] * 0.5));
            const normal = new THREE.Vector3(...sticker.normal);
            const facing = camera.position.clone().sub(point).normalize().dot(normal) > 0.25;
            if (!facing) return null;
            const v = point.clone().project(camera);
            return { id: sticker.id, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
          })
          .filter(Boolean),
    };
    return () => {
      delete window.__turnbaseCube;
    };
  });

  const rotation = useMemo(() => new THREE.Matrix4(), []);
  const composed = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    const stickers = stickerMesh.current;
    const pieces = bodyMesh.current;
    if (!stickers || !pieces) return;
    renderCount.current += 1;
    const pose = controller.update();
    const last = lastDrawn.current;

    if (last.visual !== pose.visual || last.colors !== palette) {
      for (let i = 0; i < pose.visual.length; i += 1) {
        stickers.setColorAt(i, palette[Math.floor(pose.visual[i] / model.perFace)]);
      }
      stickers.instanceColor.needsUpdate = true;
      last.visual = pose.visual;
      last.colors = palette;
    }

    const rotating = pose.layers !== null;
    if (rotating || last.rotating) {
      if (rotating) rotation.makeRotationAxis(AXES[pose.axis], pose.angle);
      const coords = rotating ? new Set(pose.layers.map((l) => 2 * l - (n - 1))) : null;
      model.stickers.forEach((sticker, i) => {
        if (rotating && coords.has(sticker.pos[pose.axis])) {
          composed.multiplyMatrices(rotation, bases.stickerMatrices[i]);
          stickers.setMatrixAt(i, composed);
        } else {
          stickers.setMatrixAt(i, bases.stickerMatrices[i]);
        }
      });
      bodies.forEach((pos, i) => {
        if (rotating && coords.has(pos[pose.axis] * 2)) {
          composed.multiplyMatrices(rotation, bases.bodyMatrices[i]);
          pieces.setMatrixAt(i, composed);
        } else {
          pieces.setMatrixAt(i, bases.bodyMatrices[i]);
        }
      });
      stickers.instanceMatrix.needsUpdate = true;
      pieces.instanceMatrix.needsUpdate = true;
      last.rotating = rotating;
    }

    if (controller.animating) invalidate();
  });

  // ─── Drag on a sticker to turn its layer ───────────
  const project = (point) => {
    const v = new THREE.Vector3(...point).project(camera);
    return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
  };

  useEffect(() => {
    if (!interactive) return undefined;
    const onPointerMove = (event) => {
      const current = drag.current;
      if (!current || current.done) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (Math.hypot(dx, dy) < 10) return;
      current.done = true;
      onMove?.(moveFromDrag({ sticker: current.sticker, n, drag: [dx, dy], project }));
    };
    const onPointerUp = () => {
      if (drag.current && orbit?.current) orbit.current.enabled = true;
      drag.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  });

  const onStickerDown = (event) => {
    if (!interactive || event.instanceId === undefined) return;
    event.stopPropagation();
    if (orbit?.current) orbit.current.enabled = false;
    drag.current = {
      sticker: model.stickers[event.instanceId],
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      done: false,
    };
  };

  return (
    <group>
      <instancedMesh ref={bodyMesh} args={[geometries.body, undefined, bodies.length]} frustumCulled={false} onPointerDown={interactive ? (e) => e.stopPropagation() : undefined}>
        <meshStandardMaterial color={bodyColor} roughness={0.62} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={stickerMesh} args={[geometries.sticker, undefined, model.count]} frustumCulled={false} onPointerDown={onStickerDown}>
        <meshPhysicalMaterial roughness={style === 'stickerless' ? 0.5 : 0.42} metalness={0} clearcoat={style === 'stickerless' ? 0.08 : 0.22} clearcoatRoughness={0.5} envMapIntensity={0.55} />
      </instancedMesh>
    </group>
  );
}
