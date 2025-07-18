/* Orbity.js is inspired by tagcanvas.js 
link to tagcanvas.js: https://www.goat1000.com/tagcanvas.php
Thanks to the original author for the inspiration! */

const DEFAULT_SHAPE = "sphere";

const EASING_PROFILES = {
  Snappy: { easeIn: 0.2, friction: 0.9 },
  Smooth: { easeIn: 0.1, friction: 0.95 },
  Marathon: { easeIn: 0.05, friction: 0.99 },
};

class Orbity {
  /**
   * Creates an instance of Orbity.
   * @param {HTMLCanvasElement} canvas - The canvas element where the 3D tag cloud will be rendered.
   * @param {Object} options - Configuration options for the tag cloud.
   * @param {number} [options.radius=150] - Radius of the 3D sphere or other shapes.
   * @param {number} [options.speed=0.002] - Speed of rotation.
   * @param {number} [options.easing=0.05] - Easing factor for smooth rotation.
   * @param {boolean} [options.paused=false] - Whether the animation starts paused.
   * @param {boolean} [options.enableTouch=true] - Enable touch interaction.
   * @param {boolean} [options.enableOrientation=false] - Enable device orientation interaction.
   * @param {number} [options.maxVelocity=0.05] - Maximum velocity for rotation.
   * @param {string} [options.shape=DEFAULT_SHAPE] - Shape of the tag cloud (e.g., "sphere", "cube", "plane", "helix", "ring", "verticalRing", "cylinder", "pyramid", "torus").
   * @param {boolean} [options.enableDrag=true] - Enable drag interaction.
   * @param {boolean} [options.enableClick=true] - Enable click interaction.
   * @param {boolean} [options.hoverEffect=true] - Enable/disable hover effects.
   * @param {boolean} [options.clickEffect=true] - Enable/disable click effects.
   * @param {number} [options.hoverScale=1.2] - Scale factor for hover effect.
   * @param {string} [options.hoverColor="#ff0"] - Color change on hover.
   * @param {number} [options.hoverOpacity=1.0] - Opacity change on hover.
   * @param {string} [options.customFont="sans-serif"] - Default font family.
   * @param {string} [options.customFontWeight="normal"] - Default font weight.
   * @param {number} [options.majorRadius] - Major radius for the torus shape.
   * @param {number} [options.minorRadius] - Minor radius for the torus shape.
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tags = [];
    this.settings = Object.assign(
      {
        radius: 150,
        speed: 1,
        easing: 0.1,
        enableEasing: true,
        paused: false,
        enableTouch: true,
        enableOrientation: false,
        maxVelocity: 0.5,
        shape: DEFAULT_SHAPE,
        enableDrag: true,
        enableClick: true,
        autoSpin: true,
        hoverEffect: true,
        clickEffect: true,
        hoverScale: 1.2,
        hoverColor: "#ff0",
        hoverOpacity: 1.0,
        customFont: "sans-serif",
        customFontWeight: "normal",
        easingProfile: "Smooth",
        customEaseIn: 0.1,
        customFriction: 0.95,
        autoEasing: true,
        minVelocityThreshold: 0.005,
        dragSensitivity: 2,
      },
      options
    );
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };

    if (this.settings.autoSpin) {
      this.velocity.x = this.settings.speed;
      this.velocity.y = this.settings.speed;
    }

    this.touch = { x: 0, y: 0, active: false };
    this.animFrame = null;
    this._events = { tagClick: [], tagHover: [], tagLeave: [] };
    this._hoveredIndex = null;
    this.undoStack = [];
    this.redoStack = [];

    this.settings.easing = Math.min(Math.max(this.settings.easing, 0.01), 0.5);
    this.settings.speed = Math.min(Math.max(this.settings.speed, 0.001), 5);
    this._orientationHandler = this._handleOrientation.bind(this);
    this._touchStartHandler = this._onTouchStart.bind(this);
    this._touchMoveHandler = this._onTouchMove.bind(this);
    this._mouseMoveHandler = this._onCanvasMouseMove.bind(this);
    this._mouseLeaveHandler = this._onCanvasMouseLeave.bind(this);
    this._clickHandler = this._onCanvasClick.bind(this);
    this._keyboardHandler = this._onKeyboard.bind(this);
    this._init();
  }

  /**
   * Throttles a function to limit its execution rate.
   * @private
   * @param {Function} func - The function to throttle.
   * @param {number} limit - The time limit in milliseconds.
   * @returns {Function} The throttled function.
   */
  _throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function (...args) {
      const context = this;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(function () {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    };
  }

  /**
   * Initializes the Orbity instance by setting up the canvas, event listeners, and starting the animation.
   * @private
   */
  _init() {
    this._resize = this._throttle(this._resize.bind(this), 200);
    this._onCanvasMouseMove = this._throttle(
      this._onCanvasMouseMove.bind(this),
      50
    );
    window.addEventListener("resize", this._resize);
    this._bindTouch();
    this._bindMouse();
    this._bindOrientation();
    this._attachInteraction();
    this.canvas.setAttribute("role", "region");
    this.canvas.setAttribute("aria-label", "3D tag cloud visualization");
    this.canvas.setAttribute("tabindex", "0");
    this.canvas.addEventListener("keydown", this._keyboardHandler);
    this._resize();
    this._positionTags();
    this._animate();
  }

  /**
   * Resizes the canvas to match its container and recalculates the center and tag positions.
   * @private
   */
  _resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
    this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this._positionTags();
  }

  /**
   * Sets the tags to be displayed in the 3D tag cloud.
   * @param {Array<Object>} dataArray - Array of tag data objects.
   * Each object should have the following properties:
   *   - text {string}: The text of the tag.
   *   - color {string}: The color of the tag (e.g., "#fff").
   *   - fontSize {number} (optional): The font size of the tag.
   */
  setTags(dataArray) {
    this.tags = dataArray.map((data, i) => ({
      ...data,
      angleX: Math.random() * 2 * Math.PI,
      angleY: Math.random() * Math.PI,
      index: i,
      _screen: {},
      _scale: 1,
      _color: data.color,
      _opacity: 1,
      _img: data.imageUrl ? null : undefined,
      _svg: data.svg ? null : undefined,
    }));
    this._reindexTags();
    this._positionTags();
    this._draw();
  }

  /**
   * Generates a random angle for tag positioning.
   * @private
   * @returns {number} A random angle in radians.
   */
  _getRandomAngle() {
    return Math.random() * 2 * Math.PI;
  }

  /**
   * Adds a single tag to the 3D tag cloud and records the action for undo/redo.
   * @param {Object} tagData - Data for the new tag.
   */
  addTag(tagData) {
    if (!this._validateTag(tagData)) return;
    const newTag = {
      ...tagData,
      angleX: this._getRandomAngle(),
      angleY: this._getRandomAngle(),
      index: this.tags.length,
      _screen: {},
      _scale: 1,
      _color: tagData.color,
      _opacity: 1,
      _img: tagData.imageUrl ? null : undefined,
      _svg: tagData.svg ? null : undefined,
    };
    this.tags.push(newTag);
    this.undoStack.push({ action: "add", tag: { ...newTag } });
    this.redoStack = [];
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Removes a tag from the 3D tag cloud by its index and records the action for undo/redo.
   * @param {number} index - Index of the tag to remove.
   */
  removeTag(index) {
    if (index < 0 || index >= this.tags.length) return;
    const removedTag = this.tags.splice(index, 1)[0];
    this.undoStack.push({ action: "remove", tag: { ...removedTag }, index });
    this.redoStack = [];
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Updates the data of an existing tag and records the action for undo/redo.
   * @param {number} index - Index of the tag to update.
   * @param {Object} data - New data for the tag.
   */
  updateTag(index, data) {
    if (!this.tags[index]) {
      console.error(`Tag at index ${index} does not exist.`);
      return;
    }
    const oldData = { ...this.tags[index] };
    Object.assign(this.tags[index], data, {
      _scale: 1,
      _color: data.color || this.tags[index].color,
      _opacity: 1,
    });
    this.undoStack.push({
      action: "update",
      oldData,
      newData: { ...this.tags[index] },
    });
    this.redoStack = [];
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Undoes the last tag-related action.
   */
  undo() {
    if (this.undoStack.length === 0) return;
    const lastAction = this.undoStack.pop();
    this.redoStack.push(lastAction);

    switch (lastAction.action) {
      case "add":
        this.tags.pop();
        break;
      case "remove":
        this.tags.splice(lastAction.index, 0, { ...lastAction.tag });
        break;
      case "update":
        Object.assign(this.tags[lastAction.oldData.index], lastAction.oldData);
        break;
    }
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Redoes the last undone action.
   */
  redo() {
    if (this.redoStack.length === 0) return;
    const lastAction = this.redoStack.pop();
    this.undoStack.push(lastAction);

    switch (lastAction.action) {
      case "add":
        this.tags.push({ ...lastAction.tag });
        break;
      case "remove":
        this.tags.splice(lastAction.index, 1);
        break;
      case "update":
        Object.assign(this.tags[lastAction.newData.index], lastAction.newData);
        break;
    }
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Clears all tags from the 3D tag cloud.
   */
  clearTags() {
    this.tags = [];
    this._reindexTags();
    this._positionTags();
  }

  /**
   * Updates the configuration options for the Orbity instance.
   * @param {Object} newOptions - New configuration options.
   */
  updateOptions(newOptions) {
    this.settings = { ...this.settings, ...newOptions };

    if (newOptions.easing !== undefined) {
      if (typeof newOptions.easing !== "number") {
        console.error("Invalid easing: must be a number");
        this.settings.easing = 0.1;
      } else {
        this.settings.easing = newOptions.easing;
      }
    }

    if (newOptions.speed !== undefined) {
      if (typeof newOptions.speed !== "number") {
        console.error("Invalid speed: must be a ");
        this.settings.speed = 1;
      } else {
        this.settings.speed = newOptions.speed;
      }
    }

    if (newOptions.radius !== undefined) {
      if (typeof newOptions.radius !== "number" || newOptions.radius <= 0) {
        console.error("Invalid radius: must be a positive number.");
        this.settings.radius = 150;
      }
    }

    if (newOptions.shape !== undefined) {
      const validShapes = [
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
      if (!validShapes.includes(newOptions.shape)) {
        console.error(
          `Invalid shape: must be one of ${validShapes.join(", ")}.`
        );
        this.settings.shape = DEFAULT_SHAPE;
      }
    }

    if (newOptions.maxVelocity !== undefined) {
      if (
        typeof newOptions.maxVelocity !== "number" ||
        newOptions.maxVelocity < 0
      ) {
        console.error("Invalid maxVelocity: must be a non-negative number.");
        this.settings.maxVelocity = 0.5;
      }
    }

    if (newOptions.radius !== undefined || newOptions.shape !== undefined) {
      this._positionTags();
    }

    if (newOptions.enableTouch !== undefined) {
      if (newOptions.enableTouch) {
        this._bindTouch();
      } else {
        this.canvas.removeEventListener("touchstart", this._touchStartHandler);
        this.canvas.removeEventListener("touchmove", this._touchMoveHandler);
        this.canvas.removeEventListener("touchend", this._bindTouch);
      }
    }

    if (newOptions.enableOrientation !== undefined) {
      if (newOptions.enableOrientation) {
        this._bindOrientation();
      } else {
        window.removeEventListener(
          "deviceorientation",
          this._orientationHandler
        );
      }
    }

    if (newOptions.enableClick !== undefined) {
      if (newOptions.enableClick) {
        this.canvas.addEventListener("click", this._clickHandler);
      } else {
        this.canvas.removeEventListener("click", this._clickHandler);
      }
    }

    if (newOptions.paused !== undefined) {
      if (newOptions.paused) {
        this.pause();
      } else {
        this.resume();
      }
    }

    if (newOptions.easingProfile !== undefined) {
      this.setEasingProfile(newOptions.easingProfile);
    }
    if (newOptions.autoEasing !== undefined) {
      this.toggleAutoEasing(newOptions.autoEasing);
    }
    if (newOptions.customEaseIn !== undefined) {
      this.settings.customEaseIn = newOptions.customEaseIn;
    }
    if (newOptions.customFriction !== undefined) {
      this.settings.customFriction = newOptions.customFriction;
    }
    if (newOptions.minVelocityThreshold !== undefined) {
      this.settings.minVelocityThreshold = newOptions.minVelocityThreshold;
    }
  }

  /**
   * Validates the tag data.
   * @private
   * @param {Object} tagData - Data for the tag.
   * @returns {boolean} True if the tag data is valid, false otherwise.
   */
  _validateTag(tagData) {
    if (!tagData.text || typeof tagData.text !== "string") {
      console.error("Invalid tag: 'text' is required and must be a string.");
      return false;
    }
    if (!tagData.color || !/^#[0-9A-F]{6}$/i.test(tagData.color)) {
      console.error("Invalid tag: 'color' must be a valid hex color code.");
      return false;
    }
    return true;
  }

  /**
   * Handles drag-like interactions for rotating the tag cloud.
   * @private
   */
  _bindDragEvents(startEvent, moveEvent, endEvent, getPosition) {
    if (!this._dragHandlers) this._dragHandlers = {};

    if (this._dragHandlers[startEvent]) {
      this.canvas.removeEventListener(
        startEvent,
        this._dragHandlers[startEvent]
      );
      this.canvas.removeEventListener(moveEvent, this._dragHandlers[moveEvent]);
      this.canvas.removeEventListener(endEvent, this._dragHandlers[endEvent]);
      this.canvas.removeEventListener(
        "mouseleave",
        this._dragHandlers.mouseleave
      );
      if (this._dragHandlers.windowMouseUp) {
        window.removeEventListener("mouseup", this._dragHandlers.windowMouseUp);
      }
    }

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const startHandler = (e) => {
      if (!this.settings.enableDrag) return;
      isDragging = true;
      const pos = getPosition(e);
      lastX = pos.x;
      lastY = pos.y;

      if (this.velocity.x === 0 && this.velocity.y === 0) {
        this.velocity.x = this.settings.speed;
        this.velocity.y = this.settings.speed;
      }
      if (endEvent === "mouseup") {
        window.addEventListener("mouseup", endHandler);
        this._dragHandlers.windowMouseUp = endHandler;
      }
    };

    const moveHandler = (e) => {
      if (!this.settings.enableDrag || !isDragging) return;

      const pos = getPosition(e);
      const dx = (pos.x - lastX) * (this.settings.dragSensitivity || 1);
      const dy = (pos.y - lastY) * (this.settings.dragSensitivity || 1);

      if (this.settings.maxVelocity > 0) {
        this.velocity.x = Math.min(
          Math.max(dy * this.settings.speed, -this.settings.maxVelocity),
          this.settings.maxVelocity
        );
        this.velocity.y = Math.min(
          Math.max(dx * this.settings.speed, -this.settings.maxVelocity),
          this.settings.maxVelocity
        );
      } else {
        this.velocity.x = dy * this.settings.speed;
        this.velocity.y = dx * this.settings.speed;
      }

      lastX = pos.x;
      lastY = pos.y;

      if (e.preventDefault) e.preventDefault();
    };

    const endHandler = () => {
      if (!this.settings.enableDrag) return;
      isDragging = false;
      this._applyDragEasing();
    };

    const leaveHandler = () => {
      if (!this.settings.enableDrag) return;
      if (isDragging) {
        isDragging = false;
        this._applyDragEasing();
      }
    };

    this.canvas.addEventListener(startEvent, startHandler);
    this.canvas.addEventListener(moveEvent, moveHandler, { passive: false });
    this.canvas.addEventListener(endEvent, endHandler);
    this.canvas.addEventListener("mouseleave", leaveHandler);

    this._dragHandlers[startEvent] = startHandler;
    this._dragHandlers[moveEvent] = moveHandler;
    this._dragHandlers[endEvent] = endHandler;
    this._dragHandlers.mouseleave = leaveHandler;
  }

  /**
   * Handles touch interactions for rotating the tag cloud.
   * @private
   */
  _bindTouch() {
    if (!this.settings.enableTouch) return;

    this._bindDragEvents("touchstart", "touchmove", "touchend", (e) => ({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }));
  }

  /**
   * Handles the touch start event to initiate touch interaction.
   * @private
   * @param {TouchEvent} event - The touch start event.
   */
  _onTouchStart(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touch.x = touch.clientX;
      this.touch.y = touch.clientY;
      this.touch.active = true;
    }
  }

  /**
   * Handles the touch move event to update touch interaction.
   * @private
   * @param {TouchEvent} event - The touch move event.
   */
  _onTouchMove(event) {
    if (event.touches.length === 1 && this.touch.active) {
      const touch = event.touches[0];
      const dx =
        (touch.clientX - this.touch.x) * (this.settings.dragSensitivity || 1);
      const dy =
        (touch.clientY - this.touch.y) * (this.settings.dragSensitivity || 1);

      if (this.settings.maxVelocity > 0) {
        this.velocity.x = Math.min(
          Math.max(dy * this.settings.speed, -this.settings.maxVelocity),
          this.settings.maxVelocity
        );
        this.velocity.y = Math.min(
          Math.max(dx * this.settings.speed, -this.settings.maxVelocity),
          this.settings.maxVelocity
        );
      } else {
        this.velocity.x = dy * this.settings.speed * 0.1;
        this.velocity.y = dx * this.settings.speed * 0.1;
      }

      this.touch.x = touch.clientX;
      this.touch.y = touch.clientY;

      if (event.preventDefault) event.preventDefault();
    }
  }

  /**
   * Handles mouse interactions for rotating the tag cloud.
   * @private
   */
  _bindMouse() {
    this._bindDragEvents("mousedown", "mousemove", "mouseup", (e) => ({
      x: e.clientX,
      y: e.clientY,
    }));
  }

  /**
   * Sets the easing profile for the rotation animation.
   * @param {string} profileName - The name of the easing profile (e.g., "Smooth").
   */
  setEasingProfile(profileName) {
    if (profileName === "Custom") {
      this.settings.easingProfile = profileName;
      return;
    }
    if (EASING_PROFILES[profileName]) {
      this.settings.easingProfile = profileName;
      const { easeIn, friction } = EASING_PROFILES[profileName];
      this.settings.customEaseIn = easeIn;
      this.settings.customFriction = friction;
    } else {
      console.error(`Invalid easing profile: ${profileName}`);
    }
  }

  /**
   * Toggles auto-easing for the rotation animation.
   * @param {boolean} enabled - Whether to enable or disable auto-easing.
   */
  toggleAutoEasing(enabled) {
    this.settings.autoEasing = enabled;
  }

  _applyDragEasing() {
    const { customFriction, minVelocityThreshold } = this.settings;

    const easeOut = () => {
      this.velocity.x *= customFriction;
      this.velocity.y *= customFriction;

      if (Math.abs(this.velocity.x) < minVelocityThreshold) this.velocity.x = 0;
      if (Math.abs(this.velocity.y) < minVelocityThreshold) this.velocity.y = 0;

      if (this.velocity.x !== 0 || this.velocity.y !== 0) {
        requestAnimationFrame(easeOut);
      }
    };

    easeOut();
  }

  /**
   * Handles device orientation interactions for rotating the tag cloud.
   * @private
   */
  _bindOrientation() {
    if (!this.settings.enableOrientation) return;

    let lastUpdate = 0;
    const throttleDelay = 100;

    const handleOrientation = (e) => {
      const now = Date.now();
      if (now - lastUpdate < throttleDelay) return;
      lastUpdate = now;

      const { gamma = 0, beta = 0 } = e;
      this.velocity.x = gamma * 0.0005;
      this.velocity.y = beta * 0.0005;
    };

    window.addEventListener("deviceorientation", handleOrientation);
  }

  /**
   * Handles device orientation events to update the rotation velocity.
   * @private
   * @param {DeviceOrientationEvent} event - The device orientation event.
   */
  _handleOrientation(event) {
    const { beta, gamma } = event;
    if (beta !== null && gamma !== null) {
      this.velocity.x = gamma * 0.0005;
      this.velocity.y = beta * 0.0005;
    }
  }

  /**
   * Attaches mouse interaction events for the tag cloud.
   * @private
   */
  _attachInteraction() {
    if (this.settings.enableClick) {
      this.canvas.addEventListener("click", this._onCanvasClick.bind(this));
    }
    this.canvas.addEventListener(
      "mousemove",
      this._onCanvasMouseMove.bind(this)
    );
    this.canvas.addEventListener(
      "mouseleave",
      this._onCanvasMouseLeave.bind(this)
    );
  }

  _onCanvasClick(e) {
    const pt = this._getPointer(e);
    const tag = this._getTagAt(pt);

    if (tag && this.settings.clickEffect) {
      tag._scale = this.settings.hoverScale * 1.1;
      setTimeout(() => {
        tag._scale = this.settings.hoverScale;
      }, 200);
    }

    const dx = pt.x - this.center.x;
    const dy = pt.y - this.center.y;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocityMagnitude =
      this.settings.maxVelocity > 0
        ? this.settings.maxVelocity * 0.2
        : this.settings.speed * 0.1;

    this.velocity.x =
      -(dy / distance) * velocityMagnitude || this.settings.speed * 0.1;
    this.velocity.y =
      -(dx / distance) * velocityMagnitude || this.settings.speed * 0.1;
  }

  _onCanvasMouseMove(e) {
    const pt = this._getPointer(e);
    const tag = this._getTagAt(pt);

    if (tag && tag.index !== this._hoveredIndex) {
      if (this._hoveredIndex !== null) {
        const prev = this.tags[this._hoveredIndex];
        prev._scale = 1;
        prev._color = prev.color;
        prev._opacity = 1;
        this._events.tagLeave.forEach((cb) => cb(prev));
      }
      this._hoveredIndex = tag.index;
      if (this.settings.hoverEffect) {
        tag._scale = this.settings.hoverScale;
        tag._color = this.settings.hoverColor || tag.color;
        tag._opacity = this.settings.hoverOpacity;
      }
      this._events.tagHover.forEach((cb) => cb(tag));
    } else if (!tag && this._hoveredIndex !== null) {
      const prev = this.tags[this._hoveredIndex];
      prev._scale = 1;
      prev._color = prev.color;
      prev._opacity = 1;
      this._events.tagLeave.forEach((cb) => cb(prev));
      this._hoveredIndex = null;
    }
  }

  _onCanvasMouseLeave() {
    if (this._hoveredIndex !== null) {
      const prev = this.tags[this._hoveredIndex];
      prev._scale = 1;
      prev._color = prev.color;
      prev._opacity = 1;
      this._events.tagLeave.forEach((cb) => cb(prev));
      this._hoveredIndex = null;
    }
  }

  /**
   * Handles keyboard events for accessibility and navigation.
   * @private
   * @param {KeyboardEvent} event
   */
  _onKeyboard(event) {
    switch (event.key) {
      case "ArrowLeft":
        this.rotation.y -= 0.1;
        event.preventDefault();
        break;
      case "ArrowRight":
        this.rotation.y += 0.1;
        event.preventDefault();
        break;
      case "ArrowUp":
        this.rotation.x -= 0.1;
        event.preventDefault();
        break;
      case "ArrowDown":
        this.rotation.x += 0.1;
        event.preventDefault();
        break;
      case "Home":
        this.rotation.x = 0;
        this.rotation.y = 0;
        event.preventDefault();
        break;
      case "End":
        this.rotation.x = 0;
        this.rotation.y = 0;
        event.preventDefault();
        break;
      case " ":
      case "Spacebar":
        if (this.settings.paused) {
          this.resume();
        } else {
          this.pause();
        }
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  _getPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _getTagAt(pt) {
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      const s = tag._screen;
      if (!s) continue;
      const dx = pt.x - s.x;
      const dy = pt.y - s.y;
      if (Math.abs(dx) <= s.width / 2 && Math.abs(dy) <= s.height / 2)
        return tag;
    }
    return null;
  }

  _positionTags() {
    if (!this.tags.length) return;

    const R = this.settings.radius;
    const N = this.tags.length;
    const shape = this.settings.shape || DEFAULT_SHAPE;

    switch (shape) {
      case "torus":
        const majorRadius = this.settings.majorRadius || R * 0.6;
        const minorRadius = this.settings.minorRadius || R * 0.3;
        const majorSteps = Math.ceil(Math.sqrt(N));
        const minorSteps = Math.ceil(N / majorSteps);

        this.tags.forEach((tag, i) => {
          const majorAngle = (i % majorSteps) * ((2 * Math.PI) / majorSteps);
          const minorAngle =
            Math.floor(i / majorSteps) * ((2 * Math.PI) / minorSteps);

          const x =
            (majorRadius + minorRadius * Math.cos(minorAngle)) *
            Math.cos(majorAngle);
          const y =
            (majorRadius + minorRadius * Math.cos(minorAngle)) *
            Math.sin(majorAngle);
          const z = minorRadius * Math.sin(minorAngle);

          tag.x = x;
          tag.y = y;
          tag.z = z;
        });
        break;

      case "cube":
        const side = Math.ceil(Math.cbrt(N));
        const threshold = 0.1;
        let validTags = 0;

        this.tags.forEach((tag) => {
          let x, y, z;

          do {
            x = (validTags % side) - side / 2 + 0.5;
            y = (Math.floor(validTags / side) % side) - side / 2 + 0.5;
            z = Math.floor(validTags / (side * side)) - side / 2 + 0.5;
            validTags++;
          } while (
            Math.abs(x) < threshold &&
            Math.abs(y) < threshold &&
            Math.abs(z) < threshold
          );

          tag.x = x * (R / side) * 2;
          tag.y = y * (R / side) * 2;
          tag.z = z * (R / side) * 2;
        });
        break;

      case "pyramid":
        const levels = Math.ceil(Math.sqrt(N));
        let index = 0;
        for (let level = 0; level < levels; level++) {
          const levelSize = levels - level;
          const y = (level / levels) * R * 2 - R;
          for (let i = 0; i < levelSize && index < N; i++, index++) {
            const angle = (i / levelSize) * 2 * Math.PI;
            const radius = (R * (levels - level)) / levels;
            this.tags[index].x = radius * Math.cos(angle);
            this.tags[index].y = y;
            this.tags[index].z = radius * Math.sin(angle);
          }
        }
        break;
      case "helix":
        const turns = 2;
        const spacing = (2 * R) / N;
        this.tags.forEach((tag, i) => {
          const angle = (i / N) * 2 * Math.PI * turns;
          const height = -R + i * spacing;
          tag.x = R * Math.cos(angle);
          tag.y = height;
          tag.z = R * Math.sin(angle);
        });
        break;
      case "ring":
        this.tags.forEach((tag, i) => {
          const angle = (i / N) * 2 * Math.PI;
          tag.x = R * Math.cos(angle);
          tag.y = 0;
          tag.z = R * Math.sin(angle);
        });
        break;
      case "verticalRing":
        this.tags.forEach((tag, i) => {
          const angle = (i / N) * 2 * Math.PI;
          tag.x = 0;
          tag.y = R * Math.sin(angle);
          tag.z = R * Math.cos(angle);
        });
        break;
      case "cylinder":
        const heightStep = (2 * R) / Math.ceil(N / 10);
        const circumferenceTags = Math.ceil(Math.sqrt(N));
        this.tags.forEach((tag, i) => {
          const level = Math.floor(i / circumferenceTags);
          const angle =
            (i % circumferenceTags) * ((2 * Math.PI) / circumferenceTags);
          const height = -R + level * heightStep;
          tag.x = R * Math.cos(angle);
          tag.y = height;
          tag.z = R * Math.sin(angle);
        });
        break;

      case "plane":
        const gridCols = Math.ceil(Math.sqrt(N));
        const gridRows = Math.ceil(N / gridCols);
        const spacingX = (2 * R) / (gridCols - 1 || 1);
        const spacingZ = (2 * R) / (gridRows - 1 || 1);
        this.tags.forEach((tag, i) => {
          const col = i % gridCols;
          const row = Math.floor(i / gridCols);
          tag.x = -R + col * spacingX;
          tag.y = 0;
          tag.z = -R + row * spacingZ;
        });
        break;

      case "sphere":
      default:
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;
        this.tags.forEach((tag, i) => {
          const t = i / N;
          const inclination = Math.acos(1 - 2 * t);
          const azimuth = angleIncrement * i;
          tag.x = R * Math.sin(inclination) * Math.cos(azimuth);
          tag.y = R * Math.sin(inclination) * Math.sin(azimuth);
          tag.z = R * Math.cos(inclination);
        });
        break;
    }
  }

  _draw() {
    const { ctx, canvas, center } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sortedTags = [...this.tags]
      .filter(
        (tag) =>
          tag &&
          (typeof tag.text === "string" || tag.imageUrl || tag.svg) &&
          typeof tag.x === "number" &&
          typeof tag.y === "number" &&
          typeof tag.z === "number"
      )
      .sort((a, b) => b.z - a.z);
    for (const tag of sortedTags) {
      try {
        const denominator = center.x * 2 + tag.z;
        const scale = denominator > 0 ? (center.x * 2) / denominator : 1;
        const x = isFinite(tag.x * scale + center.x)
          ? tag.x * scale + center.x
          : center.x;
        const y = isFinite(tag.y * scale + center.y)
          ? tag.y * scale + center.y
          : center.y;
        const fontSize = isFinite(
          (tag.fontSize || 15) * scale * (tag._scale || 1)
        )
          ? (tag.fontSize || 15) * scale * (tag._scale || 1)
          : 15;
        const maxZ = center.x * 2;
        const minZ = -center.x * 2;
        const normalizedZ = (tag.z - minZ) / (maxZ - minZ);
        const opacity = Math.max(0.2, Math.min(1, 1 - normalizedZ));
        ctx.globalAlpha = opacity;
        if (this._focusedIndex === tag.index) {
          ctx.save();
          ctx.strokeStyle = "#ffc845";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, fontSize, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
        if (tag.imageUrl) {
          if (!tag._img) {
            tag._img = new window.Image();
            tag._img.src = tag.imageUrl;
            tag._img.onload = () => this._draw();
          }
          if (tag._img.complete && tag._img.naturalWidth) {
            ctx.drawImage(
              tag._img,
              x - fontSize / 2,
              y - fontSize / 2,
              fontSize,
              fontSize
            );
            tag._screen = {
              x,
              y,
              width: fontSize,
              height: fontSize,
            };
            continue;
          }
        }
        if (tag.svg) {
          if (!tag._svg) {
            const svg = new window.Image();
            const svgBlob = new Blob([tag.svg], { type: "image/svg+xml" });
            tag._svgUrl = URL.createObjectURL(svgBlob);
            svg.src = tag._svgUrl;
            svg.onload = () => {
              tag._svg = svg;
              this._draw();
            };
          }
          if (tag._svg && tag._svg.complete && tag._svg.naturalWidth) {
            ctx.drawImage(
              tag._svg,
              x - fontSize / 2,
              y - fontSize / 2,
              fontSize,
              fontSize
            );
            tag._screen = {
              x,
              y,
              width: fontSize,
              height: fontSize,
            };
            continue;
          }
        }
        if (tag.text) {
          ctx.fillStyle = tag._color || tag.color || "#fff";
          ctx.font = `${this.settings.customFontWeight} ${fontSize}px ${this.settings.customFont}`;
          const metrics = ctx.measureText(tag.text);
          tag._screen = {
            x,
            y,
            width: metrics.width,
            height: fontSize,
          };
          ctx.fillText(tag.text, x - metrics.width / 2, y + fontSize / 2);
        }
      } catch (error) {
        console.error("Error drawing tag:", tag, error);
      }
    }
  }

  /**
   * Animates the rotation of the tag cloud.
   * @private
   */
  _animate() {
    if (this.settings.paused) return;

    if (this.settings.autoSpin && !this.settings.paused) {
      if (this.settings.autoEasing) {
        this.velocity.x +=
          (this.settings.speed - this.velocity.x) * this.settings.customEaseIn;
        this.velocity.y +=
          (this.settings.speed - this.velocity.y) * this.settings.customEaseIn;
      } else {
        this.velocity.x = this.settings.speed * 0.1;
        this.velocity.y = this.settings.speed * 0.1;
      }
      if (this.settings.maxVelocity > 0) {
        this.velocity.x = Math.max(
          -this.settings.maxVelocity,
          Math.min(this.velocity.x, this.settings.maxVelocity)
        );
        this.velocity.y = Math.max(
          -this.settings.maxVelocity,
          Math.min(this.velocity.y, this.settings.maxVelocity)
        );
      }
    }

    if (this.velocity.x !== 0 || this.velocity.y !== 0) {
      if (this.settings.autoEasing) {
        this.rotation.x +=
          (this.velocity.x - this.rotation.x) * this.settings.easing;
        this.rotation.y +=
          (this.velocity.y - this.rotation.y) * this.settings.easing;
      } else {
        this.rotation.x += this.velocity.x;
        this.rotation.y += this.velocity.y;
      }

      const shape = this.settings.shape || DEFAULT_SHAPE;
      if (shape === "ring" || shape === "helix") {
        this.rotation.x = 0;
      } else if (shape === "verticalRing") {
        this.rotation.y = 0;
      }

      const cosY = Math.cos(this.rotation.y),
        sinY = Math.sin(this.rotation.y);
      const cosX = Math.cos(this.rotation.x),
        sinX = Math.sin(this.rotation.x);

      this.tags.forEach((tag) => {
        let { x, y, z } = tag;

        let nx = x * cosY - z * sinY;
        let nz = x * sinY + z * cosY;
        let ny = y * cosX - nz * sinX;
        nz = y * sinX + nz * cosX;
        tag.x = nx;
        tag.y = ny;
        tag.z = nz;
      });
    }

    this._draw();
    this.animFrame = requestAnimationFrame(this._animate.bind(this));
  }

  /**
   * Pauses the animation of the tag cloud.
   */
  pause() {
    this.settings.paused = true;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    this._events.pause?.forEach((cb) => cb());
  }

  /**
   * Resumes the animation of the tag cloud.
   */
  resume() {
    if (!this.settings.paused) return;
    this.settings.paused = false;
    this._animate();
    this._events.resume?.forEach((cb) => cb());
  }

  /**
   * Destroys the Orbity instance, removing all event listeners and clearing the canvas.
   */
  destroy() {
    this.pause();
    window.removeEventListener("resize", this._resize);
    this.canvas.removeEventListener("touchstart", this._touchStartHandler);
    this.canvas.removeEventListener("touchmove", this._touchMoveHandler);
    this.canvas.removeEventListener("touchend", this._bindTouch);
    this.canvas.removeEventListener("mousedown", this._bindMouse);
    this.canvas.removeEventListener("mousemove", this._onCanvasMouseMove);
    this.canvas.removeEventListener("mouseup", this._bindMouse);
    this.canvas.removeEventListener("mouseleave", this._onCanvasMouseLeave);
    this.canvas.removeEventListener("click", this._onCanvasClick);
    window.removeEventListener("deviceorientation", this._orientationHandler);
    this.canvas.removeEventListener("keydown", this._keyboardHandler);
    if (this.canvas.parentNode) {
      this.canvas.replaceWith(this.canvas.cloneNode(true));
    }
    this.tags = [];
  }

  /**
   * Updates the index property of each tag to match its position in the tags array.
   * @private
   */
  _reindexTags() {
    this.tags.forEach((tag, i) => {
      tag.index = i;
    });
  }

  /**
   * Registers an event listener for Orbity events (e.g., 'tagClick', 'tagHover', 'tagLeave').
   * @param {string} event - The event name.
   * @param {Function} callback - The callback function.
   */
  on(event, callback) {
    if (this._events[event]) {
      this._events[event].push(callback);
    }
  }

  /**
   * Removes an event listener for Orbity events. If no callback is provided, removes all listeners for the event.
   * @param {string} event - The event name.
   * @param {Function} [callback] - The callback function to remove.
   */
  off(event, callback) {
    if (this._events[event]) {
      if (!callback) {
        this._events[event] = [];
      } else {
        this._events[event] = this._events[event].filter(
          (cb) => cb !== callback
        );
      }
    }
  }
}
export default Orbity;
