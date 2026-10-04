// Converts the rediscovered originals (../data/Pictures + ../data/sound)
// to PNG/OGG under public/assets. Run: node scripts/convert-assets.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPictures = join(root, "..", "data", "Pictures");
const srcSounds = join(root, "..", "data", "sound");
const outSprites = join(root, "public", "assets", "sprites");
const outSounds = join(root, "public", "assets", "sounds");

// Only the files space actually references (barrelobject.ctl strPiclocal,
// Nsign.ico arrow frames, bang.bmp). The rest belong to other games.
const WANTED = new Set(
  ["ship.bmp", "enemy.bmp", "brick.bmp", "wood.bmp", "panel.bmp",
    "bounce.bmp", "metal.bmp", "door.bmp", "warp.bmp", "lock.ico",
    "2lock.ico", "sign.ico", "roof.bmp", "magnet.bmp", "bang.bmp",
    "0sign.ico", "1sign.ico", "2sign.ico", "3sign.ico",
  ].map((f) => f.toLowerCase()),
);
const WANTED_SND = new Set(
  ["bang.wav", "thump.wav", "warp.wav", "wall.wav", "ecrash.wav",
    "skid.wav", "start.wav", "finish.wav", "magnet.wav",
  ].map((f) => f.toLowerCase()),
);

function run(args) {
  execFileSync(ffmpegPath, args, { stdio: "pipe" });
}

mkdirSync(outSprites, { recursive: true });
mkdirSync(outSounds, { recursive: true });

const manifest = { sprites: {}, sounds: {} };
for (const e of readdirSync(srcPictures)) {
  if (statSync(join(srcPictures, e)).isDirectory()) continue;
  if (!WANTED.has(e.toLowerCase())) {
    console.log(`skip pictures/${e} (other game)`);
    continue;
  }
  const dest = join(outSprites, e.replace(/\.(bmp|ico)$/i, ".png"));
  run(["-y", "-v", "error", "-i", join(srcPictures, e), dest]);
  manifest.sprites[e] = "assets/sprites/" + e.replace(/\.(bmp|ico)$/i, ".png");
  console.log(`img pictures/${e}`);
}
for (const e of readdirSync(srcSounds)) {
  if (statSync(join(srcSounds, e)).isDirectory()) continue;
  if (!WANTED_SND.has(e.toLowerCase())) {
    console.log(`skip sound/${e} (unused)`);
    continue;
  }
  const dest = join(outSounds, e.replace(/\.wav$/i, ".ogg"));
  run(["-y", "-v", "error", "-i", join(srcSounds, e), "-c:a", "libvorbis", "-q:a", "4", dest]);
  manifest.sounds[e] = "assets/sounds/" + e.replace(/\.wav$/i, ".ogg");
  console.log(`snd sound/${e}`);
}
writeFileSync(join(root, "public", "assets", "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("manifest written");
