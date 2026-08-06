import { useRef, useState } from 'react';

// The visual gradient bar with a draggable handle per color stop. Split
// out of GradientGenerator.jsx because dragging is a genuinely separate
// concern (pointer capture, keyboard nudging) from the rest of that
// component's form-field wiring.
//
// Dragging uses the Pointer Events API with setPointerCapture(): once a
// handle is pressed, ALL subsequent pointer events for that gesture are
// redirected to it (and still bubble up to the track's own listeners
// below) even if the cursor moves outside the bar entirely - this is
// what lets a fast drag past the bar's edge keep working instead of
// silently dropping the gesture.
//
// Keyboard support (Arrow keys, Home/End) is what makes stop positioning
// possible without a mouse at all, since dragging alone never is.

export default function GradientBar({ stops, cssBackground, onPositionChange }) {
  const trackRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);

  function positionFromClientX(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  }

  function handlePointerDown(event, id) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function handlePointerMove(event) {
    if (!draggingId) return;
    onPositionChange(draggingId, positionFromClientX(event.clientX));
  }

  function handlePointerUp() {
    setDraggingId(null);
  }

  function handleKeyDown(event, stop) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onPositionChange(stop.id, stop.position - step);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onPositionChange(stop.id, stop.position + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onPositionChange(stop.id, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onPositionChange(stop.id, 100);
    }
  }

  return (
    <div
      ref={trackRef}
      className="gradient-bar"
      style={{ background: cssBackground }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {stops.map((stop, index) => (
        <div
          key={stop.id}
          className={stop.id === draggingId ? 'gradient-bar-handle is-dragging' : 'gradient-bar-handle'}
          style={{ left: `${stop.position}%`, backgroundColor: `rgb(${stop.color.r} ${stop.color.g} ${stop.color.b})` }}
          role="slider"
          tabIndex={0}
          aria-label={`Color stop ${index + 1} position`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stop.position}
          aria-valuetext={`${stop.position}%`}
          onPointerDown={(event) => handlePointerDown(event, stop.id)}
          onKeyDown={(event) => handleKeyDown(event, stop)}
        />
      ))}
    </div>
  );
}
