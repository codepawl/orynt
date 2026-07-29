import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputPath = resolve(repoRoot, "assets/pictures/orynt-logo-loading.gif");
const frameDir = "/tmp/orynt-logo-animation-test";
const canvasSize = 500;
const frameSize = 512;
const markBackground = "#ffffff";
const markInk = "#000000";
const markGhost = "#9b9a96";

const frames = [
  ...sequence(0, 0.18, 5),
  ...sequence(0.2, 0.58, 10),
  ...sequence(0.6, 0.82, 7),
  ...sequence(0.86, 1, 6),
  ...hold(1, 10),
  ...sequence(0.96, 0.02, 8),
  ...hold(0, 5),
];

function sequence(from, to, count) {
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    return from + (to - from) * progress;
  });
}

function hold(value, count) {
  return Array.from({ length: count }, () => value);
}

function easeOutQuint(value) {
  return 1 - Math.pow(1 - clamp(value), 5);
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * clamp(value)) - 1) / 2;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function line({ x1, y1, x2, y2, stroke = markInk, width = 35.1886, opacity = 1, transform = "" }) {
  return `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity.toFixed(3)}" transform="${transform}"/>`;
}

function renderFrame(progress) {
  const assemble = easeOutQuint(progress);
  const settle = easeInOutSine(Math.max(0, (progress - 0.72) / 0.28));
  const exit = easeInOutSine(Math.max(0, (0.18 - progress) / 0.18));

  const baseScale = lerp(0.965, 1, assemble) - Math.sin(settle * Math.PI) * 0.006;
  const baseRotation = lerp(-4.5, 0, assemble);
  const groupTransform = `translate(250 250) rotate(${baseRotation.toFixed(3)}) scale(${baseScale.toFixed(4)}) translate(-250 -250)`;

  const leftSlide = lerp(-58, 0, assemble);
  const upperRotate = lerp(-18, 0, assemble);
  const lowerRotate = lerp(16, 0, assemble);
  const horizontalScale = Math.max(0.001, easeOutQuint(Math.max(0, (progress - 0.18) / 0.5)));
  const dotScale = lerp(0.58, 1, easeOutQuint(Math.max(0, (progress - 0.38) / 0.44))) + Math.sin(settle * Math.PI) * 0.085;
  const ghostOpacity = Math.max(0, 0.28 * (1 - assemble) + 0.12 * exit);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${frameSize}" height="${frameSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="rounded-mark">
      <rect width="${canvasSize}" height="${canvasSize}" rx="25"/>
    </clipPath>
    <clipPath id="horizontal-reveal">
      <rect x="282" y="180" width="${(104 * horizontalScale).toFixed(3)}" height="56" rx="28"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded-mark)">
    <rect width="${canvasSize}" height="${canvasSize}" rx="25" fill="${markBackground}"/>
    <g opacity="${ghostOpacity.toFixed(3)}">
      ${line({ x1: 154.458, y1: 245.233, x2: 191.781, y2: 207.909, stroke: markGhost, width: 28 })}
      ${line({ x1: 191.781, y1: 207.909, x2: 154.458, y2: 170.586, stroke: markGhost, width: 28 })}
      ${line({ x1: 308.781, y1: 207.785, x2: 361.564, y2: 207.785, stroke: markGhost, width: 28 })}
      <circle cx="250.72" cy="311.591" r="20" fill="${markGhost}"/>
    </g>
    <g transform="${groupTransform}">
      ${line({
        x1: 154.458 + leftSlide,
        y1: 245.233,
        x2: 191.781 + leftSlide * 0.24,
        y2: 207.909,
        transform: `rotate(${upperRotate.toFixed(3)} 191.781 207.909)`,
      })}
      ${line({
        x1: 191.781 + leftSlide * 0.24,
        y1: 207.909,
        x2: 154.458 + leftSlide,
        y2: 170.586,
        transform: `rotate(${lowerRotate.toFixed(3)} 191.781 207.909)`,
      })}
      <g clip-path="url(#horizontal-reveal)">
        ${line({ x1: 308.781, y1: 207.785, x2: 361.564, y2: 207.785 })}
      </g>
      <circle cx="250.72" cy="311.591" r="${(26.3915 * dotScale).toFixed(3)}" fill="${markInk}"/>
    </g>
  </g>
</svg>
`;
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

await rm(frameDir, { force: true, recursive: true });
await mkdir(frameDir, { recursive: true });

const pngFrames = [];
for (const [index, progress] of frames.entries()) {
  const padded = String(index).padStart(3, "0");
  const svgPath = resolve(frameDir, `frame-${padded}.svg`);
  const pngPath = resolve(frameDir, `frame-${padded}.png`);
  await writeFile(svgPath, renderFrame(progress), "utf8");
  await run("magick", [svgPath, "-resize", `${frameSize}x${frameSize}`, pngPath]);
  pngFrames.push({ path: pngPath, delay: progress === 1 ? 8 : progress === 0 ? 6 : 3 });
}

const gifArgs = ["-dispose", "Background"];
for (const frame of pngFrames) {
  gifArgs.push("-delay", String(frame.delay), frame.path);
}
gifArgs.push("-loop", "0", "-layers", "Optimize", outputPath);
await run("magick", gifArgs);

await run("magick", [
  ...pngFrames.filter((_, index) => index % 4 === 0).map((frame) => frame.path),
  "-background",
  "#050607",
  "-alpha",
  "remove",
  "+append",
  "/tmp/orynt-logo-animation-test-contact.png",
]);

console.log(`Wrote ${outputPath}`);
console.log("Wrote /tmp/orynt-logo-animation-test-contact.png");
