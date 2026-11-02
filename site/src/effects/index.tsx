import { Component, lazy, Suspense, type ReactNode } from "react";
import { DEFAULT_SEA, SEAS } from "./seas";

// three and ogl are large and purely decorative, so they load after the page does.
const ASCIIText = lazy(() => import("./ASCIIText.jsx"));
const MicroSlats = lazy(() => import("./MicroSlats.jsx"));

// The boxes are short, so letters need small cells and a plane that fills the frame.
const ASCII_CELL = 4;
const ASCII_PLANE = 16;
const HERO_PLANE_WIDTH = 170; // Shrinks long titles so they aren't clipped.

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** No WebGL, or a chunk that failed to load, leaves the page as it is without the effect. */
class EffectBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Effect({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  if (reducedMotion) return <>{fallback}</>;
  return (
    <EffectBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </EffectBoundary>
  );
}

/** Fixed behind the page, on every route. */
export function SeaBackdrop({ route }: { route: string }) {
  const sea = SEAS[route] ?? DEFAULT_SEA;
  return (
    <Effect>
      <div aria-hidden="true" className="pf-sea">
        <MicroSlats {...sea} />
      </div>
    </Effect>
  );
}

/** The ASCII layer is decorative, so the real text stays available to screen readers. */
export function AsciiBrand({ text, fallback }: { text: string; fallback: ReactNode }) {
  return (
    <Effect fallback={fallback}>
      <span aria-hidden="true" className="pf-brand-ascii">
        <ASCIIText asciiFontSize={ASCII_CELL} planeBaseHeight={ASCII_PLANE} text={text} textColor="#00c9c7" />
      </span>
      <span className="pf-sr-only">{text}</span>
    </Effect>
  );
}

export function AsciiHero({ text }: { text: string }) {
  return (
    <Effect>
      <div aria-hidden="true" className="pf-ascii-hero">
        <ASCIIText
          asciiFontSize={ASCII_CELL}
          planeBaseHeight={Math.min(ASCII_PLANE, HERO_PLANE_WIDTH / text.length)}
          enableHueShift={false}
          enableWaves={false}
          text={text}
          textColor="#00c9c7"
        />
      </div>
    </Effect>
  );
}
