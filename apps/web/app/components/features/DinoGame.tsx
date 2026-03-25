"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";

// Chrome T-Rex Runner inspired constants
const CANVAS_HEIGHT = 200;
const MAX_WIDTH = 600;
const GROUND_Y = CANVAS_HEIGHT - 30;
const GRAVITY = 0.6;
const BASE_JUMP_VELOCITY = -10;
const DROP_VELOCITY = -5;
const SPEED_DROP_COEFFICIENT = 3;
const MIN_JUMP_HEIGHT = 30;
const INITIAL_SPEED = 6;
const MAX_SPEED = 13;
const SPEED_INCREMENT = 0.001;
const GAP_COEFFICIENT = 0.6;
const MAX_GAP_COEFFICIENT = 1.5;
const BASE_MIN_GAP = 120;
const GRACE_DISTANCE = 200;

// Player size (logo-inspired square character)
const PLAYER_SIZE = 30;
const PLAYER_LEG_LEN = 7;

interface Player {
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  frame: number;
  jumpStartY: number;
  speedDrop: boolean;
}

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "small" | "large";
}

interface Cloud {
  x: number;
  y: number;
  width: number;
}

interface GroundDash {
  offset: number;
  length: number;
}

type GameState = "idle" | "playing" | "gameover";

function makeGroundDashes(): GroundDash[] {
  const dashes: GroundDash[] = [];
  for (let i = 0; i < 80; i++) {
    dashes.push({
      offset: i * 15 + Math.floor(Math.random() * 6),
      length: 2 + Math.floor(Math.random() * 4),
    });
  }
  return dashes;
}

export function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const jumpKeyHeldRef = useRef(false);
  const gameRef = useRef<{
    state: GameState;
    player: Player;
    obstacles: Obstacle[];
    clouds: Cloud[];
    groundDashes: GroundDash[];
    score: number;
    speed: number;
    groundOffset: number;
    distanceTraveled: number;
    nextObstacleAt: number;
    frameCount: number;
    animId: number;
    highScore: number;
  }>({
    state: "idle",
    player: { x: 50, y: GROUND_Y - PLAYER_SIZE, vy: 0, grounded: true, frame: 0, jumpStartY: GROUND_Y - PLAYER_SIZE, speedDrop: false },
    obstacles: [],
    clouds: [],
    groundDashes: makeGroundDashes(),
    score: 0,
    speed: INITIAL_SPEED,
    groundOffset: 0,
    distanceTraveled: 0,
    nextObstacleAt: GRACE_DISTANCE,
    frameCount: 0,
    animId: 0,
    highScore: 0,
  });
  const [, setRenderTick] = useState(0);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(MAX_WIDTH);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setCanvasWidth(Math.min(containerRef.current.clientWidth, MAX_WIDTH));
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const isDark = resolvedTheme === "dark";
  const fg = isDark ? "#e5e5e5" : "#262626";
  const fgMuted = isDark ? "#525252" : "#a3a3a3";

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 50, y: GROUND_Y - PLAYER_SIZE, vy: 0, grounded: true, frame: 0, jumpStartY: GROUND_Y - PLAYER_SIZE, speedDrop: false };
    g.obstacles = [];
    g.clouds = [
      { x: 120, y: 30, width: 30 },
      { x: 300, y: 50, width: 22 },
      { x: 480, y: 20, width: 26 },
    ];
    g.groundDashes = makeGroundDashes();
    g.score = 0;
    g.speed = INITIAL_SPEED;
    g.groundOffset = 0;
    g.distanceTraveled = 0;
    g.nextObstacleAt = GRACE_DISTANCE;
    g.frameCount = 0;
    jumpKeyHeldRef.current = false;
  }, []);

  const startJump = useCallback(() => {
    const g = gameRef.current;
    if (g.state === "idle") {
      g.state = "playing";
      resetGame();
      setRenderTick((t) => t + 1);
      return;
    }
    if (g.state === "gameover") {
      g.state = "playing";
      resetGame();
      setRenderTick((t) => t + 1);
      return;
    }
    if (g.player.grounded) {
      g.player.vy = BASE_JUMP_VELOCITY - (g.speed / 10);
      g.player.grounded = false;
      g.player.jumpStartY = g.player.y;
      g.player.speedDrop = false;
      jumpKeyHeldRef.current = true;
    }
  }, [resetGame]);

  const endJump = useCallback(() => {
    const g = gameRef.current;
    jumpKeyHeldRef.current = false;
    if (!g.player.grounded) {
      const heightRisen = g.player.jumpStartY - g.player.y;
      if (heightRisen >= MIN_JUMP_HEIGHT && g.player.vy < DROP_VELOCITY) {
        g.player.vy = DROP_VELOCITY;
      }
    }
  }, []);

  const speedDrop = useCallback(() => {
    const g = gameRef.current;
    if (!g.player.grounded && g.state === "playing") {
      g.player.speedDrop = true;
      g.player.vy = 1;
    }
  }, []);

  // Input handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        startJump();
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        speedDrop();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        endJump();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startJump, endJump, speedDrop]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mounted) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    resetGame();

    // Draw CodePawl logo character
    const drawPlayer = (p: Player) => {
      const s = PLAYER_SIZE;
      const x = p.x;
      const y = p.y;

      // Body — rounded rect (like logo background)
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, 4);
      ctx.stroke();

      // Eye — circle (bottom-center area, like logo)
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(x + s * 0.5, y + s * 0.7, 3, 0, Math.PI * 2);
      ctx.fill();

      // Chevron ">" on the right side (facing direction of travel)
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + s * 0.55, y + s * 0.2);
      ctx.lineTo(x + s * 0.75, y + s * 0.35);
      ctx.lineTo(x + s * 0.55, y + s * 0.5);
      ctx.stroke();

      // Dash (whisker) — horizontal line right of chevron
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.82, y + s * 0.35);
      ctx.lineTo(x + s * 0.95, y + s * 0.35);
      ctx.stroke();
      ctx.lineCap = "butt";

      // Legs
      ctx.lineWidth = 2;
      const legPhase = Math.floor(p.frame / 4) % 2;
      if (p.grounded) {
        // Running legs — alternate
        const leftX = x + s * 0.25;
        const rightX = x + s * 0.7;
        const legBase = y + s;
        // Left leg
        ctx.beginPath();
        ctx.moveTo(leftX, legBase);
        ctx.lineTo(leftX + (legPhase === 0 ? -3 : 3), legBase + PLAYER_LEG_LEN);
        ctx.stroke();
        // Right leg
        ctx.beginPath();
        ctx.moveTo(rightX, legBase);
        ctx.lineTo(rightX + (legPhase === 0 ? 3 : -3), legBase + PLAYER_LEG_LEN);
        ctx.stroke();
      } else {
        // Tucked legs while jumping
        const leftX = x + s * 0.3;
        const rightX = x + s * 0.65;
        const legBase = y + s;
        ctx.beginPath();
        ctx.moveTo(leftX, legBase);
        ctx.lineTo(leftX + 2, legBase + 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rightX, legBase);
        ctx.lineTo(rightX - 2, legBase + 3);
        ctx.stroke();
      }
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      // All obstacles are cactus-style rectangles with small spikes
      const ox = o.x;
      const oy = GROUND_Y - o.height;
      ctx.strokeRect(ox, oy, o.width, o.height);

      // Small spike details
      if (o.type === "large") {
        ctx.beginPath();
        ctx.moveTo(ox - 4, GROUND_Y);
        ctx.lineTo(ox - 2, GROUND_Y - o.height * 0.4);
        ctx.lineTo(ox, GROUND_Y - o.height * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox + o.width, GROUND_Y - o.height * 0.3);
        ctx.lineTo(ox + o.width + 2, GROUND_Y - o.height * 0.45);
        ctx.lineTo(ox + o.width + 4, GROUND_Y);
        ctx.stroke();
      }
    };

    const drawGround = (offset: number, dashes: GroundDash[]) => {
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(canvasWidth, GROUND_Y);
      ctx.stroke();

      // Deterministic dashes (no flicker)
      ctx.lineWidth = 1;
      const totalWidth = dashes.length * 15;
      for (const d of dashes) {
        const x = ((d.offset - offset) % totalWidth + totalWidth) % totalWidth;
        if (x < canvasWidth) {
          ctx.beginPath();
          ctx.moveTo(x, GROUND_Y + 5);
          ctx.lineTo(x + d.length, GROUND_Y + 5);
          ctx.stroke();
        }
      }
    };

    const drawClouds = (clouds: Cloud[]) => {
      ctx.strokeStyle = fgMuted;
      ctx.lineWidth = 1;
      for (const c of clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.width / 2, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(c.x - c.width / 4, c.y + 2, c.width / 3, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const drawScore = (score: number, highScore: number) => {
      ctx.fillStyle = fg;
      ctx.font = "14px monospace";
      ctx.textAlign = "right";
      const scoreStr = String(Math.floor(score)).padStart(5, "0");
      if (highScore > 0) {
        const hiStr = "HI " + String(Math.floor(highScore)).padStart(5, "0") + "  ";
        ctx.fillStyle = fgMuted;
        ctx.fillText(hiStr + scoreStr, canvasWidth - 16, 24);
        // Redraw current score in fg
        const hiWidth = ctx.measureText(hiStr).width;
        ctx.fillStyle = fg;
        ctx.fillText(scoreStr, canvasWidth - 16, 24);
      } else {
        ctx.fillText(scoreStr, canvasWidth - 16, 24);
      }
    };

    const drawText = (text: string, y: number, size = 14) => {
      ctx.fillStyle = fg;
      ctx.font = `${size}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(text, canvasWidth / 2, y);
    };

    const checkCollision = (p: Player, o: Obstacle): boolean => {
      // Slightly forgiving hitbox (3px inset)
      const px = p.x + 4;
      const py = p.y + 4;
      const pw = PLAYER_SIZE - 8;
      const ph = PLAYER_SIZE - 4;
      const ox = o.x + 2;
      const oy = GROUND_Y - o.height + 2;
      const ow = o.width - 4;
      const oh = o.height - 2;
      return px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy;
    };

    const spawnObstacle = (g: typeof gameRef.current) => {
      const isLarge = Math.random() > 0.5;
      const width = isLarge ? 20 + Math.random() * 8 : 14 + Math.random() * 6;
      const height = isLarge ? 35 + Math.random() * 15 : 25 + Math.random() * 10;
      const type = isLarge ? "large" as const : "small" as const;
      g.obstacles.push({ x: canvasWidth + 10, width, height, type });

      // Chrome dino gap formula
      const minGap = Math.round(width * g.speed + BASE_MIN_GAP * GAP_COEFFICIENT);
      const maxGap = Math.round(minGap * MAX_GAP_COEFFICIENT);
      g.nextObstacleAt = g.distanceTraveled + minGap + Math.random() * (maxGap - minGap);
    };

    const loop = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);

      if (g.state === "idle") {
        drawGround(0, g.groundDashes);
        drawPlayer(g.player);
        drawText("Press Space or Tap to Start", CANVAS_HEIGHT / 2 - 10, 14);
        g.animId = requestAnimationFrame(loop);
        return;
      }

      if (g.state === "playing") {
        g.frameCount++;
        g.player.frame++;

        // Player physics
        if (g.player.speedDrop) {
          g.player.y += Math.round(g.player.vy * SPEED_DROP_COEFFICIENT);
          g.player.vy += GRAVITY;
        } else {
          g.player.vy += GRAVITY;
          g.player.y += Math.round(g.player.vy);
        }

        // Variable jump — check if key released mid-jump
        if (!jumpKeyHeldRef.current && !g.player.grounded && !g.player.speedDrop) {
          const heightRisen = g.player.jumpStartY - g.player.y;
          if (heightRisen >= MIN_JUMP_HEIGHT && g.player.vy < DROP_VELOCITY) {
            g.player.vy = DROP_VELOCITY;
          }
        }

        // Land
        if (g.player.y >= GROUND_Y - PLAYER_SIZE) {
          g.player.y = GROUND_Y - PLAYER_SIZE;
          g.player.vy = 0;
          g.player.grounded = true;
          g.player.speedDrop = false;
        }

        // Speed
        g.speed = Math.min(g.speed + SPEED_INCREMENT, MAX_SPEED);

        // Distance & ground scroll
        g.distanceTraveled += g.speed;
        g.groundOffset += g.speed;

        // Clouds
        for (const c of g.clouds) {
          c.x -= g.speed * 0.2;
          if (c.x < -40) {
            c.x = canvasWidth + 40 + Math.random() * 100;
            c.y = 15 + Math.random() * 45;
          }
        }

        // Obstacles
        if (g.distanceTraveled >= g.nextObstacleAt) {
          spawnObstacle(g);
        }

        for (const o of g.obstacles) {
          o.x -= g.speed;
        }
        g.obstacles = g.obstacles.filter((o) => o.x + o.width > -20);

        // Collision
        for (const o of g.obstacles) {
          if (checkCollision(g.player, o)) {
            g.state = "gameover";
            if (g.score > g.highScore) g.highScore = g.score;
            setRenderTick((t) => t + 1);
            break;
          }
        }

        // Score
        g.score += g.speed * 0.05;
      }

      // Draw
      drawClouds(g.clouds);
      drawGround(g.groundOffset, g.groundDashes);
      for (const o of g.obstacles) drawObstacle(o);
      drawPlayer(g.player);
      drawScore(g.score, g.highScore);

      if (g.state === "gameover") {
        drawText("GAME OVER", CANVAS_HEIGHT / 2 - 16, 18);
        drawText("Press Space or Tap to Restart", CANVAS_HEIGHT / 2 + 8, 12);
      }

      g.animId = requestAnimationFrame(loop);
    };

    const g = gameRef.current;
    g.animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(g.animId);
    };
  }, [mounted, canvasWidth, fg, fgMuted, resetGame]);

  if (!mounted) return null;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center my-8">
      {prefersReducedMotion && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">
          Reduced motion is on — animations may feel choppy.
        </p>
      )}
      <canvas
        ref={canvasRef}
        onClick={startJump}
        onTouchStart={(e) => { e.preventDefault(); startJump(); }}
        onTouchEnd={() => endJump()}
        style={{
          width: canvasWidth,
          height: CANVAS_HEIGHT,
          maxWidth: "100%",
          cursor: "pointer",
          borderRadius: 8,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
        }}
      />
    </div>
  );
}
