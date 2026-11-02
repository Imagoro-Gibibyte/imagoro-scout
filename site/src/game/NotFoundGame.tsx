import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SEA } from "../effects/seas";
import { PELLETS, SPREAD_DEG, slatLanes, spawnInterval, targetSpeed } from "./rules";
import { cubeFaces, MUZZLE, PIVOT, SHOTGUN, type Face, type Rgb, type Vec3 } from "./voxels";

const PIXEL = 3; // CSS px per game pixel: the low resolution is the look.
const FLASH_COLOR: Rgb = [1, 0.82, 0.35]; // The engine's light caliber.
const SPARK_COLOR: Rgb = [1, 0.92, 0.65];
const BULB: Rgb = [1, 0.75, 0.45];
const GIRDER: Rgb = [0.28, 0.1, 0.08];
const CHIPS_PER_VOXEL = 2;
const FLASH_TIME = 0.09;
const SHOT_COOLDOWN = 0.16;
const RESTART_DELAY = 0.6; // A panicked click on the last shot shouldn't start a new run.
const BEST_KEY = "imagoro-404-best";

const TARGET_SHAPE = ["..###..", ".#####.", "##...##", "##.#.##", "##...##", ".#####.", "..###.."];

type Phase = "ready" | "playing" | "over";

interface Target {
  x: number;
  y: number;
  direction: 1 | -1;
  speed: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: Rgb;
  gravity: number;
}

const css = ([r, g, b]: Rgb, scale = 1) =>
  `rgb(${Math.min(255, r * scale * 255) | 0},${Math.min(255, g * scale * 255) | 0},${Math.min(255, b * scale * 255) | 0})`;

function readBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Private browsing: the best score just lasts for this page.
  }
}

/** Rotates model space into the camera's, with the barrel pointing into the screen. */
function gunTransform(yaw: number, pitch: number) {
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  const rotate = ([x, y, z]: Vec3): Vec3 => {
    const py = y * cp + x * sp;
    const pz = x * cp - y * sp;
    return [z * cy + pz * sy, py, pz * cy - z * sy];
  };
  return (point: Vec3, offset: Vec3 = [0, 0, 0]): Vec3 => {
    const [x, y, z] = rotate([point[0] - PIVOT[0], point[1] - PIVOT[1], point[2] - PIVOT[2]]);
    return [x + offset[0], y + offset[1], z + offset[2]];
  };
}

export function NotFoundGame({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;
    let lanes: number[] = [];
    let current: Phase = "ready";
    let hits = 0;
    let targets: Target[] = [];
    let particles: Particle[] = [];
    let tracers: { x: number; y: number; life: number }[] = [];
    let aim = { x: 0, y: 0 };
    let flash = 0;
    let cooldown = 0;
    let recoil = 0;
    let untilSpawn = 0;
    let sinceOver = RESTART_DELAY;
    let last = performance.now();
    let frame = 0;

    const slatH = DEFAULT_SEA.slatHeight ?? 25;
    const targetSize = Math.max(1, Math.round((slatH * 0.8) / TARGET_SHAPE.length / PIXEL)) * PIXEL;
    const targetSpan = targetSize * TARGET_SHAPE.length;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.ceil(width / PIXEL);
      canvas.height = Math.ceil(height / PIXEL);
      const header = document.querySelector(".pf-header")?.getBoundingClientRect().bottom ?? 0;
      lanes = slatLanes(height, header, height * 0.72, DEFAULT_SEA);
      if (aim.x === 0) aim = { x: width / 2, y: height / 2 };
    }

    function end() {
      current = "over";
      sinceOver = 0;
      setPhase("over");
      setBest((previous) => {
        const next = Math.max(previous, hits);
        saveBest(next);
        return next;
      });
    }

    function start() {
      hits = 0;
      targets = [];
      particles = [];
      tracers = [];
      untilSpawn = 0;
      current = "playing";
      setScore(0);
      setPhase("playing");
    }

    function spawn() {
      const y = lanes[Math.floor(Math.random() * lanes.length)];
      if (y === undefined) return;
      const direction = Math.random() < 0.5 ? 1 : -1;
      targets.push({ x: direction === 1 ? -targetSpan : width + targetSpan, y, direction, speed: targetSpeed(hits) });
    }

    function shatter(target: Target) {
      TARGET_SHAPE.forEach((row, ty) =>
        [...row].forEach((cell, tx) => {
          if (cell === ".") return;
          for (let i = 0; i < CHIPS_PER_VOXEL; i++) {
            particles.push({
              x: target.x - targetSpan / 2 + tx * targetSize,
              y: target.y - targetSpan / 2 + ty * targetSize,
              vx: (Math.random() - 0.5) * 420 + target.direction * Math.min(target.speed, 300) * 0.3,
              vy: (Math.random() - 0.7) * 420,
              life: 0.7,
              maxLife: 0.7,
              size: PIXEL * 2,
              color: i === 0 ? BULB : GIRDER,
              gravity: 900
            });
          }
        })
      );
      for (let i = 0; i < 14; i++) {
        const life = 0.12 + Math.random() * 0.06;
        particles.push({
          x: target.x,
          y: target.y,
          vx: (Math.random() - 0.5) * 900,
          vy: (Math.random() - 0.5) * 900,
          life,
          maxLife: life,
          size: PIXEL,
          color: SPARK_COLOR,
          gravity: 0
        });
      }
    }

    function fire() {
      flash = FLASH_TIME;
      recoil = 1;
      cooldown = SHOT_COOLDOWN;
      const radius = (SPREAD_DEG / 70) * height;
      // The first pellet flies true, so a dead-on shot can't miss through bad luck.
      const pellets = Array.from({ length: PELLETS }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const reach = i === 0 ? 0 : Math.sqrt(Math.random()) * radius;
        return { x: aim.x + Math.cos(angle) * reach, y: aim.y + Math.sin(angle) * reach };
      });
      for (const pellet of pellets) tracers.push({ ...pellet, life: 0.05 });
      const struck = targets.filter((target) =>
        pellets.some(
          (pellet) => Math.abs(pellet.x - target.x) <= targetSpan / 2 && Math.abs(pellet.y - target.y) <= targetSpan / 2
        )
      );
      if (struck.length === 0) {
        end();
        return;
      }
      struck.forEach(shatter);
      targets = targets.filter((target) => !struck.includes(target));
      hits += struck.length;
      setScore(hits);
    }

    function onPointerDown(event: PointerEvent) {
      aim = { x: event.clientX, y: event.clientY };
      if (current === "playing") {
        if (cooldown <= 0) fire();
      } else if (sinceOver >= RESTART_DELAY) {
        start();
      }
    }

    function onPointerMove(event: PointerEvent) {
      aim = { x: event.clientX, y: event.clientY };
    }

    function update(dt: number) {
      flash = Math.max(0, flash - dt);
      cooldown -= dt;
      recoil = Math.max(0, recoil - dt * 7);
      sinceOver += dt;
      tracers = tracers.filter((tracer) => (tracer.life -= dt) > 0);
      particles = particles.filter((particle) => {
        particle.life -= dt;
        particle.vy += particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        return particle.life > 0;
      });
      if (current !== "playing") return;
      untilSpawn -= dt;
      while (untilSpawn <= 0) {
        spawn();
        untilSpawn += spawnInterval(hits);
      }
      for (const target of targets) target.x += target.direction * target.speed * dt;
      const escaped = targets.some((target) =>
        target.direction === 1 ? target.x > width + targetSpan : target.x < -targetSpan
      );
      if (escaped) end();
    }

    function drawFaces(faces: Face[], emissive: boolean, place: (point: Vec3) => Vec3, f: number) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const glow = flash / FLASH_TIME;
      const drawn = faces
        .map((face) => {
          const corners = face.corners.map((corner) => place(corner));
          const [ax, ay, az] = corners[0]!;
          const [bx, by, bz] = corners[1]!;
          const [ex, ey, ez] = corners[2]!;
          const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, ex - ax, ey - ay, ez - az];
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          const facing = nx * ax + ny * ay + nz * az;
          const length = Math.hypot(nx, ny, nz) || 1;
          return { face, corners, facing, light: (ny / length) * 0.45 - (nz / length) * 0.35 + 0.75, depth: az };
        })
        .filter((item) => item.facing > 0 && item.corners.every(([, , z]) => z > 1))
        .sort((a, b) => b.depth - a.depth);

      for (const { face, corners, light } of drawn) {
        ctx.beginPath();
        corners.forEach(([x, y, z], i) => {
          // Rounded screen positions are what make period 3D hardware's edges swim.
          const px = Math.round(cx + (f * x) / z);
          const py = Math.round(cy - (f * y) / z);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        if (emissive) {
          ctx.fillStyle = css(face.color);
        } else {
          const [r, g, b] = face.color;
          const lit: Rgb = [
            r * light + FLASH_COLOR[0] * glow * 0.45,
            g * light + FLASH_COLOR[1] * glow * 0.45,
            b * light + FLASH_COLOR[2] * glow * 0.45
          ];
          ctx.fillStyle = css(lit);
        }
        ctx.fill();
      }
    }

    function drawTarget(target: Target) {
      const size = targetSize / PIXEL;
      const left = Math.round((target.x - targetSpan / 2) / PIXEL);
      const top = Math.round((target.y - targetSpan / 2) / PIXEL);
      TARGET_SHAPE.forEach((row, ty) =>
        [...row].forEach((cell, tx) => {
          ctx.fillStyle = css(cell === "#" ? BULB : GIRDER);
          if (cell === "." && (tx === 0 || ty === 0 || tx === row.length - 1 || ty === TARGET_SHAPE.length - 1)) return;
          if (cell === "." && Math.hypot(tx - 3, ty - 3) > 3) return;
          ctx.fillRect(left + tx * size, top + ty * size, size, size);
        })
      );
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      targets.forEach(drawTarget);
      for (const particle of particles) {
        ctx.fillStyle = css(particle.color, 0.4 + (0.6 * particle.life) / particle.maxLife);
        const size = particle.size / PIXEL;
        ctx.fillRect(Math.round(particle.x / PIXEL), Math.round(particle.y / PIXEL), size, size);
      }

      const f = canvas.height * 1.15;
      const yaw = Math.atan((aim.x - width / 2) / (height * 1.15));
      const pitch = Math.atan((height / 2 - aim.y) / (height * 1.15)) + 0.1;
      const offset: Vec3 = [9, -10 - recoil * 0.8, 31 - recoil * 5];
      const toCamera = gunTransform(yaw, pitch);
      const place = (point: Vec3) => toCamera(point, offset);

      const [mx, my, mz] = place(MUZZLE);
      const muzzleX = canvas.width / 2 + (f * mx) / mz;
      const muzzleY = canvas.height / 2 - (f * my) / mz;
      ctx.strokeStyle = css(FLASH_COLOR);
      ctx.lineWidth = 1;
      for (const tracer of tracers) {
        ctx.beginPath();
        ctx.moveTo(muzzleX, muzzleY);
        ctx.lineTo(tracer.x / PIXEL, tracer.y / PIXEL);
        ctx.stroke();
      }

      drawFaces(SHOTGUN, false, place, f);

      if (flash > 0) {
        // The engine's flash: a core, a tip and two side sparks, scaled by the pulse.
        const pulse = flash / FLASH_TIME;
        const specs = [
          { along: 2, side: 0, up: 0, half: 1.2 * (0.7 + pulse), bright: 1 },
          { along: 4.5, side: 0, up: 0, half: 0.8 * (0.5 + pulse), bright: 0.85 },
          { along: 1.2, side: 1.5 * pulse, up: 0.5, half: 0.6, bright: 0.7 },
          { along: 1.2, side: -1.5 * pulse, up: -0.4, half: 0.6, bright: 0.7 }
        ];
        for (const { along, side, up, half, bright } of specs) {
          const color: Rgb = [FLASH_COLOR[0] * bright, FLASH_COLOR[1] * bright, FLASH_COLOR[2] * bright];
          const cube = cubeFaces(MUZZLE[0] + along - half, MUZZLE[1] + up - half, MUZZLE[2] + side - half, half * 2, color);
          drawFaces(cube, true, place, f);
        }
      }
    }

    function tick(now: number) {
      update(Math.min((now - last) / 1000, 0.05));
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    }

    resize();
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pf-game">
      <canvas ref={canvasRef} className="pf-game-canvas" aria-label="Shooting gallery minigame" />
      <div className="pf-game-hud" data-phase={phase}>
        <p className="pf-game-score">
          {score} <span className="pf-muted">best {Math.max(best, score)}</span>
        </p>
        {phase === "playing" ? null : (
          <div className="pf-game-panel">
            {children}
            <p className="pf-game-prompt">
              {phase === "over"
                ? `Game over at ${score}. Click to go again.`
                : "Click to start. Miss once, or let one through, and it's over."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
