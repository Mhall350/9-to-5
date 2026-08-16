"use strict";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const W = 800, H = 600;
const keys = new Set();
const images = new Map();
const sounds = {};
const imagePaths = [
  "homescreen.png", "warning.png", "bathroom_bg.png", "desk.png", "plant.png",
  "coffee.png", "Justin.png", "Daniel.png", "Mark.png", "James.png", "bathroom.png",
  "door.png", "toilet.png", "sink.png",
  "events/printer.png", "events/donuts.png", "events/coffee_spill.png",
  "events/compliment.png", "events/meeting.png",
  ...["down", "up", "left", "right"].flatMap(d => [0, 1, 2, 3].map(i => `player/${d}/${i}.png`))
];

function loadImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images.set(path, img); resolve(); };
    img.onerror = () => resolve();
    img.src = `assets/${path}`;
  });
}

function makeAudio(name) {
  const audio = new Audio(`assets/sound/${name}.ogg`);
  audio.volume = name === "bgm" ? 0.3 : 0.7;
  return audio;
}

for (const name of ["bgm", "productivity", "energy", "mood", "door", "flush"]) sounds[name] = makeAudio(name);
sounds.bgm.loop = true;
function playSound(name) {
  const sound = sounds[name];
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

const rect = (x, y, w, h) => ({ x, y, w, h });
const obj = (x, y, w, h, image, name, teleportTo = null, spawnAt = null) =>
  ({ ...rect(x, y, w, h), image, name, teleportTo, spawnAt });

const office = {
  key: "Office",
  walls: [rect(90,100,10,400), rect(375,100,10,400), rect(650,100,10,400),
    rect(100,300,560,10), rect(0,0,800,20), rect(0,0,20,600), rect(780,0,20,600), rect(0,580,800,20)],
  objects: [
    obj(100,310,50,40,"desk.png","Desk"), obj(208,310,40,40,"plant.png","Plant"),
    obj(757,89,40,60,"coffee.png","Coffee Machine"), obj(388,310,50,50,"Justin.png","Justin"),
    obj(501,250,50,50,"Daniel.png","Daniel"), obj(100,245,50,50,"Mark.png","Mark"),
    obj(730,20,50,50,"bathroom.png","BathroomDoor","Bathroom",[552,400]),
    obj(730,170,50,50,"bathroom.png","JamesDoor","James_office",[552,400])
  ]
};
const bathroom = {
  key: "Bathroom", background: "bathroom_bg.png",
  walls: [rect(100,100,600,20), rect(100,480,600,20), rect(100,100,20,400), rect(680,100,20,400)],
  objects: [obj(170,145,45,50,"toilet.png","Toilet"), obj(580,135,50,70,"sink.png","Sink"),
    obj(620,400,50,80,"bathroom.png","OfficeDoor","Office",[675,20])]
};
const jamesOffice = {
  key: "James_office",
  walls: [rect(100,100,600,20), rect(100,480,600,20), rect(100,100,20,400), rect(680,100,20,400)],
  objects: [obj(360,250,70,70,"James.png","James"),
    obj(620,400,50,80,"bathroom.png","OfficeDoor","Office",[675,170])]
};
const rooms = { Office: office, Bathroom: bathroom, James_office: jamesOffice };
const exitDoor = obj(750,250,40,100,"door.png","Door");

const player = { x: 100, y: 440, w: 50, h: 60, speed: 180, direction: "down",
  frame: 0, frameTime: 0, energy: 100, mood: 100, productivity: 0 };
let room = office, state = "TITLE", day = 1, doorUnlocked = false;
let message = "", messageTime = 0, talking = false, dialogueName = "", dialogue = "";
let introTime = 0, eventTime = randomEventDelay(), eventImage = null, eventImageTime = 0;
let lastTime = 0;

const dialogues = {
  Mark: ["Hi, I'm Mark!", "Someone didn't flush in the bathroom...", "You ever want to touch feet? Yeah, me neither..."],
  Justin: ["Morning! We need you on the phone!", "JUSTICE!", "I think the printer jammed again..."],
  Daniel: ["Coffee's running low again.", "You seen James?", "Almost time for lunch, hang in there!"],
  James: ["This is going on your score card...", "Do you have a minute to talk about your performance?", "Close the door. We need to talk."]
};
const dialogueIndex = Object.fromEntries(Object.keys(dialogues).map(name => [name, 0]));
const events = [
  ["Printer jammed! Productivity -10", "events/printer.png", () => player.productivity = Math.max(0, player.productivity - 10)],
  ["Coworker brought donuts! Mood +10", "events/donuts.png", () => player.mood += 10],
  ["You spilled your coffee! Energy -10", "events/coffee_spill.png", () => player.energy = Math.max(0, player.energy - 10)],
  ["Boss complimented your work! Mood +15", "events/compliment.png", () => player.mood += 15],
  ["Unexpected meeting! Productivity -5", "events/meeting.png", () => player.productivity = Math.max(0, player.productivity - 5)]
];

function randomEventDelay() { return 13.3 + Math.random() * 13.4; }
function collides(a, b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function near(a, b) { return collides(a, { x:b.x-10, y:b.y-10, w:b.w+20, h:b.h+20 }); }
function showMessage(text) { message = text; messageTime = 1; }

function startDay() { state = "DAY_INTRO"; introTime = 1; }
function resetDay() {
  doorUnlocked = false; day++; room = office; player.x = 100; player.y = 440;
  player.productivity = 0; player.energy = Math.max(0, player.energy - 10); player.mood = Math.max(0, player.mood - 5);
  office.objects = office.objects.filter(o => o !== exitDoor);
}

function interact() {
  for (const thing of room.objects) {
    if (!near(player, thing)) continue;
    if (thing.teleportTo) {
      playSound("door"); room = rooms[thing.teleportTo]; [player.x, player.y] = thing.spawnAt;
      showMessage(room.key.replace("_", " ")); return;
    }
    if (thing.name === "Desk") { playSound("productivity"); player.productivity += 10; showMessage("The calls are rolling in! Productivity +10"); return; }
    if (thing.name === "Coffee Machine") { playSound("energy"); player.energy += 10; showMessage("Energy restored! +10"); return; }
    if (thing.name === "Plant") { playSound("mood"); player.mood += 5; showMessage("Watered your plant! Mood +5"); return; }
    if (thing.name === "Sink") { playSound("mood"); player.mood += 2; showMessage("You washed your hands! Mood +2"); return; }
    if (thing.name === "Toilet") { playSound("flush"); showMessage("Who didn't flush..."); return; }
    if (thing.name === "Door") { if (doorUnlocked) { playSound("door"); state = "DAY_COMPLETE"; } return; }
    if (dialogues[thing.name]) {
      dialogueName = thing.name; dialogue = dialogues[thing.name][dialogueIndex[thing.name]];
      dialogueIndex[thing.name] = (dialogueIndex[thing.name] + 1) % dialogues[thing.name].length;
      talking = true; return;
    }
  }
}

window.addEventListener("keydown", e => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.repeat) return;
  if (state === "TITLE" && e.key === "Enter") state = "WARNING";
  else if (state === "WARNING" && e.key === "Enter") { sounds.bgm.play().catch(() => {}); startDay(); }
  else if (state === "DAY_INTRO" && e.key === "Enter") state = "PLAYING";
  else if (state === "DAY_COMPLETE" && e.key.toLowerCase() === "n") { resetDay(); startDay(); }
  else if (state === "PLAYING" && e.key === "Enter" && talking) talking = false;
  else if (state === "PLAYING" && e.key.toLowerCase() === "e" && !talking) interact();
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function move(dt) {
  let dx = 0, dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) { dx = -player.speed*dt; player.direction = "left"; }
  else if (keys.has("arrowright") || keys.has("d")) { dx = player.speed*dt; player.direction = "right"; }
  else if (keys.has("arrowup") || keys.has("w")) { dy = -player.speed*dt; player.direction = "up"; }
  else if (keys.has("arrowdown") || keys.has("s")) { dy = player.speed*dt; player.direction = "down"; }
  const obstacles = [...room.walls, ...room.objects];
  player.x += dx;
  for (const wall of obstacles) if (collides(player, wall)) player.x = dx > 0 ? wall.x-player.w : wall.x+wall.w;
  player.y += dy;
  for (const wall of obstacles) if (collides(player, wall)) player.y = dy > 0 ? wall.y-player.h : wall.y+wall.h;
  if (dx || dy) { player.frameTime += dt; if (player.frameTime >= 1/6) { player.frame = (player.frame+1)%4; player.frameTime = 0; } }
  else player.frame = 0;
}

function update(dt) {
  messageTime = Math.max(0, messageTime-dt); eventImageTime = Math.max(0, eventImageTime-dt);
  if (!eventImageTime) eventImage = null;
  if (state === "DAY_INTRO" && (introTime -= dt) <= 0) state = "PLAYING";
  if (state !== "PLAYING") return;
  if (!talking) move(dt);
  if (room === office && !talking && (eventTime -= dt) <= 0) {
    const chosen = events[Math.floor(Math.random()*events.length)]; chosen[2](); showMessage(chosen[0]);
    eventImage = chosen[1]; eventImageTime = 1.5; eventTime = randomEventDelay();
  }
  if (room === office && player.productivity >= 100 && !doorUnlocked) {
    doorUnlocked = true; office.objects.push(exitDoor); showMessage("Finally! It's quitting time!");
  }
}

function drawImage(path, x, y, w, h) {
  const img = images.get(path);
  if (img) ctx.drawImage(img, x, y, w, h); else { ctx.fillStyle="#c020c0"; ctx.fillRect(x,y,w,h); }
}
function text(value, x, y, size=24, color="#fff", align="left") {
  ctx.font = `${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value,x,y);
}
function drawRoom() {
  if (room === bathroom) { ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H); drawImage(room.background,100,100,600,400); }
  else { ctx.fillStyle = room === office ? "#b4b4b4" : "#000"; ctx.fillRect(0,0,W,H); if (room === jamesOffice) { ctx.fillStyle="#aaa"; ctx.fillRect(100,100,600,400); } }
  ctx.fillStyle = room === bathroom ? "#000" : "#666";
  for (const wall of room.walls) ctx.fillRect(wall.x,wall.y,wall.w,wall.h);
  for (const thing of room.objects) drawImage(thing.image,thing.x,thing.y,thing.w,thing.h);
}
function drawGame() {
  drawRoom(); drawImage(`player/${player.direction}/${player.frame}.png`,player.x,player.y,player.w,player.h);
  ctx.fillStyle="#ddd"; ctx.fillRect(0,0,W,30);
  text(`Day ${day} | Productivity: ${player.productivity}  Energy: ${player.energy}  Mood: ${player.mood}`,10,23,20,"#000");
  if (state === "DAY_INTRO") text(`Day ${day} Begins!`,W/2,H/2,56,"#fff","center");
  if (eventImage) drawImage(eventImage,200,150,400,300);
  if (talking) { ctx.fillStyle="#1e1e1e"; ctx.fillRect(0,500,W,100); ctx.strokeStyle="#ccc"; ctx.lineWidth=2; ctx.strokeRect(5,505,790,90); text(`${dialogueName}:`,20,535,22,"#ff0"); text(dialogue,20,570,22); }
  else if (messageTime > 0) { ctx.fillStyle="#323232"; ctx.fillRect(0,560,W,40); text(message,10,587,22); }
}
function draw() {
  if (state === "TITLE") drawImage("homescreen.png",0,0,W,H);
  else if (state === "WARNING") drawImage("warning.png",0,0,W,H);
  else if (state === "DAY_COMPLETE") { ctx.fillStyle="#000"; ctx.fillRect(0,0,W,H); text("Day Complete!",W/2,275,56,"#fff","center"); text("Ready for the next day? Press N",W/2,330,28,"#ccc","center"); }
  else drawGame();
}
function loop(time) {
  const dt = Math.min((time-lastTime)/1000 || 0, .05); lastTime = time; update(dt); draw(); requestAnimationFrame(loop);
}

Promise.all(imagePaths.map(loadImage)).then(() => requestAnimationFrame(loop));
