# shatter.js

Destroy any DOM element with physics-driven fragment animations. Zero dependencies.

**[Live Demo](https://devpnal.github.io/shatter-js)** — A very serious enterprise website that is definitely unbreakable.

![Animation](https://github.com/user-attachments/assets/5bb94f16-5699-4b56-bc15-f1f3d2122739)

---

## Install

Just drop `shatter.js` into your project. That's it.

---

## Usage

```js
// Shatter with default glass effect
shatter(document.getElementById('my-element'));

// Shatter with pixel effect
shatter(element, { material: 'pixel' });

// Shatter from a specific impact point (e.g. click position)
element.addEventListener('click', (e) => {
  shatter(element, {
    material: 'glass',
    impactX: e.clientX,
    impactY: e.clientY,
  });
});
```

After shattering, the element gets `visibility: hidden` and `data-shattered="true"`. To restore:

```js
element.style.visibility = 'visible';
element.dataset.shattered = 'false';
```

---

## Materials

| Material | Look | Pieces | Speed |
|----------|------|--------|-------|
| `glass`  | Sharp shards with sparkle particles and edge highlights | 35 | Fast |
| `pixel`  | Retro pixel grid dissolve | 60 | Moderate |

```js
// Glass (default)
shatter(el);

// Pixel
shatter(el, { material: 'pixel' });
```

---

## Options

Every material property can be overridden:

```js
shatter(element, {
  material: 'glass',     // 'glass' | 'pixel'
  pieces: 50,            // number of fragments
  gravity: 920,          // pixels/s² downward force
  spread: 280,           // explosion force
  rotationSpeed: 6,      // fragment spin speed
  lifetime: 1.8,         // seconds before fragments fade
  fadeStart: 0.5,        // 0-1, when fade begins relative to lifetime
  opacity: 0.85,         // fragment opacity
  edgeColor: 'rgba(180,220,255,0.5)', // fragment edge highlight
  sparkle: true,         // emit sparkle particles
  crackLines: true,      // visible crack lines on edges
  impactX: 300,          // impact point X (viewport coords)
  impactY: 200,          // impact point Y (viewport coords)
});
```

---

## Quick Recipes

**Delete button that destroys itself:**

```js
document.querySelector('.delete-btn').addEventListener('click', function(e) {
  shatter(this, { impactX: e.clientX, impactY: e.clientY });
});
```

**Make every card on the page shatterable:**

```js
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', (e) => {
    shatter(card, {
      material: 'glass',
      impactX: e.clientX,
      impactY: e.clientY,
    });
  });
});
```

**404 page — auto-shatter the error message:**

```js
window.addEventListener('load', () => {
  setTimeout(() => shatter(document.querySelector('.error-box')), 1000);
});
```

**Toast notification dismiss:**

```js
function dismissToast(toastEl, e) {
  shatter(toastEl, {
    material: 'pixel',
    pieces: 40,
    impactX: e.clientX,
    impactY: e.clientY,
  });
}
```

---

## How It Works

1. **Capture** — The target element is rendered onto an offscreen `<canvas>` via computed styles + text measurement
2. **Fragment** — The rectangle is recursively split with random cutting lines into polygon shards (no grid sampling, pure geometry)
3. **Simulate** — Each fragment gets velocity based on distance from impact point, then gravity, air resistance, and rotation are applied per frame
4. **Render** — Fragments are drawn on a fixed fullscreen `<canvas>` overlay, clipped to their polygon shape, textured with the captured image

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires `<canvas>` and `requestAnimationFrame`.

---

## License

MIT
