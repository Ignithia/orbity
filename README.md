# Orbity JS Library

Orbity is a JavaScript library for creating and managing a 3D tag cloud visualization. It allows you to display tags in various shapes and provides interactive features for user engagement.

## Features

- 3D tag cloud rendering
- Multiple shapes (sphere, cube, pyramid, helix, ring, vertical ring, cylinder)
- Touch and mouse interaction support
- Device orientation support
- Customizable settings (radius, speed, easing, etc.)

## Installation

You can include the library in your project by using a CDN link to the minified version:

```html
<script src="https://cdn.example.com/orbity.min.js"></script>
```

Alternatively, you can install it via npm:

```bash
npm install orbity-js-library
```

## Usage

To create a 3D tag cloud, follow these steps:

1. Include the library in your HTML file (if using CDN).
2. Create an HTML canvas element in your document.

```html
<canvas id="tagCloudCanvas"></canvas>
```

3. Initialize the Orbity instance in your JavaScript code:

```javascript
const canvas = document.getElementById("tagCloudCanvas");
const orbity = new Orbity(canvas, {
  radius: 200,
  speed: 0.01,
  shape: "sphere",
});
```

4. Set the tags to be displayed:

```javascript
orbity.setTags([
  { text: "JavaScript", color: "#f39c12", fontSize: 20 },
  { text: "HTML", color: "#e74c3c", fontSize: 18 },
  { text: "CSS", color: "#3498db", fontSize: 16 },
]);
```

5. Enjoy the interactive 3D tag cloud!

## API

### `setTags(dataArray)`

Sets the tags to be displayed in the 3D tag cloud.

- **Parameters**:
  - `dataArray`: An array of tag data objects, each containing `text`, `color`, and optional `fontSize`.

### `addTag(tagData)`

Adds a single tag to the 3D tag cloud.

- **Parameters**:
  - `tagData`: An object containing `text`, `color`, and optional `fontSize`.

### `removeTag(index)`

Removes a tag from the 3D tag cloud by its index.

- **Parameters**:
  - `index`: The index of the tag to remove.

### `updateTag(index, data)`

Updates the data of an existing tag.

- **Parameters**:
  - `index`: The index of the tag to update.
  - `data`: An object containing the new data for the tag.

### `clearTags()`

Clears all tags from the 3D tag cloud.

### `updateOptions(newOptions)`

Updates the configuration options for the Orbity instance.

- **Parameters**:
  - `newOptions`: An object containing new configuration options.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
