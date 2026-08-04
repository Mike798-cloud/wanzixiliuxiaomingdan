/**
 * 《晚自习留校名单》自愿支持组件 v2.0
 * 纯前端 localStorage 记录，不验证付款，不影响剧情、提示或结局。
 */

const Paywall = {
  STORAGE_KEY: '_nightstudy_support',
  SESSION_KEY: '_nightstudy_session',
  COOKIE_KEY: '_nightstudy_pay_flag',
  currentConfig: null,

  hasPaid() {
    try {
      const local = localStorage.getItem(this.STORAGE_KEY);
      const session = sessionStorage.getItem(this.SESSION_KEY);
      const cookie = this._getCookie(this.COOKIE_KEY);
      return Boolean(local || session || cookie);
    } catch (error) {
      console.warn('[Paywall] 无法读取支持记录', error);
      return false;
    }
  },

  markPaid() {
    const token = this._generateToken();
    try {
      localStorage.setItem(this.STORAGE_KEY, token);
      sessionStorage.setItem(this.SESSION_KEY, token);
      this._setCookie(this.COOKIE_KEY, token, 365);
    } catch (error) {
      console.warn('[Paywall] 无法保存支持记录', error);
    }
    document.dispatchEvent(new CustomEvent('paywall:supported'));
  },

  _generateToken() {
    const raw = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_night_study_support`;
    try {
      return btoa(raw);
    } catch (_) {
      return raw;
    }
  },

  _setCookie(name, value, days) {
    try {
      const expires = new Date(Date.now() + days * 86400000).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
    } catch (error) {
      console.warn('[Paywall] 无法写入 Cookie', error);
    }
  },

  _getCookie(name) {
    try {
      const prefix = `${name}=`;
      const target = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(prefix));
      return target ? decodeURIComponent(target.slice(prefix.length)) : '';
    } catch (_) {
      return '';
    }
  },

  _escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  show(config) {
    const defaults = {
      qrCode: 'paycode.png',
      price: '¥1',
      title: '自愿支持《晚自习留校名单》',
      studio: 'abc studio',
      paymentName: '支付宝'
    };
    this.currentConfig = Object.assign({}, defaults, config || {});

    let overlay = document.getElementById('paywall-overlay');
    if (!overlay) {
      this._createOverlay(this.currentConfig);
      overlay = document.getElementById('paywall-overlay');
    } else {
      this._renderState();
      overlay.style.display = 'flex';
    }

    if (!overlay) return;
    overlay.classList.remove('paywall-closing');
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('paywall-show')));
    document.body.classList.add('paywall-open');

    const focusTarget = overlay.querySelector('.paywall-close, .paywall-btn');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 80);
  },

  hide() {
    const overlay = document.getElementById('paywall-overlay');
    if (!overlay) return;
    overlay.classList.add('paywall-closing');
    overlay.classList.remove('paywall-show');
    document.body.classList.remove('paywall-open');
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.classList.remove('paywall-closing');
    }, 260);
  },

  _onSupport() {
    this.markPaid();
    this._renderState();
    this._showThanks();
  },

  _showThanks() {
    const old = document.querySelector('.paywall-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'paywall-toast';
    toast.textContent = '感谢支持！提示和完整剧情原本就是免费开放的。';
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 30);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  },

  _createOverlay(config) {
    const html = `
      <div class="paywall-overlay" id="paywall-overlay" role="dialog" aria-modal="true" aria-labelledby="paywall-title" aria-describedby="paywall-description">
        <div class="paywall-card" role="document">
          <button class="paywall-close" type="button" onclick="Paywall.hide()" aria-label="关闭支持窗口" title="关闭并继续游戏">&times;</button>
          <div class="paywall-card-inner" id="paywall-card-content"></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('paywall-overlay');
    if (overlay) {
      overlay.addEventListener('click', event => {
        if (event.target === overlay) this.hide();
      });
    }

    if (!this._escapeBound) {
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          const current = document.getElementById('paywall-overlay');
          if (current && current.style.display !== 'none') this.hide();
        }
      });
      this._escapeBound = true;
    }

    this._renderState();
  },

  _renderState() {
    const content = document.getElementById('paywall-card-content');
    if (!content) return;
    const cfg = this.currentConfig || {};
    const paid = this.hasPaid();
    const title = this._escape(cfg.title || '自愿支持《晚自习留校名单》');
    const price = this._escape(cfg.price || '¥1');
    const qrCode = this._escape(cfg.qrCode || 'paycode.png');
    const paymentName = this._escape(cfg.paymentName || '支付宝');
    const studio = this._escape(cfg.studio || 'abc studio');

    if (paid) {
      content.innerHTML = `
        <div class="paywall-supported-state">
          <div class="paywall-supported-icon" aria-hidden="true">♡</div>
          <h2 class="paywall-title" id="paywall-title">感谢你的支持</h2>
          <p class="paywall-supported-copy" id="paywall-description">
            本机已记录“已支持”状态。这个记录只是为了表达感谢，不会解锁或限制任何游戏内容。
          </p>
          <div class="paywall-free-note">
            <strong>提示、剧情和全部结局始终免费开放。</strong>
          </div>
          <button class="paywall-btn paywall-btn-support paywall-btn-wide" type="button" onclick="Paywall.hide()">继续调查</button>
          <div class="paywall-studio">${studio}</div>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <header class="paywall-header">
        <div class="paywall-voluntary-badge">完全自愿 · 不是购买提示</div>
        <h2 class="paywall-title" id="paywall-title">${title}</h2>
        <p class="paywall-subtitle">用 ${price} 支持独立网页解谜创作</p>
      </header>

      <div class="paywall-clarity" id="paywall-description">
        <strong>不付费也能完整游玩。</strong>关闭此窗口后，所有章节、分级提示和结局仍然正常开放。
      </div>

      <div class="paywall-body">
        <div class="paywall-qr-section">
          <div class="paywall-qr-wrapper">
            <img src="${qrCode}" alt="${paymentName}${price}自愿支持收款码" class="paywall-qr-img">
          </div>
          <div class="paywall-amount-row">
            <span class="paywall-payment-name">${paymentName}扫码</span>
            <strong class="paywall-amount">${price}</strong>
          </div>
        </div>

        <div class="paywall-steps">
          <h3>支持方式</h3>
          <ol>
            <li>使用${paymentName}扫描左侧收款码。</li>
            <li>自愿支付 <strong>${price}</strong>，无需填写备注。</li>
            <li>完成后点击“我已支持”，本机仅保存感谢状态。</li>
          </ol>
          <p class="paywall-no-verify">网页无法核验真实付款，也不会以付款状态限制内容。</p>
        </div>
      </div>

      <footer class="paywall-footer">
        <div class="paywall-btns">
          <button class="paywall-btn paywall-btn-support" type="button" onclick="Paywall._onSupport()">我已完成 ${price} 支持</button>
          <button class="paywall-btn paywall-btn-later" type="button" onclick="Paywall.hide()">暂不支持，继续游戏</button>
        </div>
        <p class="paywall-footer-note">感谢每一位认真游玩的玩家，是否支持都不会影响体验。</p>
        <div class="paywall-studio">${studio}</div>
      </footer>
    `;
  }
};

window.Paywall = Paywall;
