import StartScene from './scene-start';
import GameScene from './scene-game';

const DESIGN_W = 750;
const DESIGN_H = 1334;

export default class Main {
  constructor() {
    this.canvas = wx.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.scale = Math.min(this.width / DESIGN_W, this.height / DESIGN_H);
    this.offsetX = (this.width - DESIGN_W * this.scale) / 2;
    this.offsetY = (this.height - DESIGN_H * this.scale) / 2;
    this.pixelRatio = wx.getSystemInfoSync().pixelRatio;

    this.onStart = () => this.setScene(new GameScene(this));
    this.scene = new StartScene(this);

    wx.onTouchStart((e) => this.dispatchTouch(e));
    this.loop();
  }

  toDesignPoint(touch) {
    return {
      x: (touch.clientX * this.pixelRatio - this.offsetX) / this.scale,
      y: (touch.clientY * this.pixelRatio - this.offsetY) / this.scale,
    };
  }

  dispatchTouch(e) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch || !this.scene.onTouch) return;
    const point = this.toDesignPoint(touch);
    this.scene.onTouch(point.x, point.y);
  }

  setScene(scene) {
    this.scene = scene;
  }

  loop() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1B100B';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    this.scene.draw(ctx);
    requestAnimationFrame(() => this.loop());
  }
}
