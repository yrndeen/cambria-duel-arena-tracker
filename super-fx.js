document.addEventListener("DOMContentLoaded", () => {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const navbar = document.querySelector("header.navbar");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isActive = navToggle.classList.toggle("active");
      navLinks.classList.toggle("active");
      navToggle.setAttribute("aria-expanded", isActive);
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navToggle.classList.remove("active");
        navLinks.classList.remove("active");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function updateScrollChrome() {
    const scrolled = window.scrollY > 30;
    document.documentElement.classList.toggle("page-scrolled", scrolled);
    if (navbar) {
      navbar.classList.toggle("scrolled", scrolled);
      navbar.classList.toggle("is-scrolled", scrolled);
    }
  }

  let scrollTicking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          updateScrollChrome();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    },
    { passive: true }
  );
  updateScrollChrome();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () => window.innerWidth < 768;

  if (!reduceMotion && !isMobile()) {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg) translateY(-3px)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
      });
    });
  }

  const canvas = document.getElementById("wind");
  if (!canvas || reduceMotion) return;

  const ctx = canvas.getContext("2d");
  let streaks = [];
  let stars = [];
  let bolts = [];
  let w;
  let h;
  let animRunning = true;
  let frame = 0;

  const WARM = [
    [255, 140, 90],
    [255, 90, 31],
    [255, 122, 60],
    [255, 61, 46],
    [255, 200, 160],
    [255, 180, 120]
  ];

  function pickColor() {
    return WARM[Math.floor(Math.random() * WARM.length)];
  }

  function buildBoltPoints(x1, y1, x2, y2, displace) {
    if (displace < 5) {
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * displace;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * displace;
    const a = buildBoltPoints(x1, y1, mx, my, displace * 0.52);
    const b = buildBoltPoints(mx, my, x2, y2, displace * 0.52);
    return [...a.slice(0, -1), ...b];
  }

  function randomBoltEnds() {
    const r = Math.random();
    if (r < 0.38) {
      return {
        x1: Math.random() * w,
        y1: -40 - Math.random() * 120,
        x2: Math.random() * w * 0.85 + w * 0.08,
        y2: h + 50 + Math.random() * 40
      };
    }
    if (r < 0.68) {
      return {
        x1: -50 - Math.random() * 100,
        y1: Math.random() * h * 0.55,
        x2: w + 50 + Math.random() * 80,
        y2: Math.random() * h * 0.45 + h * 0.25
      };
    }
    return {
      x1: w + 40 + Math.random() * 60,
      y1: Math.random() * h * 0.45,
      x2: -50 - Math.random() * 80,
      y2: Math.random() * h * 0.55 + h * 0.2
    };
  }

  function strokeBoltPath(points, alpha, wide, colorRgb) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const [r, g, b] = colorRgb;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = wide;
    ctx.stroke();
  }

  function drawLightningBolt(bolt) {
    const t = bolt.age / bolt.maxAge;
    const fade = 1 - t * t;
    const flick = 0.75 + 0.25 * Math.sin(frame * 0.8 + bolt.seed);
    const a = fade * flick;

    strokeBoltPath(bolt.points, a * 0.35, 10, [180, 60, 20]);
    strokeBoltPath(bolt.points, a * 0.55, 5, [255, 100, 40]);
    strokeBoltPath(bolt.points, a * 0.85, 2.2, [255, 220, 200]);
    strokeBoltPath(bolt.points, a, 0.9, [255, 255, 255]);

    if (bolt.branch && bolt.branch.length > 1) {
      strokeBoltPath(bolt.branch, a * 0.32, 4, [255, 61, 46]);
      strokeBoltPath(bolt.branch, a * 0.75, 1, [255, 230, 210]);
    }
  }

  class LightningBolt {
    constructor() {
      this.seed = Math.random() * 1000;
      const e = randomBoltEnds();
      const dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      this.points = buildBoltPoints(e.x1, e.y1, e.x2, e.y2, dist * 0.38);
      this.age = 0;
      this.maxAge = 14 + Math.floor(Math.random() * 28);
      this.branch = null;
      if (Math.random() < 0.42 && this.points.length > 5) {
        const i = Math.floor(this.points.length * (0.35 + Math.random() * 0.25));
        const p = this.points[i];
        const ang = (Math.random() - 0.5) * 2.2;
        const len = 60 + Math.random() * (isMobile() ? 80 : 160);
        const ex = p.x + Math.cos(ang) * len + (Math.random() - 0.5) * 40;
        const ey = p.y + Math.sin(ang) * len + (Math.random() - 0.5) * 40;
        this.branch = buildBoltPoints(p.x, p.y, ex, ey, len * 0.42);
      }
    }

    update() {
      this.age += 1;
      return this.age < this.maxAge;
    }
  }

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", () => {
    resize();
    streaks = [];
    stars = [];
    bolts = [];
    init();
  });

  document.addEventListener("visibilitychange", () => {
    animRunning = !document.hidden;
    if (animRunning) animate();
  });

  class GalaxyStar {
    constructor() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.r = Math.random() * 1.1 + 0.25;
      this.base = 0.1 + Math.random() * 0.48;
      this.tw = 0.015 + Math.random() * 0.04;
      this.phase = Math.random() * Math.PI * 2;
    }

    draw(t) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * this.tw + this.phase);
      const a = this.base * twinkle;
      ctx.fillStyle = `rgba(255, 230, 215, ${a})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class WindStreak {
    constructor() {
      this.reset(true);
    }

    reset(init) {
      this.rgb = pickColor();
      this.x = init ? Math.random() * w : -200;
      this.y = Math.random() * h;
      this.len = isMobile() ? 30 + Math.random() * 60 : 60 + Math.random() * 140;
      this.speed = isMobile() ? 1 + Math.random() * 2 : 2 + Math.random() * 4;
      this.opacity = isMobile() ? 0.026 + Math.random() * 0.05 : 0.045 + Math.random() * 0.09;
      this.thickness = isMobile() ? 0.5 + Math.random() * 0.8 : 0.8 + Math.random() * 1.5;
      this.wobbleAmp = isMobile() ? 0.2 + Math.random() * 0.5 : 0.5 + Math.random() * 1.2;
      this.wobbleFreq = 0.004 + Math.random() * 0.008;
      this.phase = Math.random() * Math.PI * 2;
      this.t = Math.random() * 1000;
    }

    update() {
      this.t += 1;
      this.x += this.speed;
      if (this.x - this.len > w) this.reset(false);
    }

    draw() {
      const [r, g, b] = this.rgb;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${this.opacity})`;
      ctx.lineWidth = this.thickness;
      ctx.lineCap = "round";
      const segments = isMobile() ? 6 : 12;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const px = this.x + t * this.len;
        const py = this.y + Math.sin(this.t * this.wobbleFreq + this.phase + t * 3) * this.wobbleAmp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  class DustParticle {
    constructor() {
      this.reset(true);
    }

    reset(init) {
      this.rgb = pickColor();
      this.x = init ? Math.random() * w : -10;
      this.y = Math.random() * h;
      this.size = isMobile() ? 0.5 + Math.random() * 1 : 0.8 + Math.random() * 2;
      this.speed = isMobile() ? 0.4 + Math.random() * 1 : 0.8 + Math.random() * 2;
      this.opacity = isMobile() ? 0.032 + Math.random() * 0.07 : 0.06 + Math.random() * 0.14;
      this.drift = (Math.random() - 0.5) * 0.4;
    }

    update() {
      this.x += this.speed;
      this.y += this.drift;
      if (this.x > w + 10) this.reset(false);
      if (this.y < -10 || this.y > h + 10) this.drift *= -1;
    }

    draw() {
      const [r, g, b] = this.rgb;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.opacity})`;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function init() {
    const mob = isMobile();
    const starCount = mob ? 85 : 165;
    const streakCount = mob ? Math.min(14, Math.floor(w / 60)) : Math.min(38, Math.floor(w / 32));
    const dustCount = mob
      ? Math.min(18, Math.floor((w * h) / 45000))
      : Math.min(58, Math.floor((w * h) / 17000));
    for (let i = 0; i < starCount; i++) stars.push(new GalaxyStar());
    for (let i = 0; i < streakCount; i++) streaks.push(new WindStreak());
    for (let i = 0; i < dustCount; i++) streaks.push(new DustParticle());
  }

  function maybeSpawnBolt() {
    const mob = isMobile();
    const cap = mob ? 5 : 12;
    const chance = mob ? 0.024 : 0.038;
    if (bolts.length < cap && Math.random() < chance) {
      bolts.push(new LightningBolt());
    }
  }

  function animate() {
    if (!animRunning) return;
    frame += 1;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    stars.forEach((s) => s.draw(frame));
    streaks.forEach((s) => {
      s.update();
      s.draw();
    });
    maybeSpawnBolt();
    bolts = bolts.filter((b) => {
      drawLightningBolt(b);
      return b.update();
    });
    ctx.restore();
    requestAnimationFrame(animate);
  }

  init();
  animate();
});
