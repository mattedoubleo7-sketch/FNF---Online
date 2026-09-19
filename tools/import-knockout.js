const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.resolve("C:/Users/matth/Downloads/tmp-knockout-source-20260919");
const outAssets = path.join(root, "assets", "knockout");
const outShaders = path.join(root, "shaders", "knockout");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing Knockout source file: ${src}`);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function attrs(tag) {
  const result = {};
  tag.replace(/([A-Za-z_][\w:-]*)="([^"]*)"/g, (_, key, value) => {
    result[key] = value;
    return "";
  });
  return result;
}

function parseAtlas(file) {
  const xml = fs.readFileSync(file, "utf8");
  return Array.from(xml.matchAll(/<SubTexture\b[^>]*\/?>/g), match => {
    const a = attrs(match[0]);
    const frame = {
      name: a.name || "",
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      w: Number(a.width) || 0,
      h: Number(a.height) || 0,
      fx: Number(a.frameX) || 0,
      fy: Number(a.frameY) || 0,
      fw: Number(a.frameWidth) || Number(a.width) || 0,
      fh: Number(a.frameHeight) || Number(a.height) || 0
    };
    if (a.rotated === "true") frame.rotated = true;
    return frame;
  });
}

function frameIndex(name) {
  const match = String(name).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesByPrefix(frames, prefix) {
  const clean = String(prefix || "").toLowerCase();
  return frames
    .filter(frame => String(frame.name || "").toLowerCase().startsWith(clean))
    .sort((a, b) => frameIndex(a.name) - frameIndex(b.name) || a.name.localeCompare(b.name))
    .map(({ name, ...frame }) => frame);
}

function frameByExactBase(frames, base) {
  const pattern = new RegExp(`^${String(base).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\d+$`, "i");
  const matches = frames.filter(frame => pattern.test(String(frame.name || "")));
  matches.sort((a, b) => frameIndex(a.name) - frameIndex(b.name));
  if (!matches[0]) return null;
  const { name, ...frame } = matches[0];
  return frame;
}

function atlasAnimation(xml, prefix, fps = 24, loop = false) {
  return { frames: framesByPrefix(parseAtlas(path.join(source, xml)), prefix), fps, loop };
}

function character(jsonFile, xmlFile, image) {
  const config = readJson(path.join(source, "characters", jsonFile));
  const atlas = parseAtlas(path.join(source, "images", "characters", xmlFile));
  const animations = {};
  for (const anim of config.animations || []) {
    animations[anim.anim] = {
      frames: framesByPrefix(atlas, anim.name),
      fps: Number(anim.fps) || 24,
      loop: !!anim.loop,
      offsets: (anim.offsets || [0, 0]).map(Number)
    };
  }
  return {
    image,
    baseFrameSize: atlas.length ? [atlas[0].fw, atlas[0].fh] : [0, 0],
    position: (config.position || [0, 0]).map(Number),
    cameraPosition: (config.camera_position || [0, 0]).map(Number),
    scale: Number(config.scale) || 1,
    flipX: !!config.flip_x,
    singDuration: Number(config.sing_duration) || 4,
    animations
  };
}

function copyImage(sourcePath, outputPath = sourcePath) {
  copy(path.join(source, "images", sourcePath), path.join(outAssets, outputPath));
  return `assets/knockout/${outputPath.replace(/\\/g, "/")}`;
}

function copySound(sourcePath, outputPath = sourcePath) {
  copy(path.join(source, "sounds", sourcePath), path.join(outAssets, "sounds", outputPath));
  return `assets/knockout/sounds/${outputPath.replace(/\\/g, "/")}`;
}

const rawSong = readJson(path.join(source, "data", "knockout", "knockout-standard.json")).song;
const bpm = Number(rawSong.bpm) || 136;
const spb = 60 / bpm;
const notes = [];
const timeline = [];
let sectionBeat = 0;

for (let index = 0; index < rawSong.notes.length; index += 1) {
  const section = rawSong.notes[index];
  const steps = Number(section.lengthInSteps) || 16;
  const beats = steps / 4;
  const baseSide = section.mustHitSection ? "player" : "opp";
  const otherSide = baseSide === "player" ? "opp" : "player";
  timeline.push({
    index,
    startBeat: sectionBeat,
    endBeat: sectionBeat + beats,
    startTime: sectionBeat * spb,
    endTime: (sectionBeat + beats) * spb,
    mustHitSection: !!section.mustHitSection,
    gfSection: !!section.gfSection,
    altAnim: !!section.altAnim,
    turn: section.gfSection ? "both" : baseSide
  });
  for (const rawNote of section.sectionNotes || []) {
    const rawLane = Number(rawNote[1]) || 0;
    const side = rawLane > 3 ? otherSide : baseSide;
    const direction = ((rawLane % 4) + 4) % 4;
    const time = Number(rawNote[0]) / 1000;
    notes.push({
      time,
      beat: time / spb,
      lane: direction + (side === "player" ? 4 : 0),
      side,
      character: side === "player" ? "knockoutBf" : "knockoutCuphead",
      sLen: Math.max(0, Number(rawNote[2]) / 1000 || 0),
      noteType: String(rawNote[3] || ""),
      alt: !!section.altAnim || String(rawNote[3] || "") === "Alt Animation"
    });
  }
  sectionBeat += beats;
}
notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

const events = [];
for (const block of rawSong.events || []) {
  const time = Number(block[0]) / 1000;
  for (const event of block[1] || []) {
    events.push({ time, name: String(event[0] || ""), value1: String(event[1] || ""), value2: String(event[2] || "") });
  }
}
events.sort((a, b) => a.time - b.time);

copy(path.join(source, "songs", "knockout", "Inst.ogg"), path.join(root, "knockout-inst.ogg"));
copy(path.join(source, "songs", "knockout", "Voices.ogg"), path.join(root, "knockout-voices.ogg"));

const images = {
  cuphead: copyImage("characters/cuphead_pissed.png", "cuphead.png"),
  boyfriend: copyImage("characters/icv2bf-rain.png", "boyfriend.png"),
  notes: copyImage("CUP_assets.png", "notes.png"),
  parryNotes: copyImage("PARRYCUP_assets.png", "parry-notes.png"),
  noteSplashes: copyImage("noteSplashes.png", "note-splashes.png"),
  stageBack: copyImage("rain/CH-RN-00.png", "stage/back.png"),
  stageWorld: copyImage("rain/world1.png", "stage/world.png"),
  stageHouse: copyImage("rain/house.png", "stage/house.png"),
  stageTree: copyImage("rain/tree.png", "stage/tree.png"),
  stageMid: copyImage("rain/CH-RN-01.png", "stage/mid.png"),
  stageFront: copyImage("rain/CH-RN-02.png", "stage/front.png"),
  stageSmoke: copyImage("rain/smoke.png", "stage/smoke.png"),
  stageMoon: copyImage("rain/moonLight.png", "stage/moon.png"),
  lightning: copyImage("rain/lightning.png", "stage/lightning.png"),
  stageRain: copyImage("particles.png", "stage/rain.png"),
  rainCover: copyImage("CUpheqdshid.png", "stage/rain-cover.png"),
  intro: copyImage("cup/ready_wallop.png", "ui/ready-wallop.png"),
  introThing: copyImage("the_thing2.0.png", "ui/intro-thing.png"),
  card: copyImage("cup/Cardcrap.png", "ui/card.png"),
  cardEmpty: copyImage("cup/cardempty.png", "ui/card-empty.png"),
  cardFull: copyImage("cup/cardfull.png", "ui/card-full.png"),
  alertUp: copyImage("cup/mozo.png", "ui/alert-up.png"),
  alertDown: copyImage("cup/gay.png", "ui/alert-down.png"),
  health: copyImage("health_IC/cuphealthbar.png", "ui/health.png"),
  iconCuphead: copyImage("icons/icon-cupAngry.png", "ui/icon-cuphead.png"),
  iconBf: copyImage("icons/icon-icv2bf.png", "ui/icon-bf.png"),
  mugman: copyImage("Mugman Fucking dies.png", "mugman.png"),
  knockout: copyImage("knock.png", "ui/knockout.png"),
  pea: copyImage("weapons/peashooter.png", "weapons/pea.png"),
  peaDeath: copyImage("weapons/peashooter_death.png", "weapons/pea-death.png"),
  chaser: copyImage("weapons/chaser.png", "weapons/chaser.png"),
  chaserDeath: copyImage("weapons/chaser_death.png", "weapons/chaser-death.png"),
  peaEx: copyImage("weapons/peashooterEX.png", "weapons/pea-ex.png"),
  peaExDeath: copyImage("weapons/peashooterEX_death.png", "weapons/pea-ex-death.png"),
  roundEx: copyImage("weapons/roundaboutEX.png", "weapons/round-ex.png"),
  roundExDeath: copyImage("weapons/roundaboutEX_death.png", "weapons/round-ex-death.png")
};

const sounds = {
  intro0: copySound("Cup/intros/angry/0.ogg", "intro-0.ogg"),
  intro1: copySound("Cup/intros/angry/1.ogg", "intro-1.ogg"),
  attack: copySound("Throw1.ogg", "attack.ogg"),
  hurt: copySound("hurt.ogg", "hurt.ogg"),
  parry: copySound("Parry.ogg", "parry.ogg"),
  exAttack: copySound("Cup/NMattack.ogg", "ex-attack.ogg"),
  cupHurt: copySound("Cup/CupHurt.ogg", "cup-hurt.ogg"),
  knockout: copySound("Cup/knockout.ogg", "knockout.ogg"),
  shoot: copySound("shoot.ogg", "shoot.ogg"),
  pea: Array.from({ length: 6 }, (_, i) => copySound(`pea${i}.ogg`, `pea-${i}.ogg`)),
  chaser: Array.from({ length: 5 }, (_, i) => copySound(`chaser${i}.ogg`, `chaser-${i}.ogg`))
};

copy(path.join(source, "fonts", "00009.ttf"), path.join(outAssets, "ui", "cuphead.ttf"));
for (const name of ["bloom.frag", "chrom.frag", "BlurEffect.frag", "contrast.frag"]) {
  copy(path.join(source, "shaders", name), path.join(outShaders, name));
}

const noteAtlas = parseAtlas(path.join(source, "images", "CUP_assets.xml"));
const parryAtlas = parseAtlas(path.join(source, "images", "PARRYCUP_assets.xml"));
const notePrefixes = [
  { static: "arrowLEFT", press: "left press", confirm: "left confirm", gem: "purple", hold: "purple hold piece", tail: "pruple end hold" },
  { static: "arrowDOWN", press: "down press", confirm: "down confirm", gem: "blue", hold: "blue hold piece", tail: "blue hold end" },
  { static: "arrowUP", press: "up press", confirm: "up confirm", gem: "green", hold: "green hold piece", tail: "green hold end" },
  { static: "arrowRIGHT", press: "right press", confirm: "right confirm", gem: "red", hold: "red hold piece", tail: "red hold end" }
];
const parryPrefixes = ["purple", "blue", "green", "red"];
const noteSkin = notePrefixes.map(prefix => ({
  static: framesByPrefix(noteAtlas, prefix.static)[0] || null,
  press: framesByPrefix(noteAtlas, prefix.press),
  confirm: framesByPrefix(noteAtlas, prefix.confirm),
  gem: frameByExactBase(noteAtlas, prefix.gem),
  hold: framesByPrefix(noteAtlas, prefix.hold)[0] || null,
  tail: framesByPrefix(noteAtlas, prefix.tail)[0] || null
}));
const parrySkin = parryPrefixes.map(prefix => frameByExactBase(parryAtlas, prefix));

const atlas = (xml, prefix, fps = 24, loop = false) => atlasAnimation(xml, prefix, fps, loop);
const data = {
  meta: {
    title: rawSong.song || "Knockout",
    subtitle: "Indie Cross Cuphead source port",
    bpm,
    speed: Number(rawSong.speed) || 2.8,
    source: "knockout_new_.zip",
    shaders: ["bloom.frag", "chrom.frag", "BlurEffect.frag", "contrast.frag"]
  },
  audio: { inst: "knockout-inst.ogg", voices: "knockout-voices.ogg" },
  chart: {
    bpm,
    spb,
    speed: Number(rawSong.speed) || 2.8,
    notes,
    timeline,
    totalBeats: sectionBeat,
    totalTime: Math.max(178, ...notes.map(note => note.time + note.sLen + 1.5))
  },
  events,
  stage: {
    viewport: [1280, 720],
    defaultZoom: 0.52,
    cameraSpeed: 1,
    boyfriend: [1900, 870],
    opponent: [1000, 800],
    images
  },
  sprites: {
    cuphead: character("cuphead pissed.json", "cuphead_pissed.xml", images.cuphead),
    boyfriend: character("icv2bf-rain.json", "icv2bf-rain.xml", images.boyfriend),
    mugman: {
      image: images.mugman,
      walking: atlas("images/Mugman Fucking dies.xml", "Mugman instance 1", 24, false),
      dead: atlas("images/Mugman Fucking dies.xml", "MUGMANDEAD YES instance 1", 24, false)
    }
  },
  animations: {
    lightning: atlas("images/rain/lightning.xml", "lightning", 24, false),
    rainCover: atlas("images/CUpheqdshid.xml", "Cupheadshit_gif instance 1", 24, true),
    intro: atlas("images/cup/ready_wallop.xml", "Ready? WALLOP!", 25, false),
    introThing: atlas("images/the_thing2.0.xml", "BOO instance 1", 20, false),
    alertUp: atlas("images/cup/mozo.xml", "YTJT instance 1", 24, true),
    alertDown: atlas("images/cup/gay.xml", "YTJT instance 1", 24, true),
    knockout: atlas("images/knock.xml", "A KNOCKOUT!", 28, false),
    icons: {
      cupNormal: atlas("images/icons/icon-cupAngry.xml", "cupNormal", 24, true),
      cupHurt: atlas("images/icons/icon-cupAngry.xml", "cupHurt", 24, false),
      cupWin: atlas("images/icons/icon-cupAngry.xml", "cupWin", 24, true),
      cupLose: atlas("images/icons/icon-cupAngry.xml", "cupLose", 24, true),
      bfNormal: atlas("images/icons/icon-icv2bf.xml", "bfNormal", 24, true),
      bfAttack: atlas("images/icons/icon-icv2bf.xml", "bfAttack", 24, false),
      bfWin: atlas("images/icons/icon-icv2bf.xml", "bfWin", 24, true),
      bfLose: atlas("images/icons/icon-icv2bf.xml", "bfLose", 24, true)
    },
    card: {
      filled: atlas("images/cup/Cardcrap.xml", "Card Filled instance 1", 24, false),
      used: atlas("images/cup/Cardcrap.xml", "Card Used instance 1", 24, false),
      normal: atlas("images/cup/Cardcrap.xml", "Card Normal Pop out instance 1", 24, false),
      parry: atlas("images/cup/Cardcrap.xml", "PARRY Card Pop out  i", 24, false)
    },
    weapons: {
      pea: { image: images.pea, fly: atlas("images/weapons/peashooter.xml", "peashot", 24, true), scale: 1.7 },
      peaDeath: { image: images.peaDeath, fly: atlas("images/weapons/peashooter_death.xml", "peashot", 24, false), scale: 1.7 },
      chaser: { image: images.chaser, fly: atlas("images/weapons/chaser.xml", "chaseshot", 24, true), scale: 2 },
      chaserDeath: { image: images.chaserDeath, fly: atlas("images/weapons/chaser_death.xml", "chaseshoot", 24, false), scale: 1.7 },
      peaEx: { image: images.peaEx, fly: atlas("images/weapons/peashooterEX.xml", "peashotEX", 24, true), scale: 2.3 },
      peaExDeath: { image: images.peaExDeath, fly: atlas("images/weapons/peashooterEX_death.xml", "peashotEX", 24, false), scale: 1.7 },
      roundEx: { image: images.roundEx, fly: atlas("images/weapons/roundaboutEX.xml", "roundaboutEX", 24, true), scale: 2.8 },
      roundExDeath: { image: images.roundExDeath, fly: atlas("images/weapons/roundaboutEX_death.xml", "roundaboutEX", 24, false), scale: 1.7 }
    }
  },
  notes: { image: images.notes, parryImage: images.parryNotes, skin: noteSkin, parrySkin },
  sounds
};

fs.writeFileSync(path.join(root, "knockout-data.js"), `window.KNOCKOUT_DATA = ${JSON.stringify(data)};\n`);
console.log(`Imported Knockout: ${notes.length} notes, ${events.length} events, ${Object.keys(images).length} images`);
