import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPictures = join(root, "..", "smile3", "pictures");
const srcSounds = join(root, "..", "smile3", "sounds");
const srcLevels = join(root, "..", "smile3", "Levels");
const outAssets = join(root, "public", "assets");
const outLevels = join(root, "public", "levels");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p).forEach((x) => out.push(x));
    else out.push(p);
  }
  return out;
}

function run(args) {
  execFileSync(ffmpegPath, args, { stdio: "pipe" });
}

mkdirSync(outAssets, { recursive: true });
mkdirSync(outLevels, { recursive: true });

// --- images: BMP/ICO -> PNG ---
const pics = walk(srcPictures).filter((p) => /\.(bmp|ico)$/i.test(p));
const used = new Map(); // lower dest -> count
const manifest = { images: {}, sounds: {} };
for (const src of pics) {
  const rel = relative(srcPictures, src).replace(/\\/g, "/");
  let destRel = rel.replace(/\.(bmp|ico)$/i, ".png");
  const key = destRel.toLowerCase();
  if (used.has(key)) {
    // disambiguate wood.BMP vs wood.ico etc.
    const n = used.get(key) + 1;
    used.set(key, n);
    destRel = destRel.replace(/\.png$/, `_${n}.png`);
  } else {
    used.set(key, 1);
  }
  const dest = join(outAssets, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  run(["-y", "-v", "error", "-i", src, dest]);
  manifest.images[rel] = "assets/" + destRel;
  console.log(`img ${rel} -> assets/${destRel}`);
}

// --- sounds: WAV -> OGG (vorbis, q4) ---
const sounds = walk(srcSounds).filter((p) => /\.wav$/i.test(p));
for (const src of sounds) {
  const rel = relative(srcSounds, src).replace(/\\/g, "/");
  const destRel = "sounds/" + rel.replace(/\.wav$/i, ".ogg");
  const dest = join(outAssets, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  run(["-y", "-v", "error", "-i", src, "-c:a", "libvorbis", "-q:a", "4", dest]);
  manifest.sounds[rel] = "assets/" + destRel;
  console.log(`snd ${rel} -> assets/${destRel}`);
}

// --- levels: copy verbatim ---
const levels = readdirSync(srcLevels).filter((f) => f.endsWith(".txt"));
for (const f of levels) {
  cpSync(join(srcLevels, f), join(outLevels, f));
}
console.log(`levels: ${levels.length} copied`);

// also copy a few notable extra single-player levels? No — keep canonical set.
writeFileSync(join(outAssets, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("manifest written");
