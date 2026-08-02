/**
 * 通用付费打赏系统 v1.0
 * 纯前端 localStorage 方案 - 自愿打赏模式
 * 可复用于后续付费制游戏
 */

const Paywall = {
  STORAGE_KEY: '_nightstudy_support',
  SESSION_KEY: '_nightstudy_session',
  COOKIE_KEY: '_nightstudy_pay_flag',

  /** 检查是否已打赏 */
  hasPaid() {
    // 三重存储交叉验证
    const ls = localStorage.getItem(this.STORAGE_KEY);
    const ss = sessionStorage.getItem(this.SESSION_KEY);
    const cookie = this._getCookie(this.COOKIE_KEY);

    // 至少有一处记录就视为已打赏（宽松策略，避免误判）
    return !!(ls || ss || cookie);
  },

  /** 标记已打赏（三重写入） */
  markPaid() {
    const token = this._generateToken();
    localStorage.setItem(this.STORAGE_KEY, token);
    sessionStorage.setItem(this.SESSION_KEY, token);
    this._setCookie(this.COOKIE_KEY, token, 365);
  },

  /** 生成签名令牌 */
  _generateToken() {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    const sig = btoa(`${ts}_${rand}_night_study_file`);
    return sig;
  },

  /** Cookie 操作 */
  _setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
  },

  _getCookie(name) {
    const cname = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(cname) === 0) return c.substring(cname.length, c.length);
    }
    return '';
  },

  /** 显示打赏浮层 */
  show(config) {
    if (this.hasPaid()) return;

    const overlay = document.getElementById('paywall-overlay');
    if (!overlay) {
      this._createOverlay(config);
    } else {
      overlay.style.display = 'flex';
      overlay.classList.remove('paywall-show');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('paywall-show');
        });
      });
    }
  },

  /** 隐藏打赏浮层 */
  hide() {
    const overlay = document.getElementById('paywall-overlay');
    if (overlay) {
      overlay.classList.add('paywall-closing');
      overlay.classList.remove('paywall-show');
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('paywall-closing');
      }, 400);
    }
  },

  /** 已支持按钮点击 */
  _onSupport() {
    this.markPaid();
    this.hide();
    // 显示感谢提示
    this._showThanks();
  },

  _showThanks() {
    const toast = document.createElement('div');
    toast.className = 'paywall-toast';
    toast.innerHTML = '感谢你的支持！调查档案已继续开放。';
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },

  _animateIn() {
    const overlay = document.getElementById('paywall-overlay');
    if (overlay) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add('paywall-show');
        });
      });
    }
  },

  /** 创建浮层DOM */
  _createOverlay(config) {
    const defaultConfig = {
      qrCode: 'paycode.png',
      price: '1元',
      title: '支持《晚自习留校名单》',
      studio: 'abc studio'
    };
    const cfg = Object.assign(defaultConfig, config || {});

    const html = `
      <div class="paywall-overlay" id="paywall-overlay">
        <div class="paywall-card">
          <button class="paywall-close" onclick="Paywall.hide()" title="关闭">&times;</button>

          <div class="paywall-card-inner">
            <div class="paywall-header">
              <div class="paywall-title-row">
                <span class="paywall-heart">♡</span>
                <span class="paywall-title">${cfg.title}</span>
                <span class="paywall-heart">♡</span>
              </div>
              <div class="paywall-subtitle">${cfg.price} 自愿打赏 · 感谢支持</div>
            </div>

            <div class="paywall-body">
              <div class="paywall-qr-wrapper">
                <img src="${cfg.qrCode}" alt="收款码" class="paywall-qr-img" />
                <div class="paywall-qr-glow"></div>
              </div>
              <div class="paywall-qr-tip">请用 <strong style="color:#1677ff;">某宝</strong> 扫码打赏 ${cfg.price}</div>

              <div class="paywall-message">
                <p class="paywall-msg-warm">你好，这是一份虚构的校园调查档案。</p>
                <p class="paywall-msg-body">
                  从公示名单、留言板、监控台账到最终复盘，<br>
                  每一页线索都花了不少时间打磨。<br>
                  如果你愿意用 <strong>1元</strong> 支持这类网页解谜作品，<br>
                  会成为我继续写下一个档案的动力。
                </p>
                <p class="paywall-msg-cute">
                  1块钱不多，但足够让开发者在深夜自习室里多撑一会儿。
                </p>
                <p class="paywall-msg-warm2">
                  支持是自愿的，档案调查不会因此中断。感谢每一位认真推理到最后的玩家。
                </p>
              </div>
            </div>

            <div class="paywall-footer">
              <div class="paywall-hint">
                <span class="paywall-hint-icon">💡</span>
                <span>小提示：支持记录保存在本机浏览器，清除浏览器数据后会再次出现。</span>
              </div>
              <div class="paywall-btns">
                <button class="paywall-btn paywall-btn-support" onclick="Paywall._onSupport()">
                  已完成支持 ♡
                </button>
                <button class="paywall-btn paywall-btn-later" onclick="Paywall.hide()">
                  下次一定
                </button>
              </div>
            </div>

            <div class="paywall-studio">abc studio</div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this._animateIn();
  }
};

// 暴露到全局
window.Paywall = Paywall;
