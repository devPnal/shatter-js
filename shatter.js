/**
 * shatter.js v1.0.0
 * Destroy any DOM element with physics-driven fragment animations.
 * 
 * Usage:
 *   shatter(element)
 *   shatter(element, { material: 'pixel', pieces: 50 })
 * 
 * MIT License
 */

;(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.shatter = factory();
  }
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';

  // ── Material Presets ──────────────────────────────────────
  var MATERIALS = {
    glass: {
      pieces: 35,
      gravity: 920,
      spread: 280,
      rotationSpeed: 6,
      opacity: 0.85,
      fadeStart: 0.5,
      lifetime: 1.8,
      edgeColor: 'rgba(180,220,255,0.5)',
      sparkle: true,
      crackLines: true,
    },
    pixel: {
      pieces: 60,
      gravity: 500,
      spread: 250,
      rotationSpeed: 1,
      opacity: 1,
      fadeStart: 0.5,
      lifetime: 2.0,
      edgeColor: 'none',
      sparkle: false,
      crackLines: false,
      pixelated: true,
    },
  };

  // ── Canvas Overlay ────────────────────────────────────────
  var canvas, ctx, animating = false;
  var activeFragments = [];
  var activeParticles = [];
  var dpr = 1;

  function ensureCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', function() {
    if (canvas) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  });

  // ── Element Capture ───────────────────────────────────────
  function captureElement(el) {
    var rect = el.getBoundingClientRect();
    var w = Math.ceil(rect.width);
    var h = Math.ceil(rect.height);
    var scale = Math.min(dpr, 2);
    var c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    var cx = c.getContext('2d');
    cx.scale(scale, scale);

    var styles = window.getComputedStyle(el);
    var bgColor = styles.backgroundColor || 'transparent';
    var bgImage = styles.backgroundImage;
    var borderRadius = parseFloat(styles.borderRadius) || 0;

    cx.beginPath();
    roundRect(cx, 0, 0, w, h, Math.min(borderRadius, w / 2, h / 2));
    cx.closePath();
    cx.clip();

    if (bgImage && bgImage.indexOf('gradient') !== -1) {
      var colors = (bgImage.match(/rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}/g) || []);
      if (colors.length >= 2) {
        var grad = cx.createLinearGradient(0, 0, w, h);
        for (var i = 0; i < colors.length; i++) grad.addColorStop(i / (colors.length - 1), colors[i]);
        cx.fillStyle = grad;
      } else {
        cx.fillStyle = bgColor;
      }
    } else {
      cx.fillStyle = bgColor;
    }
    cx.fillRect(0, 0, w, h);

    var blw = parseFloat(styles.borderLeftWidth) || 0;
    if (blw > 0) {
      cx.fillStyle = styles.borderLeftColor;
      cx.fillRect(0, 0, blw, h);
    }

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var node;
    cx.textBaseline = 'top';
    while (node = walker.nextNode()) {
      var text = node.textContent.trim();
      if (!text) continue;
      var range = document.createRange();
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      if (!rects.length) continue;
      var cs = window.getComputedStyle(node.parentElement);
      cx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      cx.fillStyle = cs.color;
      cx.fillText(text, rects[0].left - rect.left, rects[0].top - rect.top);
    }

    return { canvas: c, width: w, height: h, scale: scale, rect: rect };
  }

  function roundRect(cx, x, y, w, h, r) {
    cx.moveTo(x + r, y);
    cx.arcTo(x + w, y, x + w, y + h, r);
    cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r);
    cx.arcTo(x, y, x + w, y, r);
  }

  // ── Fragment Generation (fast recursive split) ────────────
  function generateFragments(w, h, numPieces, material) {
    if (material.pixelated) return generatePixelFragments(w, h, numPieces);

    var polys = [[ {x:0,y:0}, {x:w,y:0}, {x:w,y:h}, {x:0,y:h} ]];
    var maxIter = Math.ceil(Math.log2(numPieces)) + 3;

    for (var iter = 0; iter < maxIter && polys.length < numPieces; iter++) {
      var next = [];
      for (var pi = 0; pi < polys.length; pi++) {
        if (polys.length + next.length >= numPieces) { next.push(polys[pi]); continue; }
        var pair = splitPolygon(polys[pi]);
        if (pair[1] && pair[0].length >= 3 && pair[1].length >= 3) {
          next.push(pair[0], pair[1]);
        } else {
          next.push(polys[pi]);
        }
      }
      polys = next;
    }

    return polys.map(function(pts) {
      var cx = 0, cy = 0;
      for (var i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
      cx /= pts.length; cy /= pts.length;
      return { points: pts, cx: cx, cy: cy };
    });
  }

  function splitPolygon(poly) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      if (poly[i].x < minX) minX = poly[i].x;
      if (poly[i].y < minY) minY = poly[i].y;
      if (poly[i].x > maxX) maxX = poly[i].x;
      if (poly[i].y > maxY) maxY = poly[i].y;
    }
    var angle = Math.random() * Math.PI;
    var cx = minX + Math.random() * (maxX - minX);
    var cy = minY + Math.random() * (maxY - minY);
    var nx = Math.cos(angle), ny = Math.sin(angle);
    var sideA = [], sideB = [], n = poly.length;

    for (var i = 0; i < n; i++) {
      var curr = poly[i], next = poly[(i + 1) % n];
      var dC = (curr.x - cx) * nx + (curr.y - cy) * ny;
      var dN = (next.x - cx) * nx + (next.y - cy) * ny;
      if (dC >= 0) sideA.push(curr); else sideB.push(curr);
      if ((dC > 0 && dN < 0) || (dC < 0 && dN > 0)) {
        var t = dC / (dC - dN);
        var pt = { x: curr.x + t * (next.x - curr.x), y: curr.y + t * (next.y - curr.y) };
        sideA.push(pt); sideB.push(pt);
      }
    }
    if (sideA.length < 3 || sideB.length < 3) return [poly, null];

    var sortByAngle = function(pts) {
      var scx = 0, scy = 0;
      for (var i = 0; i < pts.length; i++) { scx += pts[i].x; scy += pts[i].y; }
      scx /= pts.length; scy /= pts.length;
      return pts.sort(function(a, b) {
        return Math.atan2(a.y - scy, a.x - scx) - Math.atan2(b.y - scy, b.x - scx);
      });
    };
    return [sortByAngle(sideA), sortByAngle(sideB)];
  }

  function generatePixelFragments(w, h, numPieces) {
    var pixelSize = Math.max(8, Math.floor(Math.sqrt((w * h) / numPieces)));
    var frags = [];
    for (var y = 0; y < h; y += pixelSize) {
      for (var x = 0; x < w; x += pixelSize) {
        var pw = Math.min(pixelSize, w - x), ph = Math.min(pixelSize, h - y);
        frags.push({
          points: [{x:x,y:y},{x:x+pw,y:y},{x:x+pw,y:y+ph},{x:x,y:y+ph}],
          cx: x + pw / 2, cy: y + ph / 2,
        });
      }
    }
    return frags;
  }

  // ── Physics ───────────────────────────────────────────────
  function Fragment(poly, imgData, mat, originX, originY, impactX, impactY) {
    this.poly = poly;
    this.imgData = imgData;
    this.mat = mat;
    this.x = originX + poly.cx;
    this.y = originY + poly.cy;

    var dx = poly.cx - impactX, dy = poly.cy - impactY;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var force = mat.spread * (0.5 + Math.random() * 0.8);
    this.vx = (dx / dist) * force * (0.6 + Math.random() * 0.8);
    this.vy = (dy / dist) * force * (0.5 + Math.random()) - 150;
    this.rotation = 0;
    this.angularVel = (Math.random() - 0.5) * mat.rotationSpeed;
    this.scale = 1;
    this.age = 0;
    this.alive = true;
  }

  Fragment.prototype.update = function(dt) {
    if (!this.alive) return;
    this.age += dt;
    this.vy += this.mat.gravity * dt;
    this.vx *= 0.995;
    this.vy *= 0.998;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.angularVel * dt;
    this.angularVel *= 0.99;
    if (this.age > this.mat.lifetime) this.alive = false;
  };

  Fragment.prototype.getOpacity = function() {
    var t = this.age / this.mat.lifetime;
    if (t < this.mat.fadeStart) return this.mat.opacity;
    return this.mat.opacity * (1 - (t - this.mat.fadeStart) / (1 - this.mat.fadeStart));
  };

  function Particle(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.vx = (Math.random() - 0.5) * 200;
    this.vy = (Math.random() - 0.5) * 200 - 80;
    this.age = 0;
    this.lifetime = 0.5 + Math.random() * 1.0;
    this.size = type === 'sparkle' ? 1.5 + Math.random() * 2.5 : 2 + Math.random() * 4;
    this.alive = true;
  }

  Particle.prototype.update = function(dt) {
    this.age += dt;
    this.vy += 300 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.age > this.lifetime) this.alive = false;
  };

  // ── Render Loop ───────────────────────────────────────────
  var lastTime = 0;

  function startAnimation() {
    animating = true;
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  function tick(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    var vw = window.innerWidth, vh = window.innerHeight;
    ctx.clearRect(0, 0, vw, vh);

    for (var i = activeFragments.length - 1; i >= 0; i--) {
      var f = activeFragments[i];
      f.update(dt);
      if (!f.alive) { activeFragments.splice(i, 1); continue; }
      drawFragment(f);
    }

    for (var i = activeParticles.length - 1; i >= 0; i--) {
      var p = activeParticles[i];
      p.update(dt);
      if (!p.alive) { activeParticles.splice(i, 1); continue; }
      drawParticle(p);
    }

    if (activeFragments.length > 0 || activeParticles.length > 0) {
      requestAnimationFrame(tick);
    } else {
      animating = false;
    }
  }

  function drawFragment(f) {
    var opacity = f.getOpacity();
    if (opacity <= 0) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.scale(f.scale, f.scale);
    ctx.globalAlpha = opacity;

    var pts = f.poly.points;
    ctx.beginPath();
    ctx.moveTo(pts[0].x - f.poly.cx, pts[0].y - f.poly.cy);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x - f.poly.cx, pts[i].y - f.poly.cy);
    ctx.closePath();
    ctx.clip();

    var cap = f.imgData;
    ctx.drawImage(cap.canvas, 0, 0, cap.canvas.width, cap.canvas.height, -f.poly.cx, -f.poly.cy, cap.width, cap.height);

    if (f.mat.edgeColor && f.mat.edgeColor !== 'none') {
      ctx.strokeStyle = f.mat.edgeColor;
      ctx.lineWidth = f.mat.crackLines ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x - f.poly.cx, pts[0].y - f.poly.cy);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x - f.poly.cx, pts[i].y - f.poly.cy);
      ctx.closePath();
      ctx.stroke();
    }

    if (f.mat.sparkle && Math.random() > 0.85) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }

  function drawParticle(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.lifetime);
    if (p.type === 'sparkle') {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#8cf';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = 'rgba(160,150,140,0.6)';
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────
  function shatter(el, options) {
    options = options || {};
    var matName = options.material || 'glass';
    var mat = {};
    var base = MATERIALS[matName] || MATERIALS.glass;
    for (var k in base) mat[k] = base[k];
    for (var k in options) mat[k] = options[k];

    var capture = captureElement(el);
    var rect = capture.rect;
    var frags = generateFragments(capture.width, capture.height, mat.pieces, mat);
    var impactX = (options.impactX != null) ? options.impactX - rect.left : capture.width / 2;
    var impactY = (options.impactY != null) ? options.impactY - rect.top : capture.height / 2;

    el.style.visibility = 'hidden';
    el.dataset.shattered = 'true';

    ensureCanvas();

    for (var i = 0; i < frags.length; i++) {
      activeFragments.push(new Fragment(frags[i], capture, mat, rect.left, rect.top, impactX, impactY));
    }

    if (mat.sparkle) {
      for (var i = 0; i < 25; i++) {
        activeParticles.push(new Particle(rect.left + impactX, rect.top + impactY, 'sparkle'));
      }
    }

    if (!animating) startAnimation();
  }

  shatter.MATERIALS = MATERIALS;
  return shatter;
});
