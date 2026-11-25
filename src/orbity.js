/* Orbity.js is inspired by tagcanvas.js
link to tagcanvas.js: https://www.goat1000.com/tagcanvas.php
Thanks to the original author for the inspiration! */

/**
 * Orbity - a lightweight, accessible 3D tag cloud for <canvas>.
 *
 * Highlights
 *  - Absolute rotation model (no drift) with inertia, easing profiles and axis locks.
 *  - Pointer Events (mouse, touch, pen) with a real click-vs-drag distinction.
 *  - Labels never overlap and never clip: they are nudged apart, kept inside the
 *    canvas, shrunk if too wide, and culled (faded out) only as a last resort.
 *  - Keyboard + screen reader support: arrow-key navigation between tags, live
 *    announcements, pause control, reduced-motion support, visible focus ring.
 *  - HiDPI aware, ResizeObserver based, fully removable listeners.
 *
 * Velocity units: radians per frame at 60fps.
 */

const DEFAULT_SHAPE = "sphere";

const SHAPES = [
  "sphere",
  "cube",
  "plane",
  "helix",
  "ring",
  "verticalRing",
  "cylinder",
  "pyramid",
  "torus",
];

const EASING_PROFILES = {
  Snappy: { easeIn: 0.2, friction: 0.9 },
  Smooth: { easeIn: 0.1, friction: 0.95 },
  Marathon: { easeIn: 0.05, friction: 0.99 },
};

const EVENT_NAMES = [
  "tagClick",
  "tagHover",
  "tagLeave",
  "tagFocus",
  "tagBlur",
  "tagsChange",
  "pause",
  "resume",
];

const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const BASE_SPIN = 0.006; // rad/frame for speed = 1
const FRAME_MS = 1000 / 60;
const CLICK_TOLERANCE = 5; // px of movement before a press becomes a drag
const MIN_HIT_MOUSE = 24; // WCAG 2.5.8 minimum target size
const MIN_HIT_TOUCH = 44;
const KEY_ROTATE_STEP = 0.15;
const MAX_HISTORY = 100;
const GRID_CELL = 64;

const SR_ONLY =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;" +
  "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;";

const DEFAULT_DESCRIPTION =
  "Interactive tag cloud. Use the arrow keys to move between tags, Enter or Space to select " +
  "the focused tag, Shift plus arrow keys to rotate, Page Up and Page Down to cycle through " +
  "every tag, Escape to clear the selection, and P to pause or resume automatic rotation.";

const num = (def, min, max, nullable = false) => ({
  type: "number",
  def,
  min,
  max,
  nullable,
});
const bool = (def) => ({ type: "boolean", def });
const str = (def) => ({ type: "string", def });
const oneOf = (def, values) => ({ type: "enum", def, values });

const OPTION_SPECS = {
  // geometry & motion
  radius: num(150, 10, 5000),
  shape: oneOf(DEFAULT_SHAPE, SHAPES),
  majorRadius: num(null, 1, 5000, true),
  minorRadius: num(null, 1, 5000, true),
  helixTurns: num(null, 0.5, 50, true),
  tilt: num(0.35, 0, 1.2),
  perspective: num(4, 1.5, 20),
  autoFit: bool(true),
  speed: num(1, 0.001, 5),
  autoSpin: bool(true),
  autoSpinAxis: oneOf("both", ["both", "x", "y"]),
  paused: bool(false),
  maxVelocity: num(0.08, 0, 1),
  // easing
  easing: num(0.1, 0.01, 0.5),
  enableEasing: bool(true),
  easingProfile: oneOf("Smooth", [...Object.keys(EASING_PROFILES), "Custom"]),
  customEaseIn: num(0.1, 0.001, 1),
  customFriction: num(0.95, 0.5, 0.9999),
  autoEasing: bool(true),
  minVelocityThreshold: num(0.0002, 0, 0.05),
  dragSensitivity: num(1, 0.05, 10),
  // input
  enableTouch: bool(true),
  enableOrientation: bool(false),
  enableDrag: bool(true),
  enableClick: bool(true),
  clickNudge: bool(true),
  pauseOnHover: bool(true),
  pauseOnFocus: bool(true),
  respectReducedMotion: bool(true),
  touchAction: str("none"),
  // appearance
  hoverEffect: bool(true),
  clickEffect: bool(true),
  hoverScale: num(1.2, 1, 3),
  hoverColor: str("#ff0"),
  hoverOpacity: num(1, 0, 1),
  customFont: str("sans-serif"),
  customFontWeight: str("normal"),
  fontSize: num(16, 6, 200),
  minFontSize: num(11, 1, 100),
  imageSize: num(32, 4, 512),
  defaultColor: str("#ffffff"),
  depthFade: bool(true),
  minOpacity: num(0.35, 0, 1),
  labelOutline: bool(true),
  outlineColor: str("rgba(0,0,0,0.65)"),
  focusColor: str("#ffc845"),
  // layout
  overlapStrategy: oneOf("nudge", ["nudge", "hide", "none"]),
  labelGap: num(6, 0, 50),
  nudgeSteps: num(3, 0, 8),
  edgePadding: num(8, 0, 200),
  // accessibility
  ariaLabel: str("3D tag cloud"),
  ariaDescription: str(DEFAULT_DESCRIPTION),
  announce: { type: "function", def: null, nullable: true },
};

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const wrapAngle = (a) => {
  a %= TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a < -Math.PI) a += TWO_PI;
  return a;
};
const smoothFactor = (rate, dt) => 1 - Math.pow(1 - rate, dt);
const shallowEqual = (a, b) => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
};
const distribute = (total, parts) => {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
};

let uidCounter = 0;

class Orbity {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas the cloud is rendered into. Size it with CSS.
   * @param {Object} [options]
   *
   * Geometry / motion
   * @param {number} [options.radius=150] - Cloud radius in px.
   * @param {string} [options.shape="sphere"] - sphere | cube | plane | helix | ring | verticalRing | cylinder | pyramid | torus
   * @param {number} [options.majorRadius] - Torus major radius (default radius * 0.7).
   * @param {number} [options.minorRadius] - Torus minor radius (default radius * 0.3).
   * @param {number} [options.helixTurns] - Helix turns (default scales with tag count).
   * @param {number} [options.tilt=0.35] - Fixed tilt (rad) for ring, verticalRing and helix so they are not edge-on.
   * @param {number} [options.perspective=4] - Camera distance as a multiple of the cloud radius.
   * @param {boolean} [options.autoFit=true] - Shrink the cloud so it fits the canvas.
   * @param {number} [options.speed=1] - Auto-spin speed multiplier (0.001 - 5).
   * @param {boolean} [options.autoSpin=true] - Rotate on its own.
   * @param {"both"|"x"|"y"} [options.autoSpinAxis="both"]
   * @param {boolean} [options.paused=false]
   * @param {number} [options.maxVelocity=0.08] - Max angular velocity (rad/frame). 0 = unlimited.
   *
   * Easing
   * @param {number} [options.easing=0.1] - How tightly rotation follows a drag (0.01 - 0.5).
   * @param {boolean} [options.enableEasing=true] - false = rotation follows the pointer 1:1.
   * @param {string} [options.easingProfile="Smooth"] - Snappy | Smooth | Marathon | Custom
   * @param {number} [options.customEaseIn=0.1] - How fast velocity eases up to the auto-spin speed.
   * @param {number} [options.customFriction=0.95] - How fast inertia decays (per frame).
   * @param {boolean} [options.autoEasing=true] - false = no inertia, velocity snaps to the auto-spin speed.
   * @param {number} [options.minVelocityThreshold=0.0002] - Velocities closer than this to the target snap to it.
   * @param {number} [options.dragSensitivity=1] - 1 = surface follows the pointer.
   *
   * Input
   * @param {boolean} [options.enableDrag=true]
   * @param {boolean} [options.enableTouch=true]
   * @param {boolean} [options.enableClick=true]
   * @param {boolean} [options.enableOrientation=false] - Tilt to rotate. iOS needs requestOrientationPermission().
   * @param {boolean} [options.clickNudge=true] - Clicking empty space gives the cloud a push.
   * @param {boolean} [options.pauseOnHover=true] - Auto-spin stops while a tag is hovered.
   * @param {boolean} [options.pauseOnFocus=true] - Auto-spin stops while a tag has keyboard focus.
   * @param {boolean} [options.respectReducedMotion=true] - Honour prefers-reduced-motion.
   * @param {string} [options.touchAction="none"] - CSS touch-action for the canvas. Use "pan-y" to keep vertical page scroll.
   *
   * Appearance
   * @param {boolean} [options.hoverEffect=true]
   * @param {boolean} [options.clickEffect=true]
   * @param {number} [options.hoverScale=1.2]
   * @param {string} [options.hoverColor="#ff0"]
   * @param {number} [options.hoverOpacity=1]
   * @param {string} [options.customFont="sans-serif"]
   * @param {string} [options.customFontWeight="normal"]
   * @param {number} [options.fontSize=16] - Default tag font size (px at the focal plane).
   * @param {number} [options.minFontSize=11] - Labels never render smaller than this.
   * @param {number} [options.imageSize=32] - Default size of image / SVG tags.
   * @param {string} [options.defaultColor="#ffffff"]
   * @param {boolean} [options.depthFade=true] - Fade tags that are further away.
   * @param {number} [options.minOpacity=0.35] - Opacity of the furthest tags.
   * @param {boolean} [options.labelOutline=true] - Halo behind text for legibility.
   * @param {string} [options.outlineColor="rgba(0,0,0,0.65)"]
   * @param {string} [options.focusColor="#ffc845"]
   *
   * Layout
   * @param {"nudge"|"hide"|"none"} [options.overlapStrategy="nudge"] - nudge: move colliding labels
   *   aside, then hide them if there is no room. hide: skip nudging. none: allow overlap.
   * @param {number} [options.labelGap=6] - Minimum space between labels (px).
   * @param {number} [options.nudgeSteps=3] - How far (in label sizes) a label may be moved.
   * @param {number} [options.edgePadding=8] - Labels stay this far inside the canvas edge.
   *
   * Accessibility
   * @param {string} [options.ariaLabel="3D tag cloud"]
   * @param {string} [options.ariaDescription] - Keyboard instructions read by screen readers.
   * @param {Function} [options.announce] - (tag, position, total) => string, spoken on focus change.
   */
  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function") {
      throw new TypeError("Orbity: first argument must be a <canvas> element.");
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("Orbity: could not get a 2D context.");

    this.settings = {};
    for (const [key, spec] of Object.entries(OPTION_SPECS)) {
      this.settings[key] = spec.def;
    }
    const easing = EASING_PROFILES[this.settings.easingProfile];
    this.settings.customEaseIn = easing.easeIn;
    this.settings.customFriction = easing.friction;

    this.tags = [];
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.center = { x: 0, y: 0 };

    this._id = `orbity-${++uidCounter}`;
    this._events = {};
    this._cleanup = [];
    this._undo = [];
    this._redo = [];
    this._imageCache = new Map();
    this._hitList = [];
    this._extent = 1;
    this._fit = 1;
    this._fontEpoch = 0;
    this._dt = 1;
    this._lastTime = null;
    this._raf = 0;
    this._resizePending = false;
    this._destroyed = false;
    this._target = null;
    this._targetRate = 1;
    this._dragging = false;
    this._drag = null;
    this._measured = { x: 0, y: 0 };
    this._pointer = null;
    this._hoveredTag = null;
    this._focusedTag = null;
    this._orient = { x: 0, y: 0 };
    this._orientGranted = false;
    this._orientListening = false;
    this._liveToggle = false;
    this._host = null;
    this._descEl = null;
    this._liveEl = null;
    this._fallbackList = null;
    this._pinnedSize = false;
    this._userAriaLabel =
      options.ariaLabel === undefined && canvas.hasAttribute("aria-label");
    this._frameBound = this._frame.bind(this);

    this._setOptions(options, true);
    this._init();
  }

  /* ------------------------------------------------------------------ *
   * Options
   * ------------------------------------------------------------------ */

  _coerce(key, spec, value) {
    const bad = (msg) => ({ ok: false, message: `Orbity: invalid option "${key}": ${msg}` });
    if (value === null || value === undefined) {
      return spec.nullable ? { ok: true, value: null } : bad("value is required.");
    }
    switch (spec.type) {
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return bad("must be a finite number.");
        return { ok: true, value: clamp(value, spec.min, spec.max) };
      case "boolean":
        return typeof value === "boolean" ? { ok: true, value } : bad("must be a boolean.");
      case "string":
        return typeof value === "string" ? { ok: true, value } : bad("must be a string.");
      case "enum":
        return spec.values.includes(value)
          ? { ok: true, value }
          : bad(`must be one of ${spec.values.join(", ")}.`);
      case "function":
        return typeof value === "function" ? { ok: true, value } : bad("must be a function.");
      default:
        return bad("unsupported option type.");
    }
  }

  /** Validates and stores options. Returns the set of keys that changed. */
  _setOptions(options, initial = false) {
    const s = this.settings;
    const changed = {};
    const keys = Object.keys(options || {});
    const ordered = keys.includes("easingProfile")
      ? ["easingProfile", ...keys.filter((k) => k !== "easingProfile")]
      : keys;
    let pausedValue;

    for (const key of ordered) {
      const spec = OPTION_SPECS[key];
      if (!spec) {
        console.warn(`Orbity: unknown option "${key}" ignored.`);
        continue;
      }
      const res = this._coerce(key, spec, options[key]);
      if (!res.ok) {
        console.warn(res.message);
        continue;
      }
      if (key === "paused") {
        pausedValue = res.value;
        continue;
      }
      if (key === "easingProfile" && res.value !== "Custom") {
        const p = EASING_PROFILES[res.value];
        s.customEaseIn = p.easeIn;
        s.customFriction = p.friction;
        changed.customEaseIn = changed.customFriction = true;
      }
      if (s[key] !== res.value) changed[key] = true;
      s[key] = res.value;
    }

    const explicitCustom =
      options && (options.customEaseIn !== undefined || options.customFriction !== undefined);
    if (explicitCustom && !(options.easingProfile && options.easingProfile !== "Custom")) {
      s.easingProfile = "Custom";
    }

    if (pausedValue !== undefined) {
      if (initial) s.paused = pausedValue;
      else this._setPaused(pausedValue);
    }
    return changed;
  }

  /**
   * Updates configuration. Invalid values are rejected with a console warning and the
   * previous value is kept.
   * @param {Object} newOptions
   */
  updateOptions(newOptions) {
    if (this._destroyed || !newOptions) return;
    const changed = this._setOptions(newOptions);
    this._applyChanges(changed);
  }

  _applyChanges(changed) {
    const geometry = ["shape", "radius", "majorRadius", "minorRadius", "helixTurns"];
    if (geometry.some((k) => changed[k])) this._positionTags();
    if (changed.shape || changed.tilt) this._applyLocks();
    if (changed.customFont || changed.customFontWeight) this._fontEpoch++;
    if (changed.enableOrientation) this._syncOrientation();
    if (changed.touchAction) this._applyStyles();
    if (changed.ariaLabel || changed.ariaDescription) this._applyAria();
    if (changed.enableDrag && !this.settings.enableDrag && this._drag) this._cancelDrag();
    if (changed.enableTouch && !this.settings.enableTouch && this._drag && this._drag.type === "touch") {
      this._cancelDrag();
    }
    this._resizePending = true;
    this._schedule();
  }

  /**
   * Selects an easing profile ("Snappy", "Smooth", "Marathon" or "Custom").
   * @param {string} profileName
   */
  setEasingProfile(profileName) {
    if (profileName !== "Custom" && !EASING_PROFILES[profileName]) {
      console.error(`Orbity: invalid easing profile "${profileName}".`);
      return;
    }
    this.updateOptions({ easingProfile: profileName });
  }

  /**
   * @param {boolean} enabled - false disables inertia; velocity snaps to the auto-spin speed.
   */
  toggleAutoEasing(enabled) {
    this.updateOptions({ autoEasing: !!enabled });
  }

  /* ------------------------------------------------------------------ *
   * Setup / teardown
   * ------------------------------------------------------------------ */

  _listen(target, type, handler, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, handler, opts);
    this._cleanup.push(() => target.removeEventListener(type, handler, opts));
  }

  _init() {
    const c = this.canvas;
    this._savedAttrs = {};
    for (const a of ["role", "aria-label", "aria-describedby", "aria-keyshortcuts", "tabindex"]) {
      this._savedAttrs[a] = c.getAttribute(a);
    }
    this._savedStyle = {
      cursor: c.style.cursor,
      touchAction: c.style.touchAction,
      width: c.style.width,
      height: c.style.height,
    };
    this._mq =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    this._applyStyles();
    this._applyAria();

    this._listen(c, "pointerdown", (e) => this._onPointerDown(e));
    this._listen(c, "pointermove", (e) => this._onPointerMove(e));
    this._listen(c, "pointerup", (e) => this._onPointerUp(e));
    this._listen(c, "pointercancel", (e) => this._onPointerUp(e));
    this._listen(c, "pointerleave", (e) => this._onPointerLeave(e));
    this._listen(c, "keydown", (e) => this._onKeyDown(e));
    this._listen(c, "blur", () => this._setFocus(null));
    this._listen(c, "focus", () => this._schedule());

    const requestResize = () => {
      this._resizePending = true;
      this._schedule();
    };
    this._listen(window, "resize", requestResize);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(requestResize);
      ro.observe(c);
      this._cleanup.push(() => ro.disconnect());
    }
    if (this._mq) {
      const onMotion = () => {
        this._schedule();
      };
      if (this._mq.addEventListener) {
        this._mq.addEventListener("change", onMotion);
        this._cleanup.push(() => this._mq.removeEventListener("change", onMotion));
      } else if (this._mq.addListener) {
        this._mq.addListener(onMotion);
        this._cleanup.push(() => this._mq.removeListener(onMotion));
      }
    }
    if (typeof document !== "undefined" && document.fonts && document.fonts.addEventListener) {
      const onFonts = () => {
        this._fontEpoch++;
        this._schedule();
      };
      document.fonts.addEventListener("loadingdone", onFonts);
      this._cleanup.push(() => document.fonts.removeEventListener("loadingdone", onFonts));
    }

    this._syncOrientation();
    this._resize();
    this._schedule();
  }

  _applyStyles() {
    const c = this.canvas;
    c.style.touchAction = this.settings.enableTouch ? this.settings.touchAction : "";
    this._updateCursor(true);
  }

  _applyAria() {
    const c = this.canvas;
    const s = this.settings;
    if (!c.hasAttribute("role")) c.setAttribute("role", "application");
    if (!c.hasAttribute("tabindex")) c.setAttribute("tabindex", "0");
    if (!this._userAriaLabel) c.setAttribute("aria-label", s.ariaLabel);
    c.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space Escape P");
    const saved = this._savedAttrs["aria-describedby"];
    c.setAttribute("aria-describedby", `${saved ? saved + " " : ""}${this._id}-desc`);
    if (this._descEl) this._descEl.textContent = s.ariaDescription;
  }

  /** Creates the visually hidden description + live region next to the canvas. */
  _ensureHost() {
    if (this._host || !this.canvas.parentNode) return;
    const doc = this.canvas.ownerDocument || document;
    const host = doc.createElement("div");
    host.style.cssText = SR_ONLY;
    const desc = doc.createElement("div");
    desc.id = `${this._id}-desc`;
    desc.textContent = this.settings.ariaDescription;
    const live = doc.createElement("div");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    host.appendChild(desc);
    host.appendChild(live);
    this.canvas.parentNode.insertBefore(host, this.canvas.nextSibling);
    this._host = host;
    this._descEl = desc;
    this._liveEl = live;
  }

  _announce(message) {
    if (!message) return;
    this._ensureHost();
    if (!this._liveEl) return;
    this._liveToggle = !this._liveToggle;
    // Alternate a zero-width space so identical messages are announced again.
    this._liveEl.textContent = message + (this._liveToggle ? "\u200b" : "");
  }

  /** Rebuilds the plain-text fallback list inside the canvas element. */
  _syncFallback() {
    const c = this.canvas;
    if (!c.ownerDocument && typeof document === "undefined") return;
    const doc = c.ownerDocument || document;
    if (this._fallbackList && this._fallbackList.parentNode === c) {
      c.removeChild(this._fallbackList);
    }
    const ul = doc.createElement("ul");
    this.tags.forEach((tag) => {
      const li = doc.createElement("li");
      li.textContent = this._tagName(tag);
      ul.appendChild(li);
    });
    c.appendChild(ul);
    this._fallbackList = ul;
  }

  /**
   * Destroys the instance: stops animation, removes every listener and DOM node it added,
   * releases image resources and restores the canvas attributes.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._raf && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._cleanup.forEach((fn) => fn());
    this._cleanup = [];
    if (this._orientListening) {
      window.removeEventListener("deviceorientation", this._onOrientationBound);
      this._orientListening = false;
    }
    const c = this.canvas;
    try {
      if (this._drag) c.releasePointerCapture(this._drag.id);
    } catch (e) {
      /* pointer already released */
    }
    this._drag = null;
    this.tags = [];
    this._imageCache.forEach((entry) => entry.url && URL.revokeObjectURL(entry.url));
    this._imageCache.clear();
    if (this._host && this._host.parentNode) this._host.parentNode.removeChild(this._host);
    if (this._fallbackList && this._fallbackList.parentNode === c) c.removeChild(this._fallbackList);
    this._host = this._liveEl = this._descEl = this._fallbackList = null;
    for (const [attr, value] of Object.entries(this._savedAttrs || {})) {
      if (value === null) c.removeAttribute(attr);
      else c.setAttribute(attr, value);
    }
    if (this._savedStyle) {
      c.style.cursor = this._savedStyle.cursor;
      c.style.touchAction = this._savedStyle.touchAction;
      if (this._pinnedSize) {
        c.style.width = this._savedStyle.width;
        c.style.height = this._savedStyle.height;
      }
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, c.width, c.height);
    this._events = {};
  }

  /* ------------------------------------------------------------------ *
   * Sizing
   * ------------------------------------------------------------------ */

  _resize() {
    const c = this.canvas;
    this._ensureHost();
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;

    // A canvas sized only by its width/height attributes would grow every time we
    // multiply its backing store by the pixel ratio, so pin its CSS size once.
    if (!this._pinnedSize && !c.style.width && !c.style.height && typeof getComputedStyle === "function") {
      const cs = getComputedStyle(c);
      if (cs && cs.width === `${c.width}px` && cs.height === `${c.height}px`) {
        c.style.width = cs.width;
        c.style.height = cs.height;
        this._pinnedSize = true;
      }
    }

    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    if (!cssW || !cssH) {
      this.width = this.height = 0;
      return;
    }
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.width = cssW;
    this.height = cssH;
    this.center = { x: cssW / 2, y: cssH / 2 };
  }

  /* ------------------------------------------------------------------ *
   * Tags
   * ------------------------------------------------------------------ */

  _normalize(raw) {
    if (!raw || typeof raw !== "object") {
      console.error("Orbity: a tag must be an object.");
      return null;
    }
    const hasText = typeof raw.text === "string" && raw.text.trim() !== "";
    const hasImage = typeof raw.imageUrl === "string" && raw.imageUrl !== "";
    const hasSvg = typeof raw.svg === "string" && raw.svg !== "";
    if (!hasText && !hasImage && !hasSvg) {
      console.error("Orbity: a tag needs 'text', 'imageUrl' or 'svg'.");
      return null;
    }
    if (raw.color !== undefined && (typeof raw.color !== "string" || !raw.color)) {
      console.error("Orbity: tag 'color' must be a CSS color string.");
      return null;
    }
    for (const k of ["fontSize", "size"]) {
      if (raw[k] !== undefined && (typeof raw[k] !== "number" || !(raw[k] > 0))) {
        console.error(`Orbity: tag '${k}' must be a positive number.`);
        return null;
      }
    }
    return { ...raw, color: raw.color || this.settings.defaultColor };
  }

  _createTag(data) {
    return {
      data,
      index: 0,
      bx: 0,
      by: 0,
      bz: 0,
      x: 0,
      y: 0,
      z: 0,
      _visual: null,
      _visualKey: null,
      _w100: 0,
      _wKey: "",
      _hover: 0,
      _pulse: 0,
      _vis: 0,
      _off: { x: 0, y: 0 },
      _offT: { x: 0, y: 0 },
    };
  }

  _publicTag(tag) {
    return { ...tag.data, index: tag.index };
  }

  _tagName(tag) {
    const d = tag.data;
    return d.ariaLabel || d.alt || d.text || `Tag ${tag.index + 1}`;
  }

  _afterTagsChanged() {
    this.tags.forEach((t, i) => (t.index = i));
    if (this._hoveredTag && !this.tags.includes(this._hoveredTag)) this._hoveredTag = null;
    if (this._focusedTag && !this.tags.includes(this._focusedTag)) this._focusedTag = null;
    this._positionTags();
    this._pruneImageCache();
    this._syncFallback();
    this._emit("tagsChange", this.getTags());
    this._schedule();
  }

  _snapshot() {
    return this.tags.map((t) => ({ ...t.data }));
  }

  _record() {
    this._undo.push(this._snapshot());
    if (this._undo.length > MAX_HISTORY) this._undo.shift();
    this._redo = [];
  }

  _restore(snapshot) {
    const focusedIndex = this._focusedTag ? this._focusedTag.index : null;
    const old = this.tags;
    this.tags = snapshot.map((data, i) => {
      if (old[i] && shallowEqual(old[i].data, data)) return old[i];
      return this._createTag({ ...data });
    });
    this._hoveredTag = null;
    this._focusedTag =
      focusedIndex !== null && focusedIndex < this.tags.length ? this.tags[focusedIndex] : null;
    this._afterTagsChanged();
  }

  /**
   * Replaces all tags. Clears undo history.
   * @param {Array<Object>} dataArray - Tag objects:
   *   text {string}, color {string}, fontSize {number},
   *   imageUrl {string} | svg {string} (with `size` {number}),
   *   alt / ariaLabel {string} (accessible name, recommended for image and SVG tags).
   *   Any other fields are kept and handed back in events.
   */
  setTags(dataArray) {
    if (this._destroyed) return;
    if (!Array.isArray(dataArray)) {
      console.error("Orbity: setTags expects an array.");
      return;
    }
    this.tags = [];
    dataArray.forEach((raw) => {
      const data = this._normalize(raw);
      if (data) this.tags.push(this._createTag(data));
    });
    this._undo = [];
    this._redo = [];
    this._hoveredTag = null;
    this._focusedTag = null;
    this._afterTagsChanged();
  }

  /** @returns {Array<Object>} Copies of the tag data, in order. */
  getTags() {
    return this.tags.map((t) => this._publicTag(t));
  }

  /**
   * Adds a tag. Undoable.
   * @param {Object} tagData
   * @returns {boolean} true if the tag was valid and added.
   */
  addTag(tagData) {
    const data = this._normalize(tagData);
    if (!data || this._destroyed) return false;
    this._record();
    this.tags.push(this._createTag(data));
    this._afterTagsChanged();
    return true;
  }

  /**
   * Removes a tag by index. Undoable.
   * @param {number} index
   * @returns {boolean}
   */
  removeTag(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.tags.length) return false;
    this._record();
    this.tags.splice(index, 1);
    this._afterTagsChanged();
    return true;
  }

  /**
   * Updates a tag's data by index. Undoable.
   * @param {number} index
   * @param {Object} data - Fields to merge.
   * @returns {boolean}
   */
  updateTag(index, data) {
    const tag = this.tags[index];
    if (!tag) {
      console.error(`Orbity: tag at index ${index} does not exist.`);
      return false;
    }
    const merged = this._normalize({ ...tag.data, ...data });
    if (!merged) return false;
    this._record();
    tag.data = merged;
    tag._visualKey = null;
    tag._w100 = 0;
    this._afterTagsChanged();
    return true;
  }

  /** Removes every tag. Undoable. */
  clearTags() {
    if (!this.tags.length) return;
    this._record();
    this.tags = [];
    this._afterTagsChanged();
  }

  get canUndo() {
    return this._undo.length > 0;
  }

  get canRedo() {
    return this._redo.length > 0;
  }

  /** Undoes the last tag change. */
  undo() {
    if (!this._undo.length) return;
    this._redo.push(this._snapshot());
    this._restore(this._undo.pop());
  }

  /** Redoes the last undone tag change. */
  redo() {
    if (!this._redo.length) return;
    this._undo.push(this._snapshot());
    this._restore(this._redo.pop());
  }

  /* ------------------------------------------------------------------ *
   * Images / SVG
   * ------------------------------------------------------------------ */

  _getVisual(tag) {
    const d = tag.data;
    if (!d.imageUrl && !d.svg) return null;
    const key = d.imageUrl ? `u:${d.imageUrl}` : `s:${d.svg}`;
    if (tag._visualKey === key) return tag._visual;
    tag._visualKey = key;
    let entry = this._imageCache.get(key);
    if (!entry) {
      const img = new window.Image();
      entry = { img, state: "loading", url: null };
      img.onload = () => {
        entry.state = "ready";
        this._schedule();
      };
      img.onerror = () => {
        entry.state = "error";
        console.warn("Orbity: failed to load tag image.", d.imageUrl || "(inline svg)");
        this._schedule();
      };
      if (d.imageUrl) {
        img.src = d.imageUrl;
      } else {
        entry.url = URL.createObjectURL(new Blob([d.svg], { type: "image/svg+xml" }));
        img.src = entry.url;
      }
      this._imageCache.set(key, entry);
    }
    tag._visual = entry;
    return entry;
  }

  _pruneImageCache() {
    const used = new Set();
    this.tags.forEach((t) => {
      if (t.data.imageUrl) used.add(`u:${t.data.imageUrl}`);
      else if (t.data.svg) used.add(`s:${t.data.svg}`);
    });
    for (const [key, entry] of this._imageCache) {
      if (!used.has(key)) {
        if (entry.url) URL.revokeObjectURL(entry.url);
        this._imageCache.delete(key);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Geometry
   * ------------------------------------------------------------------ */

  _locks() {
    const { shape, tilt } = this.settings;
    if (shape === "ring") return { x: true, y: false, fx: tilt, fy: 0 };
    if (shape === "helix") return { x: true, y: false, fx: tilt * 0.5, fy: 0 };
    if (shape === "verticalRing") return { x: false, y: true, fx: 0, fy: tilt };
    return { x: false, y: false, fx: 0, fy: 0 };
  }

  _applyLocks() {
    const l = this._locks();
    if (l.x) {
      this.rotation.x = l.fx;
      this.velocity.x = 0;
      if (this._target) this._target.x = l.fx;
    }
    if (l.y) {
      this.rotation.y = l.fy;
      this.velocity.y = 0;
      if (this._target) this._target.y = l.fy;
    }
  }

  _positionTags() {
    const tags = this.tags;
    const N = tags.length;
    const s = this.settings;
    const R = s.radius;
    this._extent = 1;
    if (!N) return;

    const set = (i, x, y, z) => {
      tags[i].bx = x;
      tags[i].by = y;
      tags[i].bz = z;
    };

    switch (s.shape) {
      case "torus": {
        const M = s.majorRadius || R * 0.7;
        const m = s.minorRadius || R * 0.3;
        const majorSteps = Math.max(3, Math.ceil(Math.sqrt(N * 2)));
        const minorSteps = Math.max(1, Math.ceil(N / majorSteps));
        for (let i = 0; i < N; i++) {
          const a = i % majorSteps;
          const b = Math.floor(i / majorSteps);
          const v = (a / majorSteps) * TWO_PI + (b % 2) * (Math.PI / majorSteps);
          const u = (b / minorSteps) * TWO_PI;
          set(i, (M + m * Math.cos(u)) * Math.cos(v), (M + m * Math.cos(u)) * Math.sin(v), m * Math.sin(u));
        }
        break;
      }
      case "cube": {
        const half = R * 0.7;
        const counts = distribute(N, 6);
        let i = 0;
        for (let face = 0; face < 6; face++) {
          const c = counts[face];
          const g = Math.max(1, Math.ceil(Math.sqrt(c)));
          const cells = g * g;
          for (let k = 0; k < c; k++) {
            const cell = Math.floor(((k + 0.5) * cells) / c);
            const a = (((cell % g) + 0.5) / g * 2 - 1) * half;
            const b = ((Math.floor(cell / g) + 0.5) / g * 2 - 1) * half;
            if (face === 0) set(i, half, a, b);
            else if (face === 1) set(i, -half, a, b);
            else if (face === 2) set(i, a, half, b);
            else if (face === 3) set(i, a, -half, b);
            else if (face === 4) set(i, a, b, half);
            else set(i, a, b, -half);
            i++;
          }
        }
        break;
      }
      case "pyramid": {
        const L = Math.max(2, Math.ceil(Math.sqrt(N / 1.5)));
        const total = (L * (L + 1)) / 2;
        let i = 0;
        let cum = 0;
        for (let k = 0; k < L; k++) {
          const start = Math.round((N * cum) / total);
          cum += k + 1;
          const end = k === L - 1 ? N : Math.round((N * cum) / total);
          const count = end - start;
          const r = (R * (k + 1)) / L;
          const y = -R + (2 * R * (k + 0.5)) / L;
          for (let j = 0; j < count; j++, i++) {
            const angle = ((j + (k % 2) * 0.5) / count) * TWO_PI;
            set(i, r * Math.cos(angle), y, r * Math.sin(angle));
          }
        }
        break;
      }
      case "helix": {
        const turns = s.helixTurns || Math.max(1, Math.round(N / 8));
        for (let i = 0; i < N; i++) {
          const t = N > 1 ? i / (N - 1) : 0.5;
          const angle = t * TWO_PI * turns;
          set(i, R * Math.cos(angle), (t * 2 - 1) * R * 0.9, R * Math.sin(angle));
        }
        break;
      }
      case "ring":
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TWO_PI;
          set(i, R * Math.cos(a), 0, R * Math.sin(a));
        }
        break;
      case "verticalRing":
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TWO_PI;
          set(i, 0, R * Math.sin(a), R * Math.cos(a));
        }
        break;
      case "cylinder": {
        const perRing = clamp(Math.round(Math.sqrt(N * 2)), 3, 16);
        const rows = Math.ceil(N / perRing);
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / perRing);
          const col = i % perRing;
          const angle = ((col + (row % 2) * 0.5) / perRing) * TWO_PI;
          const y = rows > 1 ? (row / (rows - 1) * 2 - 1) * R * 0.9 : 0;
          set(i, R * Math.cos(angle), y, R * Math.sin(angle));
        }
        break;
      }
      case "plane": {
        const cols = Math.max(1, Math.ceil(Math.sqrt(N * 1.5)));
        const rows = Math.ceil(N / cols);
        for (let i = 0; i < N; i++) {
          const row = Math.floor(i / cols);
          const inRow = row === rows - 1 ? N - row * cols : cols;
          const col = i % cols;
          const x = inRow > 1 ? (col / (inRow - 1) * 2 - 1) * R : 0;
          const y = rows > 1 ? (row / (rows - 1) * 2 - 1) * R * 0.7 : 0;
          set(i, x, y, 0);
        }
        break;
      }
      case "sphere":
      default:
        for (let i = 0; i < N; i++) {
          const inclination = Math.acos(1 - (2 * (i + 0.5)) / N);
          const azimuth = GOLDEN_ANGLE * i;
          set(
            i,
            R * Math.sin(inclination) * Math.cos(azimuth),
            R * Math.cos(inclination),
            R * Math.sin(inclination) * Math.sin(azimuth)
          );
        }
        break;
    }

    let extent = 0;
    tags.forEach((t) => (extent = Math.max(extent, Math.hypot(t.bx, t.by, t.bz))));
    this._extent = Math.max(extent, 1);
  }

  /* ------------------------------------------------------------------ *
   * Animation loop
   * ------------------------------------------------------------------ */

  _schedule() {
    if (this._raf || this._destroyed || typeof requestAnimationFrame === "undefined") return;
    this._raf = requestAnimationFrame(this._frameBound);
  }

  _reduced() {
    return !!(this.settings.respectReducedMotion && this._mq && this._mq.matches);
  }

  _frame(now) {
    this._raf = 0;
    if (this._destroyed) return;
    if (this._resizePending) {
      this._resizePending = false;
      this._resize();
    }
    const dt = this._lastTime === null ? 1 : clamp((now - this._lastTime) / FRAME_MS, 0, 3);
    this._lastTime = now;
    this._dt = dt;

    const moving = this._step(dt);
    const animating = this._render();
    this._updateHover();

    if (moving || animating) this._schedule();
    else this._lastTime = null;
  }

  _targetVelocity() {
    const s = this.settings;
    const lock = this._locks();
    let bx = 0;
    let by = 0;
    if (this._reduced()) return { x: 0, y: 0 };

    const spinOn =
      s.autoSpin &&
      !this._dragging &&
      !(s.pauseOnHover && this._hoveredTag) &&
      !(s.pauseOnFocus && this._focusedTag);
    if (spinOn) {
      const base = s.speed * BASE_SPIN;
      let ux = s.autoSpinAxis !== "y" && !lock.x;
      let uy = s.autoSpinAxis !== "x" && !lock.y;
      if (!ux && !uy) {
        ux = !lock.x;
        uy = !lock.y;
      }
      if (uy) by = base;
      if (ux) bx = uy ? base * 0.5 : base;
    }
    if (s.enableOrientation) {
      if (!lock.x) bx += this._orient.x;
      if (!lock.y) by += this._orient.y;
    }
    return { x: bx, y: by };
  }

  /** Advances rotation. Returns true while motion needs more frames. */
  _step(dt) {
    const s = this.settings;
    const rot = this.rotation;
    const prevX = rot.x;
    const prevY = rot.y;
    let needsFrames = false;

    if (this._target) {
      const f = this._targetRate >= 1 ? 1 : smoothFactor(this._targetRate, dt);
      const ex = this._target.x - rot.x;
      const ey = this._target.y - rot.y;
      rot.x += ex * f;
      rot.y += ey * f;
      if (!this._dragging && Math.abs(ex * (1 - f)) + Math.abs(ey * (1 - f)) < 1e-4) {
        rot.x = this._target.x;
        rot.y = this._target.y;
        this._target = null;
      } else {
        needsFrames = true;
      }
    } else if (!s.paused && !this._dragging) {
      const t = this._targetVelocity();
      for (const a of ["x", "y"]) {
        let v = this.velocity[a];
        const tv = t[a];
        if (!s.autoEasing) {
          v = tv;
        } else {
          const slowing = Math.abs(v) > Math.abs(tv) || v * tv < 0;
          if (slowing) v = tv + (v - tv) * Math.pow(s.customFriction, dt);
          else v += (tv - v) * smoothFactor(s.customEaseIn, dt);
          if (Math.abs(v - tv) < s.minVelocityThreshold) v = tv;
        }
        if (s.maxVelocity > 0) v = clamp(v, -s.maxVelocity, s.maxVelocity);
        this.velocity[a] = v;
        rot[a] += v * dt;
        if (v !== 0) needsFrames = true;
      }
    }

    this._applyLocks();

    if (this._dragging) {
      // Track real motion so releasing the pointer hands over a natural inertia.
      this._measured.x = this._measured.x * 0.6 + ((rot.x - prevX) / dt) * 0.4;
      this._measured.y = this._measured.y * 0.6 + ((rot.y - prevY) / dt) * 0.4;
      needsFrames = true;
    }

    if (!this._target && !this._dragging) {
      rot.x = wrapAngle(rot.x);
      rot.y = wrapAngle(rot.y);
    }
    return needsFrames;
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  _measureText(tag, fontKey) {
    if (tag._wKey !== fontKey || !tag._w100) {
      const s = this.settings;
      this.ctx.font = `${s.customFontWeight} 100px ${s.customFont}`;
      tag._w100 = this.ctx.measureText(tag.data.text).width;
      tag._wKey = fontKey;
    }
    return tag._w100;
  }

  _measureItem(tag, persp, scale, fontKey) {
    const s = this.settings;
    const d = tag.data;
    const maxW = Math.max(20, this.width - 2 * s.edgePadding);
    const visual = this._getVisual(tag);

    if (visual && visual.state === "ready") {
      const img = visual.img;
      const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
      let ih = Math.max((d.size || d.fontSize || s.imageSize) * persp * scale, s.minFontSize * 1.2);
      let iw = ih * ar;
      if (iw > maxW) {
        ih *= maxW / iw;
        iw = maxW;
      }
      return { tag, kind: "image", w: iw, h: ih, img };
    }
    if (typeof d.text === "string" && d.text) {
      const w100 = this._measureText(tag, fontKey);
      let fs = Math.max(s.minFontSize, (d.fontSize || s.fontSize) * persp * scale);
      let tw = (w100 * fs) / 100;
      if (tw > maxW) {
        fs *= maxW / tw;
        tw = maxW;
      }
      return { tag, kind: "text", w: tw, h: fs * 1.2, fs };
    }
    return null;
  }

  /** Draws one frame. Returns true while label animations are still settling. */
  _render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const s = this.settings;
    if (!w || !h) {
      this._hitList = [];
      return false;
    }
    ctx.clearRect(0, 0, w, h);
    const tags = this.tags;
    if (!tags.length) {
      this._hitList = [];
      return false;
    }

    const dt = this._dt;
    const reduced = this._reduced();
    const extent = this._extent;
    const f = Math.max(extent * s.perspective, 1);
    const nearScale = f / Math.max(f - extent, f * 0.01);
    let fit = 1;
    if (s.autoFit) {
      const avail = Math.min(w, h) / 2 - s.edgePadding;
      fit = clamp(avail / (extent * nearScale), 0.1, 1);
    }
    this._fit = fit;

    const cx = w / 2;
    const cy = h / 2;
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);
    const fontKey = `${s.customFontWeight}|${s.customFont}|${this._fontEpoch}`;
    const hoverStep = reduced ? 1 : smoothFactor(0.25, dt);
    let animating = false;

    // 1. rotate, project, measure
    const items = [];
    for (const tag of tags) {
      const emphasised = tag === this._hoveredTag || tag === this._focusedTag ? 1 : 0;
      tag._hover += (emphasised - tag._hover) * hoverStep;
      if (Math.abs(emphasised - tag._hover) < 0.01) tag._hover = emphasised;
      else animating = true;
      if (tag._pulse > 0) {
        tag._pulse *= Math.pow(0.88, dt);
        if (tag._pulse < 0.01 || reduced) tag._pulse = 0;
        else animating = true;
      }

      const x1 = tag.bx * cosY + tag.bz * sinY;
      const z1 = -tag.bx * sinY + tag.bz * cosY;
      const y2 = tag.by * cosX - z1 * sinX;
      const z2 = tag.by * sinX + z1 * cosX;
      tag.x = x1;
      tag.y = y2;
      tag.z = z2;

      const persp = f / (f + z2);
      const scale =
        1 + (s.hoverEffect ? (s.hoverScale - 1) * tag._hover : 0) + (s.clickEffect ? 0.12 * tag._pulse : 0);
      const item = this._measureItem(tag, persp, scale, fontKey);
      if (!item) continue;
      item.px = cx + x1 * persp * fit;
      item.py = cy + y2 * persp * fit;
      item.z = z2;
      item.depth = clamp((z2 + extent) / (2 * extent), 0, 1);
      item.pri = tag === this._focusedTag ? 0 : tag === this._hoveredTag ? 1 : 2;
      items.push(item);
    }

    // 2. collision-free placement (nearest / focused first)
    const pad = s.edgePadding;
    const halfGap = s.labelGap / 2;
    const strategy = s.overlapStrategy;
    const grid = new Map();
    const cellKey = (i, j) => (i + 2) * 4096 + (j + 2);
    const boxOf = (x, y, bw, bh) => ({
      l: x - bw / 2 - halfGap,
      r: x + bw / 2 + halfGap,
      t: y - bh / 2 - halfGap,
      b: y + bh / 2 + halfGap,
    });
    const forCells = (b, fn) => {
      const i0 = Math.floor(b.l / GRID_CELL);
      const i1 = Math.floor(b.r / GRID_CELL);
      const j0 = Math.floor(b.t / GRID_CELL);
      const j1 = Math.floor(b.b / GRID_CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (fn(cellKey(i, j))) return true;
      return false;
    };
    const collides = (b) =>
      forCells(b, (key) => {
        const list = grid.get(key);
        if (!list) return false;
        for (const o of list) {
          if (b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t) return true;
        }
        return false;
      });
    const insert = (b) =>
      forCells(b, (key) => {
        const list = grid.get(key);
        if (list) list.push(b);
        else grid.set(key, [b]);
        return false;
      });
    const place = (it, dx, dy) => {
      const minX = pad + it.w / 2;
      const maxX = w - pad - it.w / 2;
      const minY = pad + it.h / 2;
      const maxY = h - pad - it.h / 2;
      const x = minX > maxX ? cx : clamp(it.px + dx, minX, maxX);
      const y = minY > maxY ? cy : clamp(it.py + dy, minY, maxY);
      return { x, y };
    };

    const order = items.slice().sort((a, b) => a.pri - b.pri || a.z - b.z);
    for (const it of order) {
      let chosen = null;
      // A hovered / focused label keeps the spot it already has. Otherwise promoting it to
      // first priority would snap it back to its natural position, out from under the cursor.
      const prevOff = it.tag._offT;
      const sticky = it.pri < 2 && strategy !== "none" && (prevOff.x || prevOff.y);
      let pos = place(it, sticky ? prevOff.x : 0, sticky ? prevOff.y : 0);
      let box = boxOf(pos.x, pos.y, it.w, it.h);
      if (strategy === "none" || !collides(box)) {
        chosen = sticky ? { dx: prevOff.x, dy: prevOff.y, box } : { dx: 0, dy: 0, box };
      } else if (strategy === "nudge" && s.nudgeSteps > 0) {
        const stepY = it.h + s.labelGap;
        const stepX = it.w * 0.5 + s.labelGap;
        const cands = [];
        for (let k = 1; k <= s.nudgeSteps; k++) {
          cands.push([0, k * stepY], [0, -k * stepY], [k * stepX, 0], [-k * stepX, 0]);
          cands.push([k * stepX, k * stepY], [-k * stepX, k * stepY], [k * stepX, -k * stepY], [-k * stepX, -k * stepY]);
        }
        cands.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
        const prev = it.tag._offT;
        if (prev.x || prev.y) cands.unshift([prev.x, prev.y]);
        for (const [dx, dy] of cands) {
          pos = place(it, dx, dy);
          box = boxOf(pos.x, pos.y, it.w, it.h);
          if (!collides(box)) {
            chosen = { dx, dy, box };
            break;
          }
        }
      }
      it.placed = !!chosen;
      if (chosen) {
        insert(chosen.box);
        it.tag._offT = { x: chosen.dx, y: chosen.dy };
      }
    }

    // 3. smooth offsets / visibility, then draw far -> near
    // Offsets snap (never glide): two labels gliding toward collision-free spots can cross
    // each other mid-way, which is exactly the overlap this layout pass exists to prevent.
    const moveStep = 1;
    const fadeStep = reduced ? 1 : smoothFactor(0.5, dt);
    for (const it of items) {
      const tag = it.tag;
      const target = it.placed ? 1 : 0;
      tag._vis += (target - tag._vis) * fadeStep;
      if (Math.abs(target - tag._vis) < 0.02) tag._vis = target;
      else animating = true;
      if (it.placed) {
        tag._off.x += (tag._offT.x - tag._off.x) * moveStep;
        tag._off.y += (tag._offT.y - tag._off.y) * moveStep;
        if (Math.abs(tag._offT.x - tag._off.x) + Math.abs(tag._offT.y - tag._off.y) < 0.3) {
          tag._off.x = tag._offT.x;
          tag._off.y = tag._offT.y;
        } else {
          animating = true;
        }
      }
    }

    const drawList = items.filter((it) => it.tag._vis > 0.02).sort((a, b) => b.z - a.z);
    const hits = [];
    const hoverOpacity = s.hoverEffect ? s.hoverOpacity : 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    for (const it of drawList) {
      const tag = it.tag;
      const pos = place(it, tag._off.x, tag._off.y);
      it.cx = pos.x;
      it.cy = pos.y;

      const depthAlpha = s.depthFade ? 1 - (1 - s.minOpacity) * it.depth : 1;
      const alpha = (depthAlpha + (hoverOpacity - depthAlpha) * tag._hover) * tag._vis;
      ctx.globalAlpha = clamp(alpha, 0, 1);

      if (it.kind === "image") {
        ctx.drawImage(it.img, pos.x - it.w / 2, pos.y - it.h / 2, it.w, it.h);
      } else {
        const color = s.hoverEffect && tag._hover > 0.5 ? s.hoverColor : tag.data.color;
        ctx.font = `${s.customFontWeight} ${it.fs}px ${s.customFont}`;
        if (s.labelOutline) {
          ctx.lineWidth = Math.max(2, it.fs * 0.2);
          ctx.strokeStyle = s.outlineColor;
          ctx.strokeText(tag.data.text, pos.x, pos.y);
        }
        ctx.fillStyle = color;
        ctx.fillText(tag.data.text, pos.x, pos.y);
      }

      if (tag === this._focusedTag) {
        ctx.globalAlpha = tag._vis;
        this._drawFocusRing(pos.x, pos.y, it.w, it.h);
      }
      if (tag._vis > 0.5) hits.push(it);
    }
    ctx.globalAlpha = 1;
    this._hitList = hits;
    return animating;
  }

  _drawFocusRing(x, y, bw, bh) {
    const ctx = this.ctx;
    const pad = 5;
    const l = x - bw / 2 - pad;
    const t = y - bh / 2 - pad;
    const rw = bw + pad * 2;
    const rh = bh + pad * 2;
    const r = Math.min(8, rh / 2);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(l + r, t);
      ctx.lineTo(l + rw - r, t);
      ctx.arcTo(l + rw, t, l + rw, t + r, r);
      ctx.lineTo(l + rw, t + rh - r);
      ctx.arcTo(l + rw, t + rh, l + rw - r, t + rh, r);
      ctx.lineTo(l + r, t + rh);
      ctx.arcTo(l, t + rh, l, t + rh - r, r);
      ctx.lineTo(l, t + r);
      ctx.arcTo(l, t, l + r, t, r);
      ctx.closePath();
    };
    ctx.save();
    path();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    path();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.settings.focusColor;
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Pointer input
   * ------------------------------------------------------------------ */

  _getPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width ? this.width / rect.width : 1;
    const sy = rect.height ? this.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * (sx || 1), y: (e.clientY - rect.top) * (sy || 1) };
  }

  _hitTest(pt, minSize = MIN_HIT_MOUSE) {
    for (let i = this._hitList.length - 1; i >= 0; i--) {
      const it = this._hitList[i];
      const hw = Math.max(it.w / 2 + 2, minSize / 2);
      const hh = Math.max(it.h / 2 + 2, minSize / 2);
      if (Math.abs(pt.x - it.cx) <= hw && Math.abs(pt.y - it.cy) <= hh) return it;
    }
    return null;
  }

  _pixelsToAngle(px) {
    return (px * this.settings.dragSensitivity) / Math.max(50, this._extent * this._fit);
  }

  /** Adds to the pending rotation target (shared by drag and keyboard rotation). */
  _nudgeTarget(ax, ay, rate) {
    const lock = this._locks();
    if (lock.x) ax = 0;
    if (lock.y) ay = 0;
    if (!this._target) this._target = { x: this.rotation.x, y: this.rotation.y };
    this._target.x += ax;
    this._target.y += ay;
    this._targetRate = rate;
    this._schedule();
  }

  _dragRate() {
    return this.settings.enableEasing && !this._reduced() ? this.settings.easing : 1;
  }

  _onPointerDown(e) {
    if (this._destroyed || this._drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "touch" && !this.settings.enableTouch) return;
    const pt = this._getPointer(e);
    this._drag = {
      id: e.pointerId,
      type: e.pointerType,
      startX: pt.x,
      startY: pt.y,
      lastX: pt.x,
      lastY: pt.y,
      active: false,
    };
    this._pointer = pt;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture is optional */
    }
    if (typeof this.canvas.focus === "function") this.canvas.focus({ preventScroll: true });
    this._updateCursor();
    this._schedule();
  }

  _onPointerMove(e) {
    if (this._destroyed) return;
    const pt = this._getPointer(e);
    const d = this._drag;
    if (d && e.pointerId === d.id) {
      this._pointer = pt;
      const moved = Math.hypot(pt.x - d.startX, pt.y - d.startY);
      if (!d.active && moved > CLICK_TOLERANCE && this.settings.enableDrag) {
        d.active = true;
        this._dragging = true;
        this._target = null;
        this._measured = { x: 0, y: 0 };
        this.velocity.x = this.velocity.y = 0;
        // Apply everything travelled so far, so no motion is lost to the tolerance.
        d.lastX = d.startX;
        d.lastY = d.startY;
        this._updateCursor();
      }
      if (d.active) {
        const dx = pt.x - d.lastX;
        const dy = pt.y - d.lastY;
        this._nudgeTarget(this._pixelsToAngle(dy), -this._pixelsToAngle(dx), this._dragRate());
      }
      d.lastX = pt.x;
      d.lastY = pt.y;
      if (d.active && e.cancelable && e.preventDefault) e.preventDefault();
      return;
    }
    if (e.pointerType === "touch") return;
    this._pointer = pt;
    this._updateHover();
    this._schedule();
  }

  _onPointerUp(e) {
    const d = this._drag;
    if (this._destroyed || !d || e.pointerId !== d.id) return;
    const pt = this._getPointer(e);
    this._drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* already released */
    }
    if (d.active) {
      this._endDrag();
    } else if (e.type === "pointerup" && this.settings.enableClick) {
      this._handleClick(pt, e, d.type === "touch" ? MIN_HIT_TOUCH : MIN_HIT_MOUSE);
    }
    if (d.type === "touch") {
      this._pointer = null;
      this._updateHover();
    }
    this._updateCursor();
    this._schedule();
  }

  _endDrag() {
    this._dragging = false;
    this._target = null;
    const max = this.settings.maxVelocity;
    const lock = this._locks();
    for (const a of ["x", "y"]) {
      let v = this.settings.paused || lock[a] ? 0 : this._measured[a];
      if (max > 0) v = clamp(v, -max, max);
      this.velocity[a] = v;
    }
  }

  _cancelDrag() {
    const d = this._drag;
    this._drag = null;
    if (d) {
      try {
        this.canvas.releasePointerCapture(d.id);
      } catch (err) {
        /* already released */
      }
    }
    if (this._dragging) this._endDrag();
    this._updateCursor();
  }

  _onPointerLeave(e) {
    if (this._destroyed || (this._drag && this._drag.active)) return;
    this._pointer = null;
    this._updateHover();
    this._schedule();
  }

  _handleClick(pt, e, minSize) {
    const hit = this._hitTest(pt, minSize);
    if (hit) {
      this._activate(hit.tag, e);
      return;
    }
    const s = this.settings;
    if (!s.clickNudge || s.paused || this._reduced()) return;
    const dx = pt.x - this.center.x;
    const dy = pt.y - this.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;
    const mag = s.maxVelocity > 0 ? s.maxVelocity * 0.4 : 0.03;
    const lock = this._locks();
    if (!lock.y) this.velocity.y += (dx / dist) * mag;
    if (!lock.x) this.velocity.x -= (dy / dist) * mag;
    if (s.maxVelocity > 0) {
      this.velocity.x = clamp(this.velocity.x, -s.maxVelocity, s.maxVelocity);
      this.velocity.y = clamp(this.velocity.y, -s.maxVelocity, s.maxVelocity);
    }
  }

  _activate(tag, originalEvent) {
    if (this.settings.clickEffect && !this._reduced()) tag._pulse = 1;
    this._emit("tagClick", this._publicTag(tag), originalEvent);
    this._schedule();
  }

  _updateHover() {
    if (this._destroyed) return;
    let next = null;
    if (this._pointer && !(this._drag && this._drag.active)) {
      const hit = this._hitTest(this._pointer);
      next = hit ? hit.tag : null;
    }
    if (next === this._hoveredTag) return;
    const prev = this._hoveredTag;
    this._hoveredTag = next;
    if (prev) this._emit("tagLeave", this._publicTag(prev));
    if (next) this._emit("tagHover", this._publicTag(next));
    this._updateCursor();
    this._schedule();
  }

  _updateCursor(force) {
    const s = this.settings;
    let cursor = "";
    if (this._hoveredTag && s.enableClick) cursor = "pointer";
    else if (s.enableDrag) cursor = this._dragging ? "grabbing" : "grab";
    if (force || this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  /* ------------------------------------------------------------------ *
   * Keyboard
   * ------------------------------------------------------------------ */

  _onKeyDown(e) {
    if (this._destroyed || e.altKey || e.ctrlKey || e.metaKey) return;
    const handled = () => {
      e.preventDefault();
      this._schedule();
    };
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (e.shiftKey) {
          const step = KEY_ROTATE_STEP;
          const ax = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          const ay = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
          this._nudgeTarget(ax, ay, this._reduced() ? 1 : 0.2);
        } else {
          this._moveFocus(e.key.replace("Arrow", "").toLowerCase());
        }
        handled();
        break;
      }
      case "Home":
        if (this.tags.length) this._setFocus(this.tags[0], { bringToFront: true });
        handled();
        break;
      case "End":
        if (this.tags.length) this._setFocus(this.tags[this.tags.length - 1], { bringToFront: true });
        handled();
        break;
      case "PageDown":
      case "PageUp": {
        const n = this.tags.length;
        if (n) {
          const cur = this._focusedTag ? this._focusedTag.index : e.key === "PageDown" ? -1 : 0;
          const next = (cur + (e.key === "PageDown" ? 1 : -1) + n) % n;
          this._setFocus(this.tags[next], { bringToFront: true });
        }
        handled();
        break;
      }
      case "Enter":
      case " ":
      case "Spacebar":
        if (this._focusedTag) {
          this._activate(this._focusedTag, e);
          handled();
        }
        break;
      case "Escape":
        if (this._focusedTag) {
          this._setFocus(null);
          handled();
        }
        break;
      case "p":
      case "P":
        this._setPaused(!this.settings.paused);
        this._announce(this.settings.paused ? "Rotation paused" : "Rotation resumed");
        handled();
        break;
      default:
        break;
    }
  }

  _moveFocus(dir) {
    const list = this._hitList;
    if (!list.length) return;
    const cur = this._focusedTag ? list.find((it) => it.tag === this._focusedTag) : null;
    if (!cur) {
      // Start with the front-most tag.
      const front = list.reduce((a, b) => (a.z <= b.z ? a : b));
      this._setFocus(front.tag);
      return;
    }
    let best = null;
    let bestScore = Infinity;
    for (const it of list) {
      if (it === cur) continue;
      const dx = it.cx - cur.cx;
      const dy = it.cy - cur.cy;
      let along;
      let perp;
      if (dir === "right") [along, perp] = [dx, Math.abs(dy)];
      else if (dir === "left") [along, perp] = [-dx, Math.abs(dy)];
      else if (dir === "down") [along, perp] = [dy, Math.abs(dx)];
      else [along, perp] = [-dy, Math.abs(dx)];
      if (along <= 1) continue;
      const score = along + perp * 2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) this._setFocus(best.tag);
  }

  _setFocus(tag, { bringToFront = false, announce = true } = {}) {
    if (this._destroyed) return;
    if (tag === this._focusedTag) {
      if (tag && bringToFront) this._bringToFront(tag);
      return;
    }
    const prev = this._focusedTag;
    this._focusedTag = tag;
    if (prev) this._emit("tagBlur", this._publicTag(prev));
    if (tag) {
      this._emit("tagFocus", this._publicTag(tag));
      if (announce) {
        const pos = tag.index + 1;
        const total = this.tags.length;
        const custom = this.settings.announce;
        let msg;
        try {
          msg = custom ? custom(this._publicTag(tag), pos, total) : null;
        } catch (err) {
          console.error("Orbity: announce callback threw.", err);
        }
        this._announce(msg || `${this._tagName(tag)}, ${pos} of ${total}`);
      }
      if (bringToFront) this._bringToFront(tag);
    }
    this._schedule();
  }

  /** Rotates the cloud so the given tag faces the viewer. */
  _bringToFront(tag) {
    const lock = this._locks();
    const rot = this.rotation;
    let Y = rot.y;
    if (lock.y) Y = lock.fy;
    else if (Math.abs(tag.bx) + Math.abs(tag.bz) > 1e-6) Y = Math.atan2(tag.bx, -tag.bz);
    const z1 = -tag.bx * Math.sin(Y) + tag.bz * Math.cos(Y);
    let X = rot.x;
    if (lock.x) X = lock.fx;
    else if (Math.abs(tag.by) + Math.abs(z1) > 1e-6) X = Math.atan2(-tag.by, -z1);
    this._target = {
      x: rot.x + wrapAngle(X - rot.x),
      y: rot.y + wrapAngle(Y - rot.y),
    };
    this._targetRate = this._reduced() ? 1 : 0.12;
    this.velocity.x = this.velocity.y = 0;
    this._schedule();
  }

  /**
   * Gives a tag keyboard focus, rotates it to the front and announces it.
   * @param {number} index
   * @param {{bringToFront?: boolean}} [opts]
   */
  focusTag(index, { bringToFront = true } = {}) {
    const tag = this.tags[index];
    if (!tag) return;
    if (typeof this.canvas.focus === "function") this.canvas.focus({ preventScroll: true });
    this._setFocus(tag, { bringToFront });
  }

  /** Rotates the cloud so the tag at `index` faces the viewer. */
  rotateTo(index) {
    const tag = this.tags[index];
    if (tag) this._bringToFront(tag);
  }

  /** Smoothly returns the cloud to its starting orientation. */
  resetRotation() {
    const lock = this._locks();
    this._target = {
      x: this.rotation.x + wrapAngle((lock.x ? lock.fx : 0) - this.rotation.x),
      y: this.rotation.y + wrapAngle((lock.y ? lock.fy : 0) - this.rotation.y),
    };
    this._targetRate = this._reduced() ? 1 : 0.12;
    this.velocity.x = this.velocity.y = 0;
    this._schedule();
  }

  /* ------------------------------------------------------------------ *
   * Device orientation
   * ------------------------------------------------------------------ */

  _orientationNeedsPermission() {
    return (
      typeof window !== "undefined" &&
      window.DeviceOrientationEvent &&
      typeof window.DeviceOrientationEvent.requestPermission === "function"
    );
  }

  /**
   * iOS requires an explicit permission prompt, which must be triggered from a user gesture
   * (for example inside a click handler).
   * @returns {Promise<boolean>} Whether tilt control is allowed.
   */
  async requestOrientationPermission() {
    if (this._orientationNeedsPermission()) {
      try {
        this._orientGranted = (await window.DeviceOrientationEvent.requestPermission()) === "granted";
      } catch (err) {
        this._orientGranted = false;
      }
    } else {
      this._orientGranted = true;
    }
    this._syncOrientation();
    return this._orientGranted;
  }

  _syncOrientation() {
    if (typeof window === "undefined" || this._destroyed) return;
    const allowed =
      this.settings.enableOrientation && (!this._orientationNeedsPermission() || this._orientGranted);
    if (allowed && !this._orientListening) {
      if (!this._onOrientationBound) this._onOrientationBound = (e) => this._onOrientation(e);
      window.addEventListener("deviceorientation", this._onOrientationBound);
      this._orientListening = true;
    } else if (!allowed && this._orientListening) {
      window.removeEventListener("deviceorientation", this._onOrientationBound);
      this._orientListening = false;
      this._orient = { x: 0, y: 0 };
    }
  }

  _onOrientation(e) {
    if (e.beta === null || e.gamma === null || e.beta === undefined || e.gamma === undefined) return;
    const dead = (deg) => (Math.abs(deg) < 3 ? 0 : deg - Math.sign(deg) * 3);
    const gain = 0.012;
    this._orient.y = clamp(-dead(e.gamma) / 45, -1, 1) * gain;
    this._orient.x = clamp(dead(e.beta - 45) / 45, -1, 1) * gain;
    this._schedule();
  }

  /* ------------------------------------------------------------------ *
   * Pause / resume
   * ------------------------------------------------------------------ */

  _setPaused(value) {
    if (this._destroyed || this.settings.paused === value) return;
    this.settings.paused = value;
    if (!value) this._lastTime = null;
    this._emit(value ? "pause" : "resume");
    this._schedule();
  }

  /** Stops automatic motion. Dragging and keyboard rotation still work. */
  pause() {
    this._setPaused(true);
  }

  /** Resumes automatic motion. */
  resume() {
    this._setPaused(false);
  }

  /** Toggles between paused and running. */
  togglePause() {
    this._setPaused(!this.settings.paused);
  }

  get paused() {
    return this.settings.paused;
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  /**
   * Registers a listener. Events: tagClick, tagHover, tagLeave, tagFocus, tagBlur (tag, [event]),
   * tagsChange (tags), pause, resume.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} Call it to unsubscribe.
   */
  on(event, callback) {
    if (!EVENT_NAMES.includes(event)) {
      console.warn(`Orbity: unknown event "${event}". Available: ${EVENT_NAMES.join(", ")}.`);
      return () => {};
    }
    if (typeof callback !== "function") return () => {};
    (this._events[event] = this._events[event] || []).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Removes a listener, or every listener of the event when no callback is given.
   * @param {string} event
   * @param {Function} [callback]
   */
  off(event, callback) {
    if (!this._events[event]) return;
    this._events[event] = callback ? this._events[event].filter((cb) => cb !== callback) : [];
  }

  _emit(event, ...args) {
    const list = this._events[event];
    if (!list || !list.length) return;
    for (const cb of list.slice()) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Orbity: "${event}" listener threw.`, err);
      }
    }
  }
}

export default Orbity;