const STORE_KEY = 'barricade_accessInfo';

function genToken() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 12; i += 1) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

class Net {
  constructor() {
    this.accessInfo = null;
    this.myPos = -1;
    this.myClientId = null;
    this.myToken = genToken();
    this.isHost = false;
    this.roomInfo = null;
    this.connected = false;
    this._inited = false;
    this._listeners = {};
  }

  on(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
    return fn;
  }

  off(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, data) {
    const list = this._listeners[type] || [];
    for (let i = 0; i < list.length; i += 1) list[i](data);
  }

  gsm() {
    return wx.getGameServerManager();
  }

  init() {
    if (this._inited) return;
    this._inited = true;
    const g = this.gsm();
    g.onRoomInfoChange((res) => {
      const info = (res && res.memberList) ? res : ((res && res.roomInfo) || res);
      this.roomInfo = info;
      this._syncRole(info);
      this.emit('room', info);
    });
    g.onBroadcast((res) => {
      const raw = typeof res === 'string' ? res : (res && res.msg);
      if (!raw) return;
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (data && data.t) {
        if (typeof data.p !== 'number') data.p = 1 - this.myPos;
        this.emit('msg', data);
      }
    });
    g.onDisconnect((res) => {
      this.connected = false;
      this.emit('disconnect', res || {});
    });
    g.onLogout(() => {
      this.connected = false;
      this.emit('logout');
    });
    g.onBeKickedOut(() => {
      this.reset();
      this.emit('kicked');
    });
    if (g.onInvite) {
      g.onInvite((res) => this.emit('invite', res || {}));
    }
  }

  _syncRole(info) {
    if (!info || !info.memberList) return;
    let me = null;
    for (let i = 0; i < info.memberList.length; i += 1) {
      const m = info.memberList[i];
      if ((m.memberExtInfo && m.memberExtInfo === this.myToken) || m.posNum === this.myPos) {
        me = m;
        break;
      }
    }
    if (me && typeof me.role === 'number') this.isHost = me.role === 1;
    if (me && typeof me.posNum === 'number') this.myPos = me.posNum;
  }

  startStateService() {
    this.init();
    const g = this.gsm();
    if (!g.startStateService) return;
    try {
      g.startStateService({ userState: 'idle' });
    } catch (e) {
      // ignore
    }
  }

  login(cb) {
    this.init();
    const g = this.gsm();
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      this.connected = true;
      cb(true);
    };
    const bad = () => {
      if (done) return;
      done = true;
      cb(false);
    };
    try {
      const p = g.login();
      if (p && typeof p.then === 'function') {
        p.then(ok, bad);
      } else {
        ok();
      }
    } catch (e) {
      bad();
    }
  }

  createRoom(cb) {
    this.login((ok) => {
      if (!ok) {
        cb(false, '登录游戏服务失败');
        return;
      }
      const g = this.gsm();
      g.createRoom({
        maxMemberNum: 2,
        startPercent: 0,
        needUserInfo: false,
        gameLastTime: 3600,
        memberExtInfo: this.myToken,
        success: (res) => {
          const data = (res && res.data) || {};
          this.accessInfo = data.accessInfo || null;
          this.myPos = 0;
          this.myClientId = data.clientId;
          this.isHost = true;
          this.connected = true;
          if (this.accessInfo) {
            this._persistAccess();
            if (g.setInviteData) {
              try {
                g.setInviteData(this.accessInfo);
              } catch (e) {
                // ignore
              }
            }
          }
          this._refreshRoom(() => cb(true));
        },
        fail: (res) => cb(false, (res && res.errMsg) || '创建房间失败'),
      });
    });
  }

  joinRoom(accessInfo, cb) {
    this.login((ok) => {
      if (!ok) {
        cb(false, '登录游戏服务失败');
        return;
      }
      const g = this.gsm();
      g.joinRoom({
        accessInfo,
        memberExtInfo: this.myToken,
        success: (res) => {
          const data = (res && res.data) || {};
          this.accessInfo = accessInfo;
          this.myPos = typeof data.myPos === 'number' ? data.myPos : -1;
          this.myClientId = data.clientId;
          this.isHost = false;
          this.connected = true;
          this._persistAccess();
          this._refreshRoom(() => cb(true));
        },
        fail: (res) => cb(false, (res && res.errMsg) || '加入房间失败'),
      });
    });
  }

  _refreshRoom(cb) {
    const g = this.gsm();
    g.getRoomInfo({
      success: (res) => {
        const info = res && res.data && res.data.roomInfo;
        if (info) {
          this.roomInfo = info;
          this.emit('room', info);
        }
        cb(true);
      },
      fail: () => cb(false),
    });
  }

  leaveRoom() {
    const g = this.gsm();
    const ai = this.accessInfo;
    const wasHost = this.isHost;
    if (ai) this.send({ t: 'bye' });
    this.reset();
    if (!ai) return;
    try {
      if (wasHost) {
        g.ownerLeaveRoom({ accessInfo: ai, assignToMinPosNum: true });
      } else {
        g.memberLeaveRoom({ accessInfo: ai });
      }
    } catch (e) {
      // ignore
    }
  }

  send(obj) {
    const g = this.gsm();
    if (!g || !this.accessInfo) return false;
    obj.p = this.myPos;
    try {
      g.broadcastInRoom({ msg: JSON.stringify(obj) });
      return true;
    } catch (e) {
      return false;
    }
  }

  reconnect(cb) {
    const g = this.gsm();
    if (!g || !this.accessInfo) {
      if (cb) cb(false);
      return;
    }
    this.init();
    const finish = (ok) => {
      this.connected = ok;
      if (cb) cb(ok);
    };
    const tryReconnect = () => {
      try {
        const p = g.reconnect({ accessInfo: this.accessInfo });
        if (p && typeof p.then === 'function') {
          p.then(() => finish(true), () => finish(false));
        } else {
          finish(true);
        }
      } catch (e) {
        finish(false);
      }
    };
    try {
      g.getLastRoomInfo({
        success: (res) => {
          const d = (res && res.data) || {};
          if (d.accessInfo === this.accessInfo) {
            tryReconnect();
          } else {
            finish(false);
          }
        },
        fail: tryReconnect,
      });
    } catch (e) {
      tryReconnect();
    }
  }

  reset() {
    this.accessInfo = null;
    this.myPos = -1;
    this.myClientId = null;
    this.isHost = false;
    this.roomInfo = null;
    this.connected = false;
    this._clearPersist();
  }

  _persistAccess() {
    try {
      if (wx.setStorageSync) wx.setStorageSync(STORE_KEY, this.accessInfo);
    } catch (e) {
      // ignore
    }
  }

  _clearPersist() {
    try {
      if (wx.removeStorageSync) wx.removeStorageSync(STORE_KEY);
    } catch (e) {
      // ignore
    }
  }

  restore(cb) {
    let saved = null;
    try {
      if (wx.getStorageSync) saved = wx.getStorageSync(STORE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved) {
      cb(null);
      return;
    }
    this.init();
    const g = this.gsm();
    g.getLastRoomInfo({
      success: (res) => {
        const d = (res && res.data) || {};
        const info = d.roomInfo;
        if (d.accessInfo === saved && info && (info.roomState === 1 || info.roomState === 2)) {
          cb(d.accessInfo);
        } else {
          this._clearPersist();
          cb(null);
        }
      },
      fail: () => cb(null),
    });
  }
}

const net = new Net();

export default net;
