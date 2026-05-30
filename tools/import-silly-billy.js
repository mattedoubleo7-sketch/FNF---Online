const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REMASTERED_ROOT = path.resolve("C:/Users/matth/Downloads/silly_billy_remastered_036f3/SILLY BILLY REMASTERED");
const ERECT_ROOT = path.resolve("C:/Users/matth/Downloads/silly_billy_erect_uwu3/Silly Billy ERECT uwu2/PsychEngine/mods/Vs Silly Billy Port PE 0.7.3");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFrom(sourcePath, targetRelative) {
  const targetPath = path.join(PROJECT_ROOT, targetRelative);
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return targetRelative.replace(/\\/g, "/");
}

function copyRemastered(sourceRelative, targetRelative) {
  return copyFrom(path.join(REMASTERED_ROOT, sourceRelative), targetRelative);
}

function copyErect(sourceRelative, targetRelative) {
  return copyFrom(path.join(ERECT_ROOT, sourceRelative), targetRelative);
}

function readRemasteredText(sourceRelative) {
  return fs.readFileSync(path.join(REMASTERED_ROOT, sourceRelative), "utf8");
}

function readRemasteredJson(sourceRelative) {
  return JSON.parse(readRemasteredText(sourceRelative));
}

function readErectText(sourceRelative) {
  return fs.readFileSync(path.join(ERECT_ROOT, sourceRelative), "utf8");
}

function readErectJson(sourceRelative) {
  return JSON.parse(readErectText(sourceRelative));
}

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const attr of tag.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
  return attrs;
}

function parseSparrowFrames(xmlText, imageKey = "main") {
  const frames = [];
  for (const match of xmlText.matchAll(/<SubTexture\b([^>]*?)\/>/g)) {
    const attrs = attrsFromTag(match[1]);
    frames.push({
      name: String(attrs.name || ""),
      image: imageKey,
      x: Number(attrs.x || 0),
      y: Number(attrs.y || 0),
      w: Number(attrs.width || 0),
      h: Number(attrs.height || 0),
      fx: Number(attrs.frameX || 0),
      fy: Number(attrs.frameY || 0),
      fw: Number(attrs.frameWidth || attrs.width || 0),
      fh: Number(attrs.frameHeight || attrs.height || 0),
      rotated: String(attrs.rotated || "false") === "true"
    });
  }
  return frames;
}

function frameSortValue(name) {
  const match = String(name || "").match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function framesByPrefix(frames, prefix, indices = []) {
  const selected = frames
    .filter(frame => frame.name.startsWith(prefix))
    .sort((a, b) => frameSortValue(a.name) - frameSortValue(b.name));
  if (!indices || !indices.length) return selected;
  const wanted = new Set(indices.map(Number));
  return selected.filter(frame => wanted.has(frameSortValue(frame.name)));
}

function buildCharacter(characterName, targetBase) {
  const character = readRemasteredJson(`assets/shared/characters/${characterName}.json`);
  const imageRelative = `assets/shared/images/${character.image}.png`;
  const xmlRelative = `assets/shared/images/${character.image}.xml`;
  const image = copyRemastered(imageRelative, `assets/silly-billy/${targetBase}.png`);
  copyRemastered(xmlRelative, `assets/silly-billy/${targetBase}.xml`);
  const frames = parseSparrowFrames(readRemasteredText(xmlRelative));
  const animations = {};
  for (const anim of character.animations || []) {
    const animFrames = framesByPrefix(frames, anim.name, anim.indices);
    if (!animFrames.length) continue;
    animations[anim.anim] = {
      frames: animFrames,
      fps: Number(anim.fps || 24),
      loop: !!anim.loop,
      offset: [Number(anim.offsets?.[0] || 0), Number(anim.offsets?.[1] || 0)],
      cameraOffset: [Number(anim.cameraOffset?.[0] || 0), Number(anim.cameraOffset?.[1] || 0)]
    };
  }
  return {
    image,
    animations,
    scale: Number(character.scale || 1),
    flipX: !!character.flip_x,
    isPlayer: !!character._editor_isPlayer,
    noAntialiasing: !!character.no_antialiasing,
    position: [Number(character.position?.[0] || 0), Number(character.position?.[1] || 0)],
    cameraPosition: [Number(character.camera_position?.[0] || 0), Number(character.camera_position?.[1] || 0)]
  };
}

function asPlayer(sprite) {
  return { ...sprite, isPlayer: true, renderFlipX: false };
}

function buildAtlas(imageRelative, targetBase, animationPrefixes, extra = {}) {
  const image = copyRemastered(`assets/shared/images/${imageRelative}.png`, `assets/silly-billy/${targetBase}.png`);
  const xmlRelative = `assets/shared/images/${imageRelative}.xml`;
  copyRemastered(xmlRelative, `assets/silly-billy/${targetBase}.xml`);
  const frames = parseSparrowFrames(readRemasteredText(xmlRelative));
  const animations = {};
  for (const [name, prefix] of Object.entries(animationPrefixes)) {
    animations[name] = {
      frames: framesByPrefix(frames, prefix),
      fps: Number(extra.fps || 24),
      loop: extra.loop !== false,
      offset: [0, 0]
    };
  }
  return { image, animations, scale: Number(extra.scale || 1), noAntialiasing: !!extra.noAntialiasing };
}

function buildErectAtlas(imageRelative, targetBase, animationPrefixes, extra = {}) {
  const image = copyErect(`images/${imageRelative}.png`, `assets/silly-billy/${targetBase}.png`);
  const xmlRelative = `images/${imageRelative}.xml`;
  copyErect(xmlRelative, `assets/silly-billy/${targetBase}.xml`);
  const frames = parseSparrowFrames(readErectText(xmlRelative));
  const animations = {};
  for (const [name, prefix] of Object.entries(animationPrefixes)) {
    animations[name] = {
      frames: framesByPrefix(frames, prefix),
      fps: Number(extra.fps || 24),
      loop: extra.loop === true,
      offset: [0, 0]
    };
  }
  return { image, animations, scale: Number(extra.scale || 1), noAntialiasing: !!extra.noAntialiasing };
}

function firstFrame(frames, prefix) {
  return framesByPrefix(frames, prefix)[0] || null;
}

function buildNoteDirs(frames) {
  return {
    left: {
      static: firstFrame(frames, "arrowLEFT"),
      gem: firstFrame(frames, "purple"),
      press: framesByPrefix(frames, "left press"),
      confirm: framesByPrefix(frames, "left confirm"),
      hold: { piece: firstFrame(frames, "purple hold piece"), end: firstFrame(frames, "pruple end hold") }
    },
    down: {
      static: firstFrame(frames, "arrowDOWN"),
      gem: firstFrame(frames, "blue"),
      press: framesByPrefix(frames, "down press"),
      confirm: framesByPrefix(frames, "down confirm"),
      hold: { piece: firstFrame(frames, "blue hold piece"), end: firstFrame(frames, "blue hold end") }
    },
    up: {
      static: firstFrame(frames, "arrowUP"),
      gem: firstFrame(frames, "green"),
      press: framesByPrefix(frames, "up press"),
      confirm: framesByPrefix(frames, "up confirm"),
      hold: { piece: firstFrame(frames, "green hold piece"), end: firstFrame(frames, "green hold end") }
    },
    right: {
      static: firstFrame(frames, "arrowRIGHT"),
      gem: firstFrame(frames, "red"),
      press: framesByPrefix(frames, "right press"),
      confirm: framesByPrefix(frames, "right confirm"),
      hold: { piece: firstFrame(frames, "red hold piece"), end: firstFrame(frames, "red hold end") }
    }
  };
}

function gridFrame(name, imageKey, col, row, width, height) {
  return {
    name,
    imageKey,
    x: col * width,
    y: row * height,
    w: width,
    h: height,
    fx: 0,
    fy: 0,
    fw: width,
    fh: height,
    rotated: false,
    pixel: true
  };
}

function buildPixelNoteDirs() {
  const names = ["left", "down", "up", "right"];
  const dirs = {};
  names.forEach((name, col) => {
    dirs[name] = {
      pixel: true,
      static: gridFrame(`pixel-${name}-static`, "notes:pixel", col, 0, 17, 17),
      gem: gridFrame(`pixel-${name}-gem`, "notes:pixel", col, 1, 17, 17),
      press: [gridFrame(`pixel-${name}-press`, "notes:pixel", col, 2, 17, 17)],
      confirm: [
        gridFrame(`pixel-${name}-confirm-1`, "notes:pixel", col, 3, 17, 17),
        gridFrame(`pixel-${name}-confirm-2`, "notes:pixel", col, 4, 17, 17)
      ],
      hold: {
        piece: gridFrame(`pixel-${name}-hold-piece`, "notes:pixelEnds", col, 0, 7, 4),
        end: gridFrame(`pixel-${name}-hold-end`, "notes:pixelEnds", col, 1, 7, 4)
      }
    };
  });
  return dirs;
}

function buildNotes() {
  const image = copyRemastered("assets/shared/images/noteSkins/NOTE_assets.png", "assets/silly-billy/NOTE_assets.png");
  copyRemastered("assets/shared/images/noteSkins/NOTE_assets.xml", "assets/silly-billy/NOTE_assets.xml");
  const frames = parseSparrowFrames(readRemasteredText("assets/shared/images/noteSkins/NOTE_assets.xml"));
  const pixelImage = copyRemastered("assets/shared/images/pixelUI/noteSkins/NOTE_assets.png", "assets/silly-billy/pixel-NOTE_assets.png");
  const pixelEndsImage = copyRemastered("assets/shared/images/pixelUI/noteSkins/NOTE_assetsENDS.png", "assets/silly-billy/pixel-NOTE_assetsENDS.png");
  const hurtImage = copyErect("images/Blue_Notes.png", "assets/silly-billy/Blue_Notes.png");
  copyErect("images/Blue_Notes.xml", "assets/silly-billy/Blue_Notes.xml");
  const hurtFrames = parseSparrowFrames(readErectText("images/Blue_Notes.xml"));
  return {
    image,
    pixelImage,
    pixelEndsImage,
    hurtImage,
    dirs: buildNoteDirs(frames),
    pixelDirs: buildPixelNoteDirs(),
    hurtDirs: buildNoteDirs(hurtFrames)
  };
}

function convertChart() {
  const raw = readErectJson("data/silly-billy/silly-billy.json").song;
  const bpm = Number(raw.bpm || 173);
  const spb = 60 / bpm;
  const notes = [];
  const timeline = [];
  let cursorBeat = 0;
  let noteIndex = 0;

  for (const section of raw.notes || []) {
    const beats = Math.max(0.25, Number(section.lengthInSteps || section.sectionBeats * 4 || 16) / 4);
    const startBeat = cursorBeat;
    const endBeat = cursorBeat + beats;
    const baseSide = section.mustHitSection ? "player" : "opp";
    timeline.push({
      startBeat: round(startBeat),
      endBeat: round(endBeat),
      startTime: round(startBeat * spb),
      endTime: round(endBeat * spb),
      turn: baseSide,
      label: "Silly Billy section",
      style: section.altAnim ? "alt" : "normal",
      int: section.altAnim ? 0.96 : 0.86,
      mustHitSection: !!section.mustHitSection,
      altAnim: !!section.altAnim
    });

    for (const rawNote of section.sectionNotes || []) {
      const time = Number(rawNote[0] || 0) / 1000;
      const rawData = Number(rawNote[1] || 0);
      const sustain = Math.max(0, Number(rawNote[2] || 0)) / 1000;
      const noteType = String(rawNote[3] || "");
      const group = Math.floor(rawData / 4);
      const laneBase = ((rawData % 4) + 4) % 4;
      const side = group % 2 === 0 ? baseSide : (baseSide === "player" ? "opp" : "player");
      const noAnim = noteType === "No Animation";
      notes.push({
        id: `silly-billy-${noteIndex++}`,
        beat: round(time / spb),
        time: round(time),
        lane: laneBase + (side === "player" ? 4 : 0),
        side,
        character: noAnim ? null : (side === "player" ? "player" : "dad"),
        sLen: round(sustain),
        alt: !!section.altAnim || noteType === "Alt Animation",
        noteType,
        hurt: noteType === "Hurt Note",
        avoid: noteType === "Hurt Note",
        noAnim
      });
    }
    cursorBeat = endBeat;
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const noteEnd = notes.reduce((max, note) => Math.max(max, note.time + Math.max(0, note.sLen || 0)), 0);
  return {
    bpm,
    spb: round(spb),
    notes,
    timeline,
    totalBeats: round(cursorBeat),
    totalTime: round(Math.max(365.2, noteEnd + 0.4))
  };
}

function convertEvents() {
  const raw = readErectJson("data/silly-billy-erect/events.json").song;
  const lyricAllow = new Set(["I'LL MAKE", "ILL MAKE", "YOU SAY", "HOW PROUD", "YOU", "YOU ARE", "YOU ARE OF", "YOU ARE OF ME"]);
  const lyricEvents = [];
  const commandEvents = [];
  const erectEvents = [];
  for (const event of raw.events || []) {
    const time = round(Number(event[0] || 0) / 1000);
    for (const command of event[1] || []) {
      const [name, action, value] = command;
      const commandName = String(name || "");
      const commandAction = String(action || "");
      const commandValue = String(value || "");
      erectEvents.push({ time, name: commandName, action: commandAction, value: commandValue });
      if (commandName === "ill make" && ["break mirror", "pre", "anim", "black", "vid", "hud in", "die"].includes(commandAction)) {
        commandEvents.push({ time, action: commandAction, value: commandValue });
      }
      if (commandName !== "ill make") {
        if (["Camera Zoom", "Add Camera Zoom", "Screen Shake", "Image Flash", "Change Character", "Play Animation", "Set Property", "icon switch"].includes(commandName)) {
          commandEvents.push({ time, action: commandName, value: commandAction, value2: commandValue });
        }
        if (!commandName && ["zoomin", "hurt", "removeLock", "setZoom"].includes(commandAction)) {
          commandEvents.push({ time, action: commandAction, value: commandValue });
        }
        continue;
      }
      if (name !== "ill make") continue;
      const normalized = String(value || "").trim().toUpperCase().replace(/’/g, "'");
      if (action === "txt" && time >= 291 && time <= 303 && lyricAllow.has(normalized)) {
        lyricEvents.push({ time, text: String(value || "").trim() });
      }
      if (["setZoom", "zoomin", "zoomdone", "mirror break", "arrowMiddle", "arrowDefault", "hideTrans", "FADE", "bluShader", "preLyrics", "byebye"].includes(action)) {
        commandEvents.push({ time, action, value: String(value || "") });
      }
    }
  }
  return { lyricEvents, commandEvents, erectEvents };
}

function writeDataFile(targetName, objectName, payload) {
  const targetPath = path.join(PROJECT_ROOT, targetName);
  fs.writeFileSync(targetPath, `window.${objectName}=${JSON.stringify(payload)};\n`, "utf8");
}

function main() {
  const chart = convertChart();
  const events = convertEvents();
  const notes = buildNotes();
  const stage = {
    mirror: copyRemastered("assets/shared/images/background/silly-mirrors/silly_mirror.png", "assets/silly-billy/silly_mirror.png"),
    brokenMirror: copyRemastered("assets/shared/images/background/silly-mirrors/broken_mirror.png", "assets/silly-billy/broken_mirror.png"),
    clouds: copyRemastered("assets/shared/images/background/shared/Silly_clouds.png", "assets/silly-billy/Silly_clouds.png"),
    floor: copyRemastered("assets/shared/images/background/shared/Silly_floor.png", "assets/silly-billy/Silly_floor.png"),
    pillars1: copyRemastered("assets/shared/images/background/shared/Silly_pillars1.png", "assets/silly-billy/Silly_pillars1.png"),
    pillars2: copyRemastered("assets/shared/images/background/shared/Silly_pillars2.png", "assets/silly-billy/Silly_pillars2.png"),
    vignette: copyRemastered("assets/shared/images/background/shared/vignette.png", "assets/silly-billy/vignette.png"),
    void: copyRemastered("assets/shared/images/void.png", "assets/silly-billy/void.png"),
    light: copyRemastered("assets/shared/images/light above.png", "assets/silly-billy/light-above.png"),
    bars: copyRemastered("assets/shared/images/bars.png", "assets/silly-billy/bars.png"),
    healthBack: copyRemastered("assets/shared/images/healthbar/what is even the point of this....png", "assets/silly-billy/healthbar-bg.png"),
    healthBar: copyRemastered("assets/shared/images/healthbar/Silly_Healthbar.png", "assets/silly-billy/Silly_Healthbar.png"),
    healthBarPico: copyRemastered("assets/shared/images/healthbar/Silly_Healthbar-pico.png", "assets/silly-billy/Silly_Healthbar-pico.png"),
    healthFill: copyRemastered("assets/shared/images/healthbar/Bar_1px.png", "assets/silly-billy/Bar_1px.png"),
    healthFillPico: copyRemastered("assets/shared/images/healthbar/Bar_1px-pico.png", "assets/silly-billy/Bar_1px-pico.png"),
    iconPixelDad: copyRemastered("assets/shared/images/icons/pixel.png", "assets/silly-billy/icon-pixel.png"),
    iconPixelBf: copyRemastered("assets/shared/images/icons/icon-bf-pixel.png", "assets/silly-billy/icon-bf-pixel.png"),
    iconAishite1: copyErect("images/Bar/icons/aishite/1.png", "assets/silly-billy/aishite-1.png"),
    iconAishite2: copyErect("images/Bar/icons/aishite/2.png", "assets/silly-billy/aishite-2.png"),
    iconAishite3: copyErect("images/Bar/icons/aishite/3.png", "assets/silly-billy/aishite-3.png"),
    iconAishite4: copyErect("images/Bar/icons/aishite/4.png", "assets/silly-billy/aishite-4.png"),
    iconAishite5: copyErect("images/Bar/icons/aishite/5.png", "assets/silly-billy/aishite-5.png"),
    iconAishite6: copyErect("images/Bar/icons/aishite/6.png", "assets/silly-billy/aishite-6.png"),
    iconAishite7: copyErect("images/Bar/icons/aishite/7.png", "assets/silly-billy/aishite-7.png"),
    stageZoom: 0.725,
    positions: {
      dad: [910, 660],
      player: [1610, 1090],
      pixelDad: [2500, 3100],
      pixelPlayer: [4000, 3500],
      monika: [3350, 3350],
      light: [900, 750]
    }
  };

  const sprites = {
    dad: buildCharacter("evilLookalike", "evil-lookalike"),
    smallizeDad: buildCharacter("transLookalike", "trans-lookalike"),
    shortDad: buildCharacter("bf-lookalike", "bf-lookalike"),
    unshrinkDad: buildCharacter("transLookalike2", "trans-lookalike2"),
    player: asPlayer(buildCharacter("bfurself", "bfurself")),
    pixelDad: buildCharacter("lookalike", "pixel-lookalike"),
    pixelPlayer: asPlayer(buildCharacter("bf-pixel", "pixel-bf")),
    school: buildAtlas("animatedEvilSchool", "animated-evil-school", { idle: "background 2 instance" }, { fps: 24, scale: 13.2, noAntialiasing: true }),
    monika: buildAtlas("pixelmonika", "pixelmonika", { idle: "Monika_Neutral_gif" }, { fps: 24, scale: 0.4, noAntialiasing: true }),
    lyricSay: buildErectAtlas("Bar/icons/lirycsspritesthatifoundonawiki,idonotknowwhomadethemsorry", "ill-make-lyric-1", { idle: "lirycs" }, { fps: 31, scale: 2.4, loop: false, noAntialiasing: true }),
    lyricProud: buildErectAtlas("Bar/icons/lirycsspritesthatifoundonawiki,idonotknowwhomadethemsorry2", "ill-make-lyric-2", { idle: "lirycs" }, { fps: 31, scale: 2.4, loop: false, noAntialiasing: true })
  };

  const audio = {
    inst: copyErect("songs/silly-billy/Inst.ogg", "silly-billy-inst.ogg"),
    voices: extractFlpVocalWav("silly-billy-voices.wav")
  };
  const videos = {
    intro: copyErect("videos/open.mp4", "open.mp4"),
    stay: copyErect("videos/SO_STAY_FINAL.mp4", "silly-billy-so-stay-final.mp4")
  };

  writeDataFile("silly-billy-data.js", "SILLY_BILLY_DATA", {
    song: {
      title: "Silly Billy",
      subtitle: "Normal chart, FLP vocals, Remastered visuals",
      diff: "Normal",
      bpm: chart.bpm
    },
    audio,
    videos,
    chart: { ...chart, ...events },
    stage,
    sprites,
    notes,
    source: {
      chart: "Vs Silly Billy Port PE 0.7.3/data/silly-billy/silly-billy.json",
      visuals: "SILLY BILLY REMASTERED/assets/shared",
      audio: "Normal Silly Billy Inst.ogg + C:/Users/matth/AppData/Local/Temp/sillyvocalflp.flp"
    }
  });

  console.log("Imported Silly Billy into", PROJECT_ROOT);
  console.log(`Notes: ${chart.notes.length}, holds: ${chart.notes.filter(note => note.sLen > 0).length}, kept lyrics: ${events.lyricEvents.length}`);
}

main();
