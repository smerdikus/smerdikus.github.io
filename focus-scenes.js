(function () {
  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);

    ctx.beginPath();

    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
      return;
    }

    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  class PanelPointer {
    constructor(element) {
      this.element = element;
      this.x = 0.5;
      this.y = 0.5;
      this.active = false;
      this.clickHandlers = [];

      element.addEventListener("mousemove", (event) => {
        this.updateFromClientPoint(event.clientX, event.clientY);
        this.active = true;
      });

      element.addEventListener("mouseleave", () => {
        this.active = false;
      });

      element.addEventListener(
        "touchmove",
        (event) => {
          if (!event.touches.length) {
            return;
          }

          this.updateFromClientPoint(
            event.touches[0].clientX,
            event.touches[0].clientY
          );
          this.active = true;
        },
        { passive: true }
      );

      element.addEventListener("touchend", () => {
        this.active = false;
      });

      element.addEventListener("click", (event) => {
        this.updateFromClientPoint(event.clientX, event.clientY);
        for (const handler of this.clickHandlers) {
          handler(this.x, this.y);
        }
      });
    }

    updateFromClientPoint(clientX, clientY) {
      const rect = this.element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      this.x = (clientX - rect.left) / rect.width;
      this.y = (clientY - rect.top) / rect.height;
    }

    onClick(handler) {
      this.clickHandlers.push(handler);
    }
  }

  class BaseScene {
    constructor(canvas, panel) {
      this.canvas = canvas;
      this.panel = panel;
      this.ctx = canvas.getContext("2d");
      this.pointer = new PanelPointer(panel);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = 0;
      this.h = 0;
      this.initialized = false;
      this.resize();
    }

    resize() {
      const rect = this.panel.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) {
        return false;
      }

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.floor(rect.width);
      this.h = Math.floor(rect.height);
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.canvas.style.width = `${this.w}px`;
      this.canvas.style.height = `${this.h}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (typeof this.initScene === "function") {
        this.initScene();
      }

      this.initialized = true;
      return true;
    }
  }

  class AIScene extends BaseScene {
    initScene() {
      this.nodes = [];
      this.edges = [];
      this.pulses = [];
      this.shocks = [];

      const nodeCounts = this.w < 640 ? [4, 6, 7, 6, 4] : [6, 9, 12, 9, 6];
      const marginX = this.w * 0.12;
      const marginY = this.h * 0.18;
      const usableW = this.w - marginX * 2;
      const usableH = this.h - marginY * 2;

      for (let layer = 0; layer < nodeCounts.length; layer += 1) {
        const count = nodeCounts[layer];
        const x = marginX + (usableW * layer) / (nodeCounts.length - 1);

        for (let index = 0; index < count; index += 1) {
          this.nodes.push({
            id: `${layer}-${index}`,
            layer,
            x,
            y: marginY + (usableH * (index + 1)) / (count + 1),
            r: 4 + Math.random() * 5,
            bias: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.2,
            shock: 0,
          });
        }
      }

      for (const a of this.nodes) {
        for (const b of this.nodes) {
          if (b.layer === a.layer + 1) {
            this.edges.push({
              a,
              b,
              weight: 0.3 + Math.random() * 0.7,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
      }

      this.pointer.clickHandlers = [];
      this.pointer.onClick((x, y) => this.handleClick(x * this.w, y * this.h));
      this.pulseClock = 0;
    }

    handleClick(px, py) {
      let best = null;
      let bestDistance = Infinity;

      for (const node of this.nodes) {
        const distance = Math.hypot(node.x - px, node.y - py);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = node;
        }
      }

      if (!best || bestDistance > 40) {
        return;
      }

      this.shocks.push({ x: best.x, y: best.y, life: 1 });
      best.shock = 1;

      const outgoing = this.edges.filter((edge) => edge.a === best);
      for (const edge of outgoing) {
        this.pulses.push({ edge, p: 0, speed: 0.02, burst: true });
        edge.b.shock = Math.max(edge.b.shock, 0.85);
        this.shocks.push({ x: edge.b.x, y: edge.b.y, life: 0.9 });
      }
    }

    updatePulses() {
      this.pulseClock += 1;

      if (this.pulseClock % 8 === 0 && this.edges.length) {
        const edge = this.edges[Math.floor(Math.random() * this.edges.length)];
        this.pulses.push({
          edge,
          p: 0,
          speed: 0.007 + Math.random() * 0.014,
          burst: false,
        });
      }

      this.pulses = this.pulses.filter((pulse) => {
        pulse.p += pulse.speed;
        return pulse.p <= 1.05;
      });

      this.shocks = this.shocks.filter((shock) => {
        shock.life -= 0.025;
        return shock.life > 0;
      });

      for (const node of this.nodes) {
        node.shock *= 0.95;
      }
    }

    render(t) {
      if (!this.initialized) {
        return;
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      const gradient = ctx.createRadialGradient(
        this.w * 0.2,
        this.h * 0.18,
        10,
        this.w * 0.2,
        this.h * 0.18,
        this.w * 0.95
      );
      gradient.addColorStop(0, "rgba(59, 130, 246, 0.14)");
      gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.w, this.h);

      this.updatePulses();

      for (const edge of this.edges) {
        const mx = this.pointer.active ? this.pointer.x * this.w : this.w * 0.5;
        const my = this.pointer.active ? this.pointer.y * this.h : this.h * 0.5;
        const cx = (edge.a.x + edge.b.x) * 0.5;
        const cy = (edge.a.y + edge.b.y) * 0.5;
        const distance = Math.hypot(cx - mx, cy - my);
        const hoverBoost = this.pointer.active
          ? Math.max(0, 1 - distance / 220)
          : 0;
        const edgeShock = Math.max(edge.a.shock, edge.b.shock);
        const alpha =
          0.05 + edge.weight * 0.06 + hoverBoost * 0.16 + edgeShock * 0.18;
        const bend = Math.sin(t * 1.1 + edge.phase) * 10 + hoverBoost * 22;

        ctx.beginPath();
        ctx.moveTo(edge.a.x, edge.a.y);
        ctx.quadraticCurveTo(cx, cy - bend, edge.b.x, edge.b.y);
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
        ctx.lineWidth =
          1 + edge.weight * 0.6 + hoverBoost * 0.9 + edgeShock * 0.8;
        ctx.stroke();
      }

      for (const pulse of this.pulses) {
        const { a, b } = pulse.edge;
        const cx = (a.x + b.x) * 0.5;
        const cy = (a.y + b.y) * 0.5 - Math.sin(t * 1.1 + pulse.edge.phase) * 10;
        const p = pulse.p;
        const x =
          (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * cx + p * p * b.x;
        const y =
          (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * cy + p * p * b.y;

        const glow = ctx.createRadialGradient(
          x,
          y,
          0,
          x,
          y,
          pulse.burst ? 24 : 20
        );
        glow.addColorStop(0, "rgba(255,255,255,0.98)");
        glow.addColorStop(0.35, "rgba(59, 130, 246, 0.92)");
        glow.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, pulse.burst ? 10 : 8, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const shock of this.shocks) {
        ctx.strokeStyle = `rgba(59, 130, 246, ${shock.life * 0.35})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(shock.x, shock.y, (1 - shock.life) * 30 + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const node of this.nodes) {
        const mx = this.pointer.active ? this.pointer.x * this.w : this.w * 0.5;
        const my = this.pointer.active ? this.pointer.y * this.h : this.h * 0.5;
        const distance = Math.hypot(node.x - mx, node.y - my);
        const hoverBoost = this.pointer.active
          ? Math.max(0, 1 - distance / 210)
          : 0;
        const activity =
          0.5 +
          0.5 * Math.sin(t * node.speed + node.bias) +
          hoverBoost * 1.3 +
          node.shock * 1.1;
        const radius = node.r + activity * 2.8;

        const halo = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          radius * 5
        );
        halo.addColorStop(
          0,
          `rgba(59, 130, 246, ${
            0.18 + hoverBoost * 0.26 + node.shock * 0.28
          })`
        );
        halo.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(210, 232, 255, ${
          0.72 + Math.min(activity * 0.2, 0.24)
        })`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  class QuantScene extends BaseScene {
    initScene() {
      this.candles = [];
      this.gridLines = 5;
      this.rebuildSeries();
    }

    rebuildSeries() {
      this.candles = [];
      const count = Math.max(34, Math.min(72, Math.floor(this.w / 24)));

      const baseDrift = 0.00035;
      const lowVol = 0.0065;
      const highVol = 0.015;
      const shockVol = 0.028;

      let price = 100;
      let volRegime = lowVol;

      const randn = () => {
        let u = 0;
        let v = 0;
        while (u === 0) {
          u = Math.random();
        }
        while (v === 0) {
          v = Math.random();
        }
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };

      for (let index = 0; index < count; index += 1) {
        const regimeRoll = Math.random();
        if (regimeRoll < 0.08) {
          volRegime = highVol;
        } else if (regimeRoll < 0.11) {
          volRegime = shockVol;
        } else {
          volRegime = 0.84 * volRegime + 0.16 * lowVol;
        }

        const overnightGap = randn() * volRegime * 0.35;
        const open = price * (1 + overnightGap);
        const intradayReturn = baseDrift + randn() * volRegime;
        const close = open * (1 + intradayReturn);
        const bodyMove = Math.abs(close - open) / Math.max(open, 1e-9);
        const upperWickFraction =
          Math.abs(randn()) * volRegime * (0.45 + Math.random() * 0.55) +
          bodyMove * 0.35;
        const lowerWickFraction =
          Math.abs(randn()) * volRegime * (0.45 + Math.random() * 0.55) +
          bodyMove * 0.35;
        const high = Math.max(open, close) * (1 + upperWickFraction);
        const low =
          Math.min(open, close) * Math.max(0.001, 1 - lowerWickFraction);

        this.candles.push({ open, high, low, close });
        price = close;
      }
    }

    render() {
      if (!this.initialized) {
        return;
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      ctx.fillStyle = "rgba(6, 10, 14, 0.82)";
      ctx.fillRect(0, 0, this.w, this.h);

      const padLeft = 90;
      const padRight = 40;
      const padTop = 120;
      const padBottom = 72;
      const chartX = padLeft;
      const chartY = padTop;
      const chartW = Math.max(120, this.w - padLeft - padRight);
      const chartH = Math.max(120, this.h - padTop - padBottom);

      const prices = this.candles.flatMap((candle) => [
        candle.open,
        candle.high,
        candle.low,
        candle.close,
      ]);
      const rawMin = Math.min(...prices);
      const rawMax = Math.max(...prices);
      const range = Math.max(1, rawMax - rawMin);
      const minPrice = rawMin - range * 0.08;
      const maxPrice = rawMax + range * 0.08;
      const priceToY = (price) =>
        chartY + chartH - ((price - minPrice) / (maxPrice - minPrice)) * chartH;

      ctx.fillStyle = "rgba(255,255,255,0.012)";
      ctx.fillRect(chartX, chartY, chartW, chartH);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(chartX, chartY, chartW, chartH);

      for (let index = 0; index < this.gridLines; index += 1) {
        const y = chartY + (chartH * index) / (this.gridLines - 1);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartW, y);
        ctx.stroke();

        const labelPrice =
          maxPrice - ((maxPrice - minPrice) * index) / (this.gridLines - 1);
        ctx.fillStyle = "rgba(210, 220, 230, 0.55)";
        ctx.font =
          '12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText(labelPrice.toFixed(1), chartX - 10, y + 4);
      }

      const candleStep = chartW / this.candles.length;
      const candleWidth = Math.max(6, Math.min(14, candleStep * 0.58));
      let hovered = -1;
      const mx = this.pointer.active ? this.pointer.x * this.w : -1;
      const my = this.pointer.active ? this.pointer.y * this.h : -1;

      if (
        this.pointer.active &&
        mx >= chartX &&
        mx <= chartX + chartW &&
        my >= chartY &&
        my <= chartY + chartH
      ) {
        hovered = Math.max(
          0,
          Math.min(
            this.candles.length - 1,
            Math.floor((mx - chartX) / candleStep)
          )
        );
      }

      for (let index = 0; index < this.candles.length; index += 1) {
        const candle = this.candles[index];
        const x = chartX + index * candleStep + candleStep * 0.5;
        const yOpen = priceToY(candle.open);
        const yClose = priceToY(candle.close);
        const yHigh = priceToY(candle.high);
        const yLow = priceToY(candle.low);
        const bullish = candle.close >= candle.open;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyBottom = Math.max(yOpen, yClose);
        const bodyHeight = Math.max(4, bodyBottom - bodyTop);
        const isHovered = index === hovered;

        if (isHovered) {
          ctx.fillStyle = "rgba(255,255,255,0.075)";
          ctx.fillRect(x - candleStep * 0.7, chartY, candleStep * 1.4, chartH);

          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x - candleStep * 0.7, chartY, candleStep * 1.4, chartH);
        }

        ctx.strokeStyle = bullish
          ? "rgba(16,185,129,0.95)"
          : "rgba(239,68,68,0.95)";
        ctx.lineWidth = isHovered ? 2.8 : 1.3;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        ctx.fillStyle = bullish
          ? "rgba(16,185,129,0.32)"
          : "rgba(239,68,68,0.32)";
        ctx.strokeStyle = bullish
          ? "rgba(16,185,129,1)"
          : "rgba(239,68,68,1)";
        ctx.lineWidth = isHovered ? 2.2 : 1.3;
        ctx.beginPath();
        ctx.rect(x - candleWidth * 0.5, bodyTop, candleWidth, bodyHeight);
        ctx.fill();
        ctx.stroke();

        if (isHovered) {
          ctx.strokeStyle = "rgba(255,255,255,0.32)";
          ctx.lineWidth = 1.4;
          ctx.strokeRect(
            x - candleWidth * 0.5 - 3,
            bodyTop - 3,
            candleWidth + 6,
            bodyHeight + 6
          );
        }
      }

      const last = this.candles[this.candles.length - 1];
      const lastY = priceToY(last.close);
      const lastBull = last.close >= last.open;
      ctx.strokeStyle = lastBull
        ? "rgba(16,185,129,0.32)"
        : "rgba(239,68,68,0.32)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(chartX, lastY);
      ctx.lineTo(chartX + chartW, lastY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hovered >= 0) {
        const candle = this.candles[hovered];
        const x = chartX + hovered * candleStep + candleStep * 0.5;
        const yMid = priceToY((candle.high + candle.low) * 0.5);

        ctx.strokeStyle = "rgba(255,255,255,0.24)";
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(x, chartY);
        ctx.lineTo(x, chartY + chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        const boxW = 166;
        const boxH = 88;
        let boxX = x + 18;
        let boxY = yMid - boxH * 0.5;

        if (boxX + boxW > chartX + chartW) {
          boxX = x - boxW - 18;
        }
        boxY = Math.max(
          chartY + 8,
          Math.min(chartY + chartH - boxH - 8, boxY)
        );

        ctx.fillStyle = "rgba(8, 12, 16, 0.96)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        roundedRect(ctx, boxX, boxY, boxW, boxH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(233,239,245,0.9)";
        ctx.font =
          '12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = "left";
        const ret = ((candle.close / candle.open) - 1) * 100;
        ctx.fillText(`Open   ${candle.open.toFixed(2)}`, boxX + 12, boxY + 22);
        ctx.fillText(`High   ${candle.high.toFixed(2)}`, boxX + 12, boxY + 40);
        ctx.fillText(`Low    ${candle.low.toFixed(2)}`, boxX + 12, boxY + 58);
        ctx.fillText(
          `Close  ${candle.close.toFixed(2)}`,
          boxX + 12,
          boxY + 76
        );
        ctx.fillStyle =
          ret >= 0 ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)";
        ctx.fillText(
          `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`,
          boxX + 102,
          boxY + 22
        );
      }
    }
  }

  class QuantumScene extends BaseScene {
    initScene() {
      this.qubits = [];
      this.particles = [];
      this.clickBursts = [];
      const area = this.w * this.h;
      const qubitCount = Math.max(10, Math.min(22, Math.floor(area / 42000)));
      const particleCount = Math.max(
        60,
        Math.min(140, Math.floor(area / 11000))
      );
      const margin = 60;

      for (let index = 0; index < qubitCount; index += 1) {
        this.qubits.push({
          x: margin + Math.random() * Math.max(40, this.w - margin * 2),
          y: margin + Math.random() * Math.max(40, this.h - margin * 2),
          r: 20 + Math.random() * 34,
          speed: 0.35 + Math.random() * 0.9,
          phase: Math.random() * Math.PI * 2,
          tilt: Math.random() * Math.PI,
          hue: Math.random(),
          pulse: 0.7 + Math.random() * 0.9,
          orbiters: 1 + Math.floor(Math.random() * 3),
          excited: 0,
        });
      }

      for (let index = 0; index < particleCount; index += 1) {
        this.particles.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          s: 0.6 + Math.random() * 2.4,
          vy: 0.12 + Math.random() * 0.38,
          vx: -0.15 + Math.random() * 0.3,
          a: 0.08 + Math.random() * 0.18,
          p: Math.random() * Math.PI * 2,
        });
      }

      this.pointer.clickHandlers = [];
      this.pointer.onClick((x, y) => this.handleClick(x * this.w, y * this.h));
    }

    handleClick(px, py) {
      this.clickBursts.push({ x: px, y: py, life: 1 });
      for (const qubit of this.qubits) {
        const distance = Math.hypot(qubit.x - px, qubit.y - py);
        if (distance < 180) {
          qubit.excited = Math.max(qubit.excited, 1 - distance / 180);
        }
      }
    }

    drawGrid(t) {
      const ctx = this.ctx;
      const spacing = 58;
      const offsetX = (t * 8) % spacing;
      const offsetY = (t * 5) % spacing;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(139, 92, 246, 0.045)";

      for (let x = -spacing; x <= this.w + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, 0);
        ctx.lineTo(x + offsetX, this.h);
        ctx.stroke();
      }

      for (let y = -spacing; y <= this.h + spacing; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + offsetY);
        ctx.lineTo(this.w, y + offsetY);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawWaveField(t) {
      const ctx = this.ctx;
      const lines = 5;

      for (let index = 0; index < lines; index += 1) {
        const baseY = this.h * (0.14 + index * 0.16);
        ctx.beginPath();

        for (let x = 0; x <= this.w; x += 8) {
          const y =
            baseY +
            Math.sin(x * 0.012 + t * 1.4 + index) * 12 +
            Math.cos(x * 0.005 + t * 0.9 + index * 1.7) * 9;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = `rgba(139, 92, 246, ${0.035 + index * 0.013})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    drawEntanglement(t) {
      const ctx = this.ctx;
      const maxDist = Math.min(320, Math.max(220, this.w * 0.24));
      const mx = this.pointer.active ? this.pointer.x * this.w : this.w * 0.5;
      const my = this.pointer.active ? this.pointer.y * this.h : this.h * 0.5;

      for (let i = 0; i < this.qubits.length; i += 1) {
        for (let j = i + 1; j < this.qubits.length; j += 1) {
          const a = this.qubits[i];
          const b = this.qubits[j];
          const ax = a.x + Math.sin(t * 0.12 + a.phase) * 10;
          const ay = a.y + Math.cos(t * 0.14 + a.phase * 1.2) * 8;
          const bx = b.x + Math.sin(t * 0.12 + b.phase) * 10;
          const by = b.y + Math.cos(t * 0.14 + b.phase * 1.2) * 8;
          const distance = Math.hypot(bx - ax, by - ay);

          if (distance < maxDist) {
            const alpha = (1 - distance / maxDist) * 0.16;
            const centerX = (ax + bx) * 0.5;
            const centerY = (ay + by) * 0.5;
            const mouseFactor = this.pointer.active
              ? 1 -
                Math.min(1, Math.hypot(centerX - mx, centerY - my) / 340)
              : 0;
            const exciteFactor = Math.max(a.excited, b.excited);
            const bendX = (my - centerY) * 0.05 * mouseFactor;
            const bendY = (mx - centerX) * 0.05 * mouseFactor;

            ctx.save();
            ctx.lineWidth = 1 + mouseFactor * 1.1 + exciteFactor * 1.1;
            ctx.strokeStyle = `rgba(170, 132, 255, ${
              alpha + mouseFactor * 0.14 + exciteFactor * 0.18
            })`;
            ctx.setLineDash([2, 8]);
            ctx.lineDashOffset =
              -t * 25 * (0.35 + mouseFactor + exciteFactor * 0.6);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(
              centerX + bendX,
              centerY - bendY,
              bx,
              by
            );
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    render(t) {
      if (!this.initialized) {
        return;
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      this.drawGrid(t);
      this.drawWaveField(t);
      this.drawEntanglement(t);

      this.clickBursts = this.clickBursts.filter((burst) => {
        burst.life -= 0.02;
        return burst.life > 0;
      });

      for (const particle of this.particles) {
        particle.x += particle.vx + Math.sin(t * 0.4 + particle.p) * 0.08;
        particle.y -= particle.vy;
        if (particle.y < -20) {
          particle.y = this.h + 20;
        }
        if (particle.x < -30) {
          particle.x = this.w + 30;
        }
        if (particle.x > this.w + 30) {
          particle.x = -30;
        }

        const flicker = 0.75 + 0.25 * Math.sin(t * 1.7 + particle.p);
        ctx.fillStyle = `rgba(196, 174, 255, ${particle.a * flicker})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.s, 0, Math.PI * 2);
        ctx.fill();
      }

      const mx = this.pointer.active ? this.pointer.x * this.w : this.w * 0.5;
      const my = this.pointer.active ? this.pointer.y * this.h : this.h * 0.5;

      for (const qubit of this.qubits) {
        qubit.excited *= 0.965;
        const driftX = Math.sin(t * 0.12 + qubit.phase) * 10;
        const driftY = Math.cos(t * 0.14 + qubit.phase * 1.2) * 8;
        const x = qubit.x + driftX;
        const y = qubit.y + driftY;
        const distance = Math.hypot(x - mx, y - my);
        const hoverBoost = this.pointer.active
          ? Math.max(0, 1 - distance / 240)
          : 0;
        const pulse =
          1 +
          0.08 * Math.sin(t * qubit.pulse + qubit.phase * 2) +
          hoverBoost * 0.18 +
          qubit.excited * 0.25;
        const radius = qubit.r * pulse;
        const rotation =
          t * qubit.speed +
          qubit.phase +
          hoverBoost * 1.6 +
          qubit.excited * 1.8;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(qubit.tilt + Math.sin(t * 0.15 + qubit.phase) * 0.15);

        const halo = ctx.createRadialGradient(
          0,
          0,
          radius * 0.2,
          0,
          0,
          radius * 3.1
        );
        halo.addColorStop(
          0,
          `rgba(139, 92, 246, ${
            0.1 +
            qubit.hue * 0.02 +
            hoverBoost * 0.08 +
            qubit.excited * 0.14
          })`
        );
        halo.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 3.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(180, 150, 255, ${
          0.2 +
          qubit.hue * 0.06 +
          hoverBoost * 0.2 +
          qubit.excited * 0.16
        })`;
        ctx.lineWidth = 1.2 + hoverBoost * 0.8 + qubit.excited * 0.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(139, 92, 246, ${
          0.18 + hoverBoost * 0.16 + qubit.excited * 0.22
        })`;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.34, rotation, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(210, 190, 255, ${
          0.14 + hoverBoost * 0.16 + qubit.excited * 0.14
        })`;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.36, radius, rotation, 0, Math.PI * 2);
        ctx.stroke();

        const vx = Math.cos(rotation) * radius * 0.95;
        const vy = Math.sin(rotation) * radius * 0.95;
        ctx.strokeStyle = `rgba(255,255,255, ${
          0.2 + hoverBoost * 0.22 + qubit.excited * 0.18
        })`;
        ctx.beginPath();
        ctx.moveTo(-vx * 0.55, -vy * 0.55);
        ctx.lineTo(vx, vy);
        ctx.stroke();

        const glow = ctx.createRadialGradient(
          0,
          0,
          0,
          0,
          0,
          radius * 0.35
        );
        glow.addColorStop(0, "rgba(255,255,255,0.96)");
        glow.addColorStop(0.35, "rgba(170, 132, 255, 0.92)");
        glow.addColorStop(1, "rgba(170, 132, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
        ctx.fill();

        for (let index = 0; index < qubit.orbiters; index += 1) {
          const angle = rotation * (1.15 + index * 0.28) + index * Math.PI;
          const ex = Math.cos(angle) * radius;
          const ey = Math.sin(angle) * radius * (0.35 + index * 0.22);
          ctx.fillStyle =
            index % 2 === 0
              ? "rgba(170, 132, 255, 0.96)"
              : "rgba(220, 205, 255, 0.96)";
          ctx.beginPath();
          ctx.arc(ex, ey, radius * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      for (const burst of this.clickBursts) {
        ctx.strokeStyle = `rgba(139, 92, 246, ${burst.life * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, (1 - burst.life) * 160 + 20, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (this.pointer.active) {
        const gradient = ctx.createRadialGradient(mx, my, 10, mx, my, 220);
        gradient.addColorStop(0, "rgba(139, 92, 246, 0.18)");
        gradient.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(mx, my, 220, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  class FocusScenesController {
    constructor() {
      this.panels = {
        ml: document.getElementById("focus-panel-ml"),
        quant: document.getElementById("focus-panel-quant"),
        quantum: document.getElementById("focus-panel-quantum"),
      };

      this.scenes = {
        ml: new AIScene(
          document.getElementById("focus-canvas-ml"),
          this.panels.ml
        ),
        quant: new QuantScene(
          document.getElementById("focus-canvas-quant"),
          this.panels.quant
        ),
        quantum: new QuantumScene(
          document.getElementById("focus-canvas-quantum"),
          this.panels.quantum
        ),
      };

      this.activeKey = "ml";
      this.animate = this.animate.bind(this);
      this.handleResize = this.handleResize.bind(this);
      window.addEventListener("resize", this.handleResize);
      requestAnimationFrame(this.animate);
    }

    setActiveFocus(key, isVisible) {
      if (!this.scenes[key]) {
        return;
      }

      this.activeKey = key;
      if (isVisible) {
        this.scenes[key].resize();
      }
    }

    handleResize() {
      const scene = this.scenes[this.activeKey];
      if (scene && !scene.panel.hidden) {
        scene.resize();
      }
    }

    animate(timestamp) {
      const t = timestamp * 0.001;

      for (const scene of Object.values(this.scenes)) {
        scene.render(t);
      }

      requestAnimationFrame(this.animate);
    }
  }

  window.createFocusScenesController = function createFocusScenesController() {
    const mlCanvas = document.getElementById("focus-canvas-ml");
    const quantCanvas = document.getElementById("focus-canvas-quant");
    const quantumCanvas = document.getElementById("focus-canvas-quantum");

    if (!mlCanvas || !quantCanvas || !quantumCanvas) {
      return null;
    }

    return new FocusScenesController();
  };
})();
