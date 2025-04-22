/* Orbity.js is inspired by tagcanvas.js 
link to tagcanvas.js: https://www.goat1000.com/tagcanvas.php
Thanks to the original author for the inspiration! */

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
   * @param {string} [options.shape="sphere"] - Shape of the tag cloud (e.g., "sphere", "cube", "pyramid").
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
        paused: false,
        enableTouch: true,
        enableOrientation: false,
        maxVelocity: 0.5,
        shape: "sphere",
      },
      options
    );
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0.01, y: 0.01 };
    this.touch = { x: 0, y: 0, active: false };
    this.animFrame = null;
    this._events = { tagClick: [], tagHover: [], tagLeave: [] };
    this._hoveredIndex = null;
    this._init();
  }

  /**
   * Initializes the Orbity instance by setting up the canvas, event listeners, and starting the animation.
   * @private
   */
  _init() {
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._bindTouch();
    this._bindMouse();
    this._bindOrientation();
    this._attachInteraction();
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "3D tag cloud visualization");
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
    }));
    this._positionTags();
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
   * Adds a single tag to the 3D tag cloud.
   * @param {Object} tagData - Data for the new tag.
   *   - text {string}: The text of the tag.
   *   - color {string}: The color of the tag (e.g., "#fff").
   *   - fontSize {number} (optional): The font size of the tag.
   */
  addTag(tagData) {
    if (!this._validateTag(tagData)) return;
    this.tags.push({
      ...tagData,
      angleX: this._getRandomAngle(),
      angleY: this._getRandomAngle(),
      index: this.tags.length,
      _screen: {},
    });
    this._positionTags();
  }

  /**
   * Removes a tag from the 3D tag cloud by its index.
   * @param {number} index - Index of the tag to remove.
   */
  removeTag(index) {
    this.tags.splice(index, 1);
    this._positionTags();
  }

  /**
   * Updates the data of an existing tag.
   * @param {number} index - Index of the tag to update.
   * @param {Object} data - New data for the tag.
   */
  updateTag(index, data) {
    if (!this.tags[index]) {
      console.error(`Tag at index ${index} does not exist.`);
      return;
    }
    Object.assign(this.tags[index], data);
    this._positionTags();
  }

  /**
   * Clears all tags from the 3D tag cloud.
   */
  clearTags() {
    this.tags = [];
  }

  /**
   * Updates the configuration options for the Orbity instance.
   * @param {Object} newOptions - New configuration options.
   */
  updateOptions(newOptions) {
    this.settings = { ...this.settings, ...newOptions };

    if (newOptions.radius !== undefined || newOptions.shape !== undefined) {
      this._positionTags();
    }

    if (newOptions.enableTouch !== undefined) {
      this._bindTouch();
    }

    if (newOptions.enableOrientation !== undefined) {
      this._bindOrientation();
    }

    if (newOptions.paused !== undefined) {
      if (newOptions.paused) {
        this.pause();
      } else {
        this.resume();
      }
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
   * Handles touch interactions for rotating the tag cloud.
   * @private
   */
  _bindTouch() {
    if (!this.settings.enableTouch) return;

    let lastX = 0;
    let lastY = 0;
    let velocityX = 0;
    let velocityY = 0;

    this.canvas.addEventListener("touchstart", (e) => {
      this.touch.active = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      velocityX = 0;
      velocityY = 0;
    });

    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!this.touch.active) return;

        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;

        // Calculate velocity and clamp it to maxVelocity
        velocityX = Math.min(
          dx * this.settings.speed,
          this.settings.maxVelocity
        );
        velocityY = Math.min(
          dy * this.settings.speed,
          this.settings.maxVelocity
        );

        this.velocity.x =
          Math.sign(velocityY) *
          Math.min(Math.abs(velocityY), this.settings.maxVelocity); // Invert Y-axis for natural rotation
        this.velocity.y =
          Math.sign(velocityX) *
          Math.min(Math.abs(velocityX), this.settings.maxVelocity);

        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;

        e.preventDefault();
      },
      { passive: false }
    );

    this.canvas.addEventListener("touchend", () => {
      this.touch.active = false;

      // Continue rotation with the last velocity
      this.velocity.x =
        Math.sign(velocityY) *
        Math.min(Math.abs(velocityY), this.settings.maxVelocity);
      this.velocity.y =
        Math.sign(velocityX) *
        Math.min(Math.abs(velocityX), this.settings.maxVelocity);
    });
  }

  /**
   * Handles mouse interactions for rotating the tag cloud.
   * @private
   */
  _bindMouse() {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let velocityX = 0;
    let velocityY = 0;

    this.canvas.addEventListener("mousedown", (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      velocityX = 0;
      velocityY = 0;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      // Calculate velocity and clamp it to maxVelocity
      velocityX = Math.min(dx * this.settings.speed, this.settings.maxVelocity);
      velocityY = Math.min(dy * this.settings.speed, this.settings.maxVelocity);

      this.velocity.x =
        Math.sign(velocityY) *
        Math.min(Math.abs(velocityY), this.settings.maxVelocity); // Invert Y-axis for natural rotation
      this.velocity.y =
        Math.sign(velocityX) *
        Math.min(Math.abs(velocityX), this.settings.maxVelocity);

      lastX = e.clientX;
      lastY = e.clientY;
    });

    this.canvas.addEventListener("mouseup", () => {
      isDragging = false;

      // Continue rotation with the last velocity
      this.velocity.x =
        Math.sign(velocityY) *
        Math.min(Math.abs(velocityY), this.settings.maxVelocity);
      this.velocity.y =
        Math.sign(velocityX) *
        Math.min(Math.abs(velocityX), this.settings.maxVelocity);
    });

    this.canvas.addEventListener("mouseleave", () => {
      isDragging = false;
    });
  }

  /**
   * Handles device orientation interactions for rotating the tag cloud.
   * @private
   */
  _bindOrientation() {
    if (!this.settings.enableOrientation) return;

    let lastUpdate = 0;
    const throttleDelay = 100; // Update every 100ms

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
   * Attaches mouse interaction events for the tag cloud.
   * @private
   */
  _attachInteraction() {
    this.canvas.addEventListener("click", this._onCanvasClick.bind(this));
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
    if (tag) this._events.tagClick.forEach((cb) => cb(tag));
  }

  _onCanvasMouseMove(e) {
    const pt = this._getPointer(e);
    const tag = this._getTagAt(pt);
    if (tag && tag.index !== this._hoveredIndex) {
      if (this._hoveredIndex !== null) {
        const prev = this.tags[this._hoveredIndex];
        this._events.tagLeave.forEach((cb) => cb(prev));
      }
      this._hoveredIndex = tag.index;
      this._events.tagHover.forEach((cb) => cb(tag));
    } else if (!tag && this._hoveredIndex !== null) {
      const prev = this.tags[this._hoveredIndex];
      this._events.tagLeave.forEach((cb) => cb(prev));
      this._hoveredIndex = null;
    }
  }

  _onCanvasMouseLeave() {
    if (this._hoveredIndex !== null) {
      const prev = this.tags[this._hoveredIndex];
      this._events.tagLeave.forEach((cb) => cb(prev));
      this._hoveredIndex = null;
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
    const shape = this.settings.shape || "sphere";

    switch (shape) {
      case "cube":
        const side = Math.ceil(Math.cbrt(N));
        this.tags.forEach((tag, i) => {
          const x = (i % side) - side / 2 + 0.5;
          const y = (Math.floor(i / side) % side) - side / 2 + 0.5;
          const z = Math.floor(i / (side * side)) - side / 2 + 0.5;
          tag.x = x * (R / side) * 2;
          tag.y = y * (R / side) * 2;
          tag.z = z * (R / side) * 2;
        });
        break;
      case "pyramid":
        let currentIndex = 0;
        const levels = Math.ceil(Math.sqrt(N));
        for (let level = 0; level < levels; level++) {
          const levelSize = levels - level;
          const height = (R / levels) * level;
          const levelRadius = (R / levels) * (levels - level);

          for (let i = 0; i < levelSize * levelSize && currentIndex < N; i++) {
            const row = Math.floor(i / levelSize) - levelSize / 2 + 0.5;
            const col = (i % levelSize) - levelSize / 2 + 0.5;

            this.tags[currentIndex].x = (col * levelRadius) / levelSize;
            this.tags[currentIndex].y = -height;
            this.tags[currentIndex].z = (row * levelRadius) / levelSize;

            currentIndex++;
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
        const heightStep = (2 * R) / N;
        const circumferenceTags = Math.ceil(Math.sqrt(N));
        const verticalTags = Math.ceil(N / circumferenceTags);

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
      case "sphere":
      default:
        this.tags.forEach((tag, i) => {
          const k = -1 + (2 * i) / (N - 1);
          const phi = Math.acos(k);
          const theta = Math.sqrt(N * Math.PI) * phi;
          tag.x = R * Math.sin(phi) * Math.cos(theta);
          tag.y = R * Math.sin(phi) * Math.sin(theta);
          tag.z = R * Math.cos(phi);
        });
        break;
    }
  }

  _draw() {
    const { ctx, canvas, center } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sortedTags = [...this.tags].sort((a, b) => b.z - a.z);

    for (const tag of sortedTags) {
      const scale = (center.x * 2) / (center.x * 2 + tag.z);
      const x = tag.x * scale + center.x;
      const y = tag.y * scale + center.y;
      const fontSize = (tag.fontSize || 15) * scale;
      const text = tag.text || "";

      const minOpacity = 0.2;
      const maxOpacity = 1.0;
      const normalizedZ = (tag.z + center.x) / (2 * center.x);
      let opacity = Math.max(
        minOpacity,
        maxOpacity - normalizedZ * (maxOpacity - minOpacity)
      );
      opacity = Math.round(opacity * 10) / 10;
      ctx.globalAlpha = opacity;
      ctx.fillStyle = tag.color || "#fff";
      ctx.font = `${fontSize}px sans-serif`;
      const metrics = ctx.measureText(text);
      tag._screen = {
        x,
        y,
        width: metrics.width,
        height: fontSize,
      };
      ctx.fillText(text, x - metrics.width / 2, y + fontSize / 2);
    }
  }

  _animate() {
    if (this.settings.paused) return;

    this.rotation.x +=
      (this.velocity.x - this.rotation.x) * this.settings.easing;
    this.rotation.y +=
      (this.velocity.y - this.rotation.y) * this.settings.easing;

    this.rotation.x += this.settings.speed;
    this.rotation.y += this.settings.speed;

    const shape = this.settings.shape || "sphere";
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

    this._draw();

    this.animFrame = requestAnimationFrame(this._animate.bind(this));
  }

  /**
   * Pauses the animation of the tag cloud.
   */
  pause() {
    this.settings.paused = true;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._events.pause?.forEach((cb) => cb());
  }

  /**
   * Resumes the animation of the tag cloud.
   */
  resume() {
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
    this.canvas.removeEventListener("touchstart", this._bindTouch);
    this.canvas.removeEventListener("mousemove", this._onCanvasMouseMove);
    this.canvas.removeEventListener("mouseleave", this._onCanvasMouseLeave);
    this.canvas.removeEventListener("click", this._onCanvasClick);
    window.removeEventListener("deviceorientation", this._bindOrientation);
    this.canvas.replaceWith(this.canvas.cloneNode(true));
    this.tags = [];
  }
}
export default Orbity;
