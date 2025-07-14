# Orbity JS Library

Orbity is a modern, accessible JavaScript/TypeScript library for creating interactive 3D tag clouds. It supports text, image, and SVG tags, multiple shapes, keyboard navigation, and is framework-friendly (React/Vue wrappers included).

## Features

- 3D tag cloud rendering (Sphere, Cube, Torus, Helix, etc.)
- Text, image, or SVG tags
- Touch, mouse, and keyboard interaction
- Device orientation support
- Undo/redo, dynamic tag management
- Accessibility: ARIA, keyboard navigation, focus styles
- Hover/click effects, custom fonts/styles
- ESM & CJS builds, TypeScript types
- React and Vue wrappers
- Unit tested, CI/CD, ready for npm

## Installation

```bash
npm install orbity
```

Or via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/orbity/dist/orbity.min.js"></script>
```

## Usage (Vanilla JS)

```js
import Orbity from "orbity";
const canvas = document.getElementById("tagCloudCanvas");
const orbity = new Orbity(canvas, {
  radius: 200,
  shape: "sphere",
  hoverEffect: true,
  clickEffect: true,
  customFont: "serif",
});
orbity.setTags([
  { text: "JavaScript", color: "#f39c12", fontSize: 20 },
  { imageUrl: "logo.png", color: "#fff" },
  { svg: "<svg ...></svg>", color: "#fff" },
]);
```

## React Usage

```tsx
import ReactOrbity from "orbity/wrappers/ReactOrbity";
<ReactOrbity tags={[{ text: "React", color: "#61dafb" }]} radius={200} />;
```

## Vue Usage

```vue
<VueOrbity :tags="[{ text: 'Vue', color: '#42b883' }]" :radius="200" />
```

## API

See [index.d.ts](./index.d.ts) for full type definitions.

- `setTags(tags: OrbityTag[])`
- `addTag(tag: OrbityTag)`
- `removeTag(index: number)`
- `updateTag(index: number, data: Partial<OrbityTag>)`
- `clearTags()`
- `updateOptions(options: Partial<OrbityOptions>)`
- `undo()`, `redo()`
- `pause()`, `resume()`
- `on(event, callback)`, `off(event, callback)`

## Accessibility

- All tags are keyboard focusable (Tab/Arrow keys)
- ARIA roles and labels on canvas and tags
- Focus styles for keyboard users

## Browser Support

- Chrome, Firefox, Safari, Edge, modern mobile browsers

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
