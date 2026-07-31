/** 晚自习留校名单 - 音效系统 (Web Audio API) **/

const AudioSys = {
  enabled: true,
  ctx: null,
  masterGain: null,
  ambienceGain: null,
  sfxGain: null,
  ambienceNodes: [],

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = 0.15;
      this.ambienceGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.masterGain);
    } catch(e) {
      console.warn('音频系统初始化失败', e);
      this.enabled = false;
    }
  },

  ensureInit() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.4 : 0, this.ctx.currentTime, 0.1);
    }
    showToast(this.enabled ? '音效已开启' : '音效已关闭');
    const btn = document.getElementById('audio-toggle');
    if (btn) {
      btn.innerHTML = this.enabled 
        ? '<img src="icon-audio.svg" class="icon-img btn-icon" alt="" aria-hidden="true">'
        : '<img src="icon-audio-off.svg" class="icon-img btn-icon" alt="" aria-hidden="true">';
    }
    return this.enabled;
  },

  // 生成白噪声
  createNoise(type = 'pink') {
    if (!this.ctx) return null;
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
  },

  // 风声环境音
  startWind() {
    if (!this.enabled) return;
    this.ensureInit();
    const noise = this.createNoise('pink');
    if (!noise) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.5;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(this.ambienceGain);
    noise.start();

    this.ambienceNodes.push({ noise, lfo, lfoGain, filter });
  },

  // 电流/底噪
  startHum() {
    if (!this.enabled) return;
    this.ensureInit();
    const noise = this.createNoise('white');
    if (!noise) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 80;

    noise.connect(filter);
    filter.connect(this.ambienceGain);
    noise.start();

    this.ambienceNodes.push({ noise, filter });
  },

  // 停止所有环境音
  stopAmbience() {
    this.ambienceNodes.forEach(node => {
      try {
        if (node.noise) node.noise.stop();
        if (node.lfo) node.lfo.stop();
      } catch(e) {}
    });
    this.ambienceNodes = [];
  },

  // 播放音效：线索发现
  playClue() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.1);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  },

  // 播放音效：错误/证伪
  playError() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.3);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  },

  // 播放音效：解锁
  playUnlock() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.25, t + i * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.4);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.4);
    });
  },

  // 播放音效：低沉氛围（剧情转折）
  playDramatic() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const notes = [110, 82.41, 65.41, 55];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.6);
      gain.gain.linearRampToValueAtTime(0.3, t + i * 0.6 + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.6 + 2.5);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + i * 0.6);
      osc.stop(t + i * 0.6 + 2.5);
    });
  },

  // 播放音效：点击/交互
  playClick() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  },

  // 播放音效：打字机
  playType() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800 + Math.random() * 400;
    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.03);
  },

  // 播放音效：心跳
  playHeartbeat() {
    if (!this.enabled) return;
    this.ensureInit();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 40;
      gain.gain.setValueAtTime(0, t + i * 0.8);
      gain.gain.linearRampToValueAtTime(0.4, t + i * 0.8 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.8 + 0.3);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + i * 0.8);
      osc.stop(t + i * 0.8 + 0.3);
    }
  }
};

// 暴露全局
window.AudioSys = AudioSys;
