import { useEffect, useRef } from 'react';
import { useApp } from '../app/store.js';
import { closeCamera, loadClipIds, openCamera, useCamera } from './CameraRecorder.js';

/**
 * Opens the camera while the timer page has recording switched on, and shows a small
 * live picture so the cube can be framed. Recording itself follows the timer.
 */
export function CameraPreview({ inline = false }) {
  const enabled = useApp((s) => s.settings.recordSolves);
  const deviceId = useApp((s) => s.settings.cameraDeviceId);
  const mirror = useApp((s) => s.settings.mirrorCamera);
  const { status, error, stream, recording } = useCamera();
  const video = useRef(null);

  useEffect(() => {
    loadClipIds();
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    openCamera({ deviceId });
    return () => closeCamera();
  }, [enabled, deviceId]);

  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);

  if (!enabled) return null;

  return (
    <div
      className={inline ? 'focus-fade self-center w-[8.5rem] sm:w-[11rem] mt-1 shrink-0' : 'focus-fade absolute left-5 z-10 w-[13rem]'}
      style={inline ? undefined : { top: 'calc(var(--page-top) + 4.5rem)' }}
      data-testid="camera-preview"
    >
      {status === 'error' ? (
        <p className="m-0 text-[0.75rem] text-danger glass rounded-[12px] p-2" role="alert" data-testid="camera-error">
          {error}
        </p>
      ) : (
        <div className="relative rounded-[14px] overflow-hidden bg-black/80 aspect-video shadow-sm">
          <video ref={video} autoPlay muted playsInline className="w-full h-full object-cover" style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
          <span
            className="absolute left-1.5 top-1.5 flex items-center gap-1 text-[0.625rem] font-semibold text-white bg-black/55 rounded-full px-1.5 py-0.5"
            data-testid="camera-state"
            data-recording={recording}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${recording ? 'bg-[#ff4d4f]' : 'bg-white/60'}`} />
            {status === 'starting' ? 'Starting' : recording ? 'Recording' : 'Camera on'}
          </span>
        </div>
      )}
    </div>
  );
}
