// The desk: a pannable, zoomable mat that the page's DOM is laid out on.
// Without this script (or in list view) the same DOM reads as an ordinary scrolling page.

const html = document.documentElement;
const desk = document.getElementById("desk") as HTMLElement;
const world = document.getElementById("world") as HTMLElement;
const items = [...world.querySelectorAll<HTMLElement>(".item")];
const rulerX = document.querySelector<HTMLCanvasElement>(".ruler-x") as HTMLCanvasElement;
const rulerY = document.querySelector<HTMLCanvasElement>(".ruler-y") as HTMLCanvasElement;
const zoomRead = document.querySelector<HTMLOutputElement>(".zoom-read") as HTMLOutputElement;
const minimap = document.querySelector<HTMLButtonElement>(".minimap") as HTMLButtonElement;
const modeToggle = document.querySelector<HTMLButtonElement>("[data-mode-toggle]") as HTMLButtonElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

const Z_MIN = 0.04;
const Z_MAX = 2.5;
const RULER = 22;
const TOP_BAR = 64;
const BOTTOM_BAR = 84;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Cam {
  x: number;
  y: number;
  z: number;
}

const cam: Cam = { x: 0, y: 0, z: 1 };
const goal: Cam = { x: 0, y: 0, z: 1 };
let stiffness = 9;
let settle: (() => void) | null = null;
let boxes = new Map<HTMLElement, Box>();
let vw = 0;
let vh = 0;

const clampZ = (z: number) => Math.min(Z_MAX, Math.max(Z_MIN, z));
const num = (el: HTMLElement, key: string) => Number(el.dataset[key] ?? 0);

// ---------- layout ----------

function place() {
  for (const el of items) {
    el.style.translate = `${num(el, "x")}px ${num(el, "y")}px`;
    el.style.rotate = `${num(el, "tilt")}deg`;
  }
}

function unplace() {
  for (const el of items) {
    el.style.translate = "";
    el.style.rotate = "";
  }
  world.style.transform = "";
}

function measure() {
  boxes = new Map(
    items.map((el) => [el, { x: num(el, "x"), y: num(el, "y"), w: el.offsetWidth, h: el.offsetHeight }] as const),
  );
  vw = desk.clientWidth;
  vh = desk.clientHeight;
}

function union(list: Box[]): Box {
  const x0 = Math.min(...list.map((b) => b.x));
  const y0 = Math.min(...list.map((b) => b.y));
  const x1 = Math.max(...list.map((b) => b.x + b.w));
  const y1 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function groupBox(group: string): Box {
  return union(items.filter((el) => el.dataset.group === group).map((el) => boxes.get(el) as Box));
}

const everything = () => union([...boxes.values()]);

// Camera that shows `box` with `pad` screen pixels around it, clear of the HUD bars.
function fit(box: Box, pad = 40, top = TOP_BAR, bottom = BOTTOM_BAR): Cam {
  const availW = vw - RULER - pad * 2;
  const availH = vh - top - bottom - pad * 2;
  const z = clampZ(Math.min(availW / box.w, availH / box.h));
  const cx = box.x + box.w / 2 - RULER / 2 / z;
  const cy = box.y + box.h / 2 - (top - bottom) / 2 / z;
  return { x: cx, y: cy, z };
}

// ---------- camera ----------

function go(to: Cam, opts: { instant?: boolean; stiffness?: number } = {}): Promise<void> {
  Object.assign(goal, { ...to, z: clampZ(to.z) });
  stiffness = opts.stiffness ?? 9;
  if (opts.instant || reduced.matches) Object.assign(cam, goal);
  wake();
  return new Promise((resolve) => {
    settle?.();
    settle = resolve;
  });
}

let raf = 0;
let last = 0;
function wake() {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const k = 1 - Math.exp(-dt * stiffness);
  cam.x += (goal.x - cam.x) * k;
  cam.y += (goal.y - cam.y) * k;
  cam.z = Math.exp(Math.log(cam.z) + (Math.log(goal.z) - Math.log(cam.z)) * k);
  const done =
    Math.abs(goal.x - cam.x) * cam.z < 0.3 &&
    Math.abs(goal.y - cam.y) * cam.z < 0.3 &&
    Math.abs(goal.z - cam.z) / goal.z < 0.001;
  if (done) Object.assign(cam, goal);
  apply();
  if (done) {
    raf = 0;
    desk.classList.remove("moving");
    settle?.();
    settle = null;
  } else {
    desk.classList.add("moving");
    raf = requestAnimationFrame(tick);
  }
}

function apply() {
  const tx = vw / 2 - cam.x * cam.z;
  const ty = vh / 2 - cam.y * cam.z;
  world.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.z})`;
  world.style.setProperty("--z", cam.z.toFixed(4));
  desk.style.setProperty("--gx", `${tx}px`);
  desk.style.setProperty("--gy", `${ty}px`);
  let cell = 40;
  while (cell * cam.z < 14) cell *= 5;
  desk.style.setProperty("--gs", `${cell * cam.z}px`);
  zoomRead.value = `${Math.round(cam.z * 100)}%`;
  drawRulers(tx, ty);
  drawViewport();
}

function zoomAt(factor: number, sx: number, sy: number, animate = false) {
  const from = animate ? goal : cam;
  const z = clampZ(from.z * factor);
  const wx = from.x + (sx - vw / 2) / from.z;
  const wy = from.y + (sy - vh / 2) / from.z;
  const to = { x: wx - (sx - vw / 2) / z, y: wy - (sy - vh / 2) / z, z };
  if (animate) go(to);
  else {
    Object.assign(cam, to);
    Object.assign(goal, to);
    apply();
  }
}

// ---------- rulers and minimap ----------

const dpr = () => Math.min(2, window.devicePixelRatio || 1);
let dotFont = "monospace";

function sizeRulers() {
  for (const [c, w, h] of [
    [rulerX, vw, RULER],
    [rulerY, RULER, vh],
  ] as const) {
    c.width = Math.round(w * dpr());
    c.height = Math.round(h * dpr());
  }
}

function drawRulers(tx: number, ty: number) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000];
  const step = steps.find((s) => s * cam.z >= 9) ?? 2000;
  for (const axis of ["x", "y"] as const) {
    const c = axis === "x" ? rulerX : rulerY;
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    const r = dpr();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    const len = axis === "x" ? vw : vh;
    ctx.clearRect(0, 0, axis === "x" ? len : RULER, axis === "x" ? RULER : len);
    ctx.fillStyle = "rgb(255 255 255 / 0.85)";
    ctx.strokeStyle = "rgb(255 255 255 / 0.7)";
    ctx.lineWidth = 1;
    ctx.font = `11px ${dotFont}`;
    const offset = axis === "x" ? tx : ty;
    const first = Math.floor(-offset / cam.z / step) * step;
    const lastWorld = (len - offset) / cam.z;
    ctx.beginPath();
    for (let w = first; w <= lastWorld; w += step) {
      const p = Math.round(offset + w * cam.z) + 0.5;
      const major = w % (step * 5) === 0;
      const tickLen = major ? 10 : w % ((step * 5) / 5) === 0 ? 5 : 4;
      if (axis === "x") {
        ctx.moveTo(p, RULER);
        ctx.lineTo(p, RULER - tickLen);
        if (major) ctx.fillText(String(w), p + 3, 10);
      } else {
        ctx.moveTo(RULER, p);
        ctx.lineTo(RULER - tickLen, p);
        if (major) {
          ctx.save();
          ctx.translate(10, p - 3);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(w), 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
  }
}

const SVG = "http://www.w3.org/2000/svg";
const mapSvg = minimap.querySelector("svg") as SVGSVGElement;
let mapView: SVGRectElement | null = null;

function drawMinimap() {
  const all = everything();
  const pad = 200;
  mapSvg.setAttribute("viewBox", `${all.x - pad} ${all.y - pad} ${all.w + pad * 2} ${all.h + pad * 2}`);
  mapSvg.replaceChildren();
  for (const [el, b] of boxes) {
    const r = document.createElementNS(SVG, "rect");
    for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, rx: 24 }))
      r.setAttribute(k, String(v));
    r.setAttribute("class", el.classList.contains("label") ? "m-label" : el.id === "home" ? "m-home" : "m-sheet");
    mapSvg.append(r);
  }
  mapView = document.createElementNS(SVG, "rect");
  mapView.setAttribute("class", "m-view");
  mapView.setAttribute("rx", "30");
  mapSvg.append(mapView);
}

function drawViewport() {
  if (!mapView) return;
  const w = vw / cam.z;
  const h = vh / cam.z;
  mapView.setAttribute("x", String(cam.x - w / 2));
  mapView.setAttribute("y", String(cam.y - h / 2));
  mapView.setAttribute("width", String(w));
  mapView.setAttribute("height", String(h));
}

// ---------- input ----------

const pointers = new Map<number, { x: number; y: number }>();
let dragged = false;
let pinchDist = 0;
let velocity = { x: 0, y: 0, t: 0 };
const interactive = "a, button, input, textarea, select, summary, iframe, [contenteditable]";

desk.addEventListener("pointerdown", (e) => {
  if (!html.classList.contains("desk") || html.classList.contains("is-live")) return;
  if ((e.target as Element).closest(interactive)) return;
  if (e.button !== 0 && e.pointerType === "mouse") return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  desk.setPointerCapture(e.pointerId);
  dragged = false;
  velocity = { x: 0, y: 0, t: performance.now() };
  Object.assign(goal, cam);
  if (pointers.size === 2) pinchDist = spread();
});

function spread(): number {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

desk.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!dragged && Math.hypot(dx, dy) < 3) return;
  if (!dragged) {
    dragged = true;
    desk.classList.add("dragging");
  }
  if (pointers.size === 1) {
    cam.x -= dx / cam.z;
    cam.y -= dy / cam.z;
    Object.assign(goal, cam);
    const now = performance.now();
    const dt = Math.max(1, now - velocity.t);
    velocity = { x: dx / dt, y: dy / dt, t: now };
    apply();
  } else if (pointers.size === 2) {
    const d = spread();
    const [a, b] = [...pointers.values()];
    const rect = desk.getBoundingClientRect();
    if (pinchDist > 0) zoomAt(d / pinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
    pinchDist = d;
  }
});

function release(e: PointerEvent) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size === 0) {
    desk.classList.remove("dragging");
    const idle = performance.now() - velocity.t;
    if (dragged && idle < 60 && !reduced.matches) {
      go({ x: cam.x - (velocity.x * 260) / cam.z, y: cam.y - (velocity.y * 260) / cam.z, z: cam.z }, { stiffness: 5 });
    }
  }
  pinchDist = pointers.size === 2 ? spread() : 0;
}
desk.addEventListener("pointerup", release);
desk.addEventListener("pointercancel", release);

// A plain click on a sheet (not a drag, not a link) brings it to the middle of the screen.
desk.addEventListener("click", (e) => {
  if (!html.classList.contains("desk") || dragged) return;
  const target = e.target as Element;
  if (target.closest(interactive)) return;
  const item = target.closest<HTMLElement>(".item");
  if (item) go(fit(boxes.get(item) as Box, 56));
});

desk.addEventListener(
  "wheel",
  (e) => {
    if (!html.classList.contains("desk") || html.classList.contains("is-live")) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const rect = desk.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(Math.exp((-e.deltaY * scale) / 240), e.clientX - rect.left, e.clientY - rect.top);
    } else {
      cam.x += (e.deltaX * scale) / cam.z;
      cam.y += (e.deltaY * scale) / cam.z;
      Object.assign(goal, cam);
      apply();
    }
  },
  { passive: false },
);

// Safari sends its own gesture events for trackpad pinch.
let gestureBase = 1;
desk.addEventListener("gesturestart", (e) => {
  e.preventDefault();
  gestureBase = cam.z;
});
desk.addEventListener("gesturechange", (e) => {
  e.preventDefault();
  const g = e as unknown as { scale: number; clientX: number; clientY: number };
  const rect = desk.getBoundingClientRect();
  zoomAt((gestureBase * g.scale) / cam.z, g.clientX - rect.left, g.clientY - rect.top);
});

document.addEventListener("keydown", (e) => {
  if (!html.classList.contains("desk")) return;
  if (e.key === "Escape" && html.classList.contains("is-live")) {
    closeLive();
    return;
  }
  if (html.classList.contains("is-live") || e.altKey || e.ctrlKey || e.metaKey) return;
  if ((e.target as Element).closest("input, textarea, select, [contenteditable]")) return;
  const pan = 160 / goal.z;
  const moves: Record<string, () => void> = {
    ArrowLeft: () => go({ ...goal, x: goal.x - pan }),
    ArrowRight: () => go({ ...goal, x: goal.x + pan }),
    ArrowUp: () => go({ ...goal, y: goal.y - pan }),
    ArrowDown: () => go({ ...goal, y: goal.y + pan }),
    "+": () => zoomAt(1.4, vw / 2, vh / 2, true),
    "=": () => zoomAt(1.4, vw / 2, vh / 2, true),
    "-": () => zoomAt(1 / 1.4, vw / 2, vh / 2, true),
    "0": () => go(fit(everything())),
  };
  const move = moves[e.key];
  if (move) {
    e.preventDefault();
    move();
  }
});

// Tabbing onto something off screen brings it into view.
world.addEventListener("focusin", (e) => {
  if (!html.classList.contains("desk")) return;
  const item = (e.target as Element).closest<HTMLElement>(".item");
  if (!item) return;
  const b = boxes.get(item) as Box;
  const left = (b.x - cam.x) * cam.z + vw / 2;
  const top = (b.y - cam.y) * cam.z + vh / 2;
  const visible =
    left >= RULER && top >= TOP_BAR && left + b.w * cam.z <= vw && top + b.h * cam.z <= vh - BOTTOM_BAR && cam.z > 0.45;
  if (!visible) go(fit(b, 56));
  desk.scrollTop = 0;
  desk.scrollLeft = 0;
});

const narrow = () => vw < 700;
const homeBox = () => boxes.get(document.getElementById("home") as HTMLElement) as Box;

// On a phone a whole pile is too small to read, so jump to its first sheet instead.
function shelfView(id: string): Cam {
  if (id === "home") return fit(homeBox(), narrow() ? 16 : 48);
  if (!narrow()) return fit(groupBox(id), 48);
  const first = items.find((el) => el.dataset.group === id && el.classList.contains("sheet"));
  return fit(boxes.get(first as HTMLElement) as Box, 16);
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-go]")) {
  b.addEventListener("click", () => go(shelfView(b.dataset.go as string)));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-zoom]")) {
  b.addEventListener("click", () => zoomAt(b.dataset.zoom === "in" ? 1.5 : 1 / 1.5, vw / 2, vh / 2, true));
}
minimap.addEventListener("click", () => go(fit(everything())));

// ---------- live sites ----------

const live = document.querySelector<HTMLElement>(".live") as HTMLElement;
const frame = live.querySelector("iframe") as HTMLIFrameElement;
const liveTitle = live.querySelector(".live-title") as HTMLElement;
const liveOpen = live.querySelector<HTMLAnchorElement>(".live-open") as HTMLAnchorElement;
const liveClose = live.querySelector<HTMLButtonElement>(".live-close") as HTMLButtonElement;
let liveFrom: { cam: Cam; sheet: HTMLElement; button: HTMLButtonElement } | null = null;

function screenBox(sheet: HTMLElement): Box {
  const screen = sheet.querySelector<HTMLElement>(".screen") as HTMLElement;
  const b = boxes.get(sheet) as Box;
  return { x: b.x + screen.offsetLeft, y: b.y + screen.offsetTop, w: screen.offsetWidth, h: screen.offsetHeight };
}

function setLiveRect(top: number, left: number, width: number, height: number) {
  live.style.inset = `${top}px auto auto ${left}px`;
  live.style.width = `${width}px`;
  live.style.height = `${height}px`;
}

// The frame sits exactly over the printed screenshot. A phone screen is too small for that,
// so there it then grows to fill the screen.
function positionLive() {
  if (!liveFrom) return;
  const r = (liveFrom.sheet.querySelector(".screen") as HTMLElement).getBoundingClientRect();
  if (narrow()) setLiveRect(TOP_BAR, 8, vw - 16, vh - TOP_BAR - 8);
  else setLiveRect(r.top, r.left, r.width, r.height);
}

async function openLive(button: HTMLButtonElement) {
  const sheet = button.closest<HTMLElement>(".sheet") as HTMLElement;
  liveFrom = { cam: { ...goal }, sheet, button };
  html.classList.add("is-live");
  sheet.classList.add("lifted");
  sheet.style.rotate = "0deg";
  frame.classList.remove("ready");
  frame.src = button.dataset.live as string;
  liveTitle.textContent = button.dataset.title ?? "";
  liveOpen.href = button.dataset.live as string;
  await go(fit(screenBox(sheet), 12, TOP_BAR, 12), { stiffness: 7 });
  if (liveFrom?.sheet !== sheet) return;
  const r = (sheet.querySelector(".screen") as HTMLElement).getBoundingClientRect();
  setLiveRect(r.top, r.left, r.width, r.height);
  live.hidden = false;
  if (narrow() && !reduced.matches) {
    live.getBoundingClientRect();
    live.classList.add("growing");
    live.addEventListener("transitionend", () => live.classList.remove("growing"), { once: true });
  }
  positionLive();
  liveClose.focus({ preventScroll: true });
}

function closeLive() {
  if (!liveFrom) return;
  const { cam: back, sheet, button } = liveFrom;
  liveFrom = null;
  live.hidden = true;
  frame.removeAttribute("src");
  html.classList.remove("is-live");
  sheet.classList.remove("lifted");
  sheet.style.rotate = `${num(sheet, "tilt")}deg`;
  go(back);
  button.focus({ preventScroll: true });
}

frame.addEventListener("load", () => {
  if (frame.getAttribute("src")) frame.classList.add("ready");
});
liveClose.addEventListener("click", closeLive);
for (const b of document.querySelectorAll<HTMLButtonElement>("button.try")) {
  b.addEventListener("click", () => openLive(b));
}

// ---------- modes ----------

function remember(mode: string) {
  try {
    localStorage.setItem("0-draft:mode", mode);
  } catch {}
}
function recalled(): string | null {
  try {
    return localStorage.getItem("0-draft:mode");
  } catch {
    return null;
  }
}

function setMode(mode: "desk" | "list", intro = false) {
  if (mode === "list") closeLive();
  html.classList.toggle("desk", mode === "desk");
  html.classList.toggle("list", mode === "list");
  modeToggle.setAttribute("aria-pressed", String(mode === "list"));
  modeToggle.textContent = mode === "list" ? "Desk view" : "List view";
  if (mode === "list") {
    unplace();
    return;
  }
  place();
  measure();
  sizeRulers();
  drawMinimap();
  const overview = narrow() ? shelfView("home") : fit(everything());
  if (intro && !reduced.matches) {
    // Start nose to nose with the seal, then pull back to show the whole desk.
    const seal = document.querySelector<HTMLElement>(".home-seal") as HTMLElement;
    const h = boxes.get(document.getElementById("home") as HTMLElement) as Box;
    const face = {
      x: h.x + seal.offsetLeft + seal.offsetWidth * 0.3,
      y: h.y + seal.offsetTop + seal.offsetHeight * 0.3,
      w: seal.offsetWidth * 0.4,
      h: seal.offsetHeight * 0.4,
    };
    go(fit(face, 0, 0, 0), { instant: true });
    setTimeout(() => go(overview, { stiffness: 2.2 }), 650);
  } else {
    go(overview, { instant: true });
  }
}

modeToggle.addEventListener("click", () => {
  const next = html.classList.contains("desk") ? "list" : "desk";
  remember(next);
  setMode(next);
  if (next === "list") window.scrollTo(0, 0);
});
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-mode='list']")) {
  a.addEventListener("click", () => {
    remember("list");
    setMode("list");
  });
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  if (!html.classList.contains("desk")) return;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    vw = desk.clientWidth;
    vh = desk.clientHeight;
    sizeRulers();
    if (liveFrom) {
      go(fit(screenBox(liveFrom.sheet), 12, TOP_BAR, 12), { instant: true }).then(positionLive);
    } else apply();
  }, 80);
});

async function start() {
  await document.fonts.ready;
  dotFont = getComputedStyle(html).getPropertyValue("--font-dot").trim() || "monospace";
  setMode(recalled() === "list" ? "list" : "desk", true);
  html.classList.add("ready");
}
start();
