import StartScene from './scene-start';
import GameScene from './scene-game';
import LobbyScene from './scene-lobby';
import net from './net';

const DESIGN_W = 750;
const DESIGN_H = 1334;

export default class Main {
  constructor() {
    this.canvas = wx.createCanvas();
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const ratio = windowInfo.pixelRatio > 0 ? windowInfo.pixelRatio : 1;
    this.canvas.width = Math.round(windowInfo.screenWidth * ratio);
    this.canvas.height = Math.round(windowInfo.screenHeight * ratio);
    this.pixelRatio = ratio;
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.scale = Math.min(this.width / DESIGN_W, this.height / DESIGN_H);
    this.offsetX = (this.width - DESIGN_W * this.scale) / 2;
    this.offsetY = (this.height - DESIGN_H * this.scale) / 2;

    this.onStart = () => this.setScene(new GameScene(this));
    this.onOnline = () => this.setScene(new LobbyScene(this));
    this.net = net;
    net.init();
    net.startStateService();
    this.scene = new StartScene(this);

    net.on('invite', (res) => {
      const ai = res && res.data;
      if (ai && !net.accessInfo) this.setScene(new LobbyScene(this, ai));
    });

    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => ({
        title: '路障对战 · 邀你来一局',
        query: net.accessInfo ? `accessInfo=${encodeURIComponent(net.accessInfo)}` : '',
      }));
    }

    const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : { query: {} };
    const launchQuery = (launch && launch.query) || {};
    this.handleQuery(launchQuery);
    if (!launchQuery.accessInfo) {
      net.restore((ai) => {
        if (ai && this.scene instanceof StartScene) {
          this.setScene(new LobbyScene(this, ai));
        }
      });
    }
    if (wx.onShow) {
      wx.onShow((res) => this.handleQuery((res && res.query) || {}));
    }

    wx.onTouchStart((e) => this.dispatchTouch(e));
    this.loop();
  }

  handleQuery(query) {
    const raw = query.accessInfo;
    if (!raw) return;
    let ai = raw;
    try {
      ai = decodeURIComponent(raw);
    } catch (e) {
      // keep raw
    }
    if (net.accessInfo === ai) return;
    this.setScene(new LobbyScene(this, ai));
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
    const old = this.scene;
    if (old && old.dispose) old.dispose();
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
