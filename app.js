// Web Audio API를 사용한 게임 효과음 및 실시간 BGM 합성 클래스
class GameAudio {
  constructor() {
    this.ctx = null;
    this.bgmEnabled = localStorage.getItem('memory_moment_bgm_enabled') !== 'false';
    this.sfxEnabled = localStorage.getItem('memory_moment_sfx_enabled') !== 'false';
    this.bgmPlaying = false;
    this.bgmGain = null;
    this.schedulerInterval = null;
    this.bgmTempo = 100; // 템포 (BPM)
    this.bgmNextNoteTime = 0.0;
    this.bgmBeatIndex = 0;
  }

  // 사용자의 첫 터치/클릭 시 오디오 컨텍스트 초기화 (브라우저 보안 정책 대응)
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // BGM 재생 시작
  startBgm() {
    this.init();
    if (!this.ctx) return;

    // 이미 BGM이 스케줄되고 있다면 중복 실행 차단
    if (this.bgmPlaying) return;
    this.bgmPlaying = true;

    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
    }

    // BGM이 활성화 상태인지에 따라 초기 gain(음량) 스무스 설정
    const targetVolume = this.bgmEnabled ? 0.18 : 0;
    this.bgmGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);

    this.bgmNextNoteTime = this.ctx.currentTime;
    this.bgmBeatIndex = 0;

    // 25ms 마다 아르페지오 스케줄링 체크
    this.schedulerInterval = setInterval(() => {
      this.scheduler();
    }, 25);
  }

  // Web Audio API 노트 선예약 스케줄러
  scheduler() {
    const scheduleAheadTime = 0.1; // 100ms 앞을 보며 예약
    while (this.bgmNextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleNote(this.bgmBeatIndex, this.bgmNextNoteTime);
      this.advanceNote();
    }
  }

  advanceNote() {
    // 8분음표 단위로 비트 전진
    const secondsPerBeat = 60.0 / this.bgmTempo / 2;
    this.bgmNextNoteTime += secondsPerBeat;
    this.bgmBeatIndex = (this.bgmBeatIndex + 1) % 32; // 32스텝 (16박자 루프)
  }

  // 코드로 소리 합성: 8비트 감성의 Triangle 파형 아르페지오 + Sine 파형 베이스
  scheduleNote(beatIndex, time) {
    if (!this.ctx || !this.bgmGain) return;

    // 4마디 코드 진행 (Cmaj7 -> Am7 -> Dm7 -> G7)
    const scaleC = [261.63, 329.63, 392.00, 493.88, 523.25, 493.88, 392.00, 329.63]; // Cmaj7
    const scaleA = [220.00, 261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63]; // Am7
    const scaleD = [293.66, 349.23, 440.00, 523.25, 587.33, 523.25, 440.00, 349.23]; // Dm7
    const scaleG = [196.00, 246.94, 293.66, 349.23, 392.00, 349.23, 293.66, 246.94]; // G7

    let freq = 0;
    const step = beatIndex % 8;

    if (beatIndex < 8) {
      freq = scaleC[step];
    } else if (beatIndex < 16) {
      freq = scaleA[step];
    } else if (beatIndex < 24) {
      freq = scaleD[step];
    } else {
      freq = scaleG[step];
    }

    // 1. 아르페지오 신디사이저 파트
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.type = 'triangle'; // 귀를 찌르지 않는 은은한 삼각파
    osc.frequency.setValueAtTime(freq, time);

    const secondsPerBeat = 60.0 / this.bgmTempo / 2;
    const noteDuration = secondsPerBeat * 0.9; // 약간의 스타카토 느낌 부여

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration - 0.01);

    osc.start(time);
    osc.stop(time + noteDuration);

    // 2. 베이스 라인 파트 (각 코드의 1박과 5박에 둥~ 하고 울림)
    if (beatIndex % 4 === 0) {
      let baseFreq = 130.81; // C3
      if (beatIndex === 8 || beatIndex === 12) baseFreq = 110.00; // A2
      if (beatIndex === 16 || beatIndex === 20) baseFreq = 146.83; // D3
      if (beatIndex === 24 || beatIndex === 28) baseFreq = 98.00; // G2

      const baseOsc = this.ctx.createOscillator();
      const baseGain = this.ctx.createGain();

      baseOsc.connect(baseGain);
      baseGain.connect(this.bgmGain);

      baseOsc.type = 'sine'; // 울림이 깊은 사인파
      baseOsc.frequency.setValueAtTime(baseFreq, time);

      const baseDuration = secondsPerBeat * 1.8;
      baseGain.gain.setValueAtTime(0, time);
      baseGain.gain.linearRampToValueAtTime(0.4, time + 0.05);
      baseGain.gain.exponentialRampToValueAtTime(0.001, time + baseDuration - 0.05);

      baseOsc.start(time);
      baseOsc.stop(time + baseDuration);
    }
  }

  // 볼륨 제어를 이용해 배경음 일시정지 (스무스 페이드아웃)
  pauseBgm() {
    if (!this.bgmPlaying || !this.bgmGain) return;
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.bgmGain.gain.linearRampToValueAtTime(0, now + 0.15);
  }

  // 볼륨 제어를 이용해 배경음 재개 (스무스 페이드인)
  resumeBgm() {
    if (!this.bgmPlaying || !this.bgmGain || !this.bgmEnabled) return;
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.bgmGain.gain.linearRampToValueAtTime(0.18, now + 0.2);
  }

  // BGM 타이머 루프를 완전 멈춤
  stopBgm() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.bgmPlaying = false;
  }

  // BGM ON/OFF 토글
  setBgmEnabled(enabled) {
    this.bgmEnabled = enabled;
    localStorage.setItem('memory_moment_bgm_enabled', enabled ? 'true' : 'false');

    // 오디오 컨텍스트가 로드된 상태에서 스무스하게 볼륨 증감
    if (this.bgmGain) {
      const now = this.ctx ? this.ctx.currentTime : 0;
      this.bgmGain.gain.linearRampToValueAtTime(enabled ? 0.18 : 0, now + 0.25);
    }

    // 설정은 켰으나 BGM 루프가 아예 안 돌고 있다면 자동 스타트
    if (enabled && !this.bgmPlaying) {
      this.startBgm();
    }
  }

  // SFX ON/OFF 설정
  setSfxEnabled(enabled) {
    this.sfxEnabled = enabled;
    localStorage.setItem('memory_moment_sfx_enabled', enabled ? 'true' : 'false');
  }

  // 짧은 클릭 사운드
  playClick() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime); // 800Hz
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // 정답을 맞췄을 때 (성공 멜로디)
  playSuccess() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // 도, 미, 솔, 도 (C5, E5, G5, C6)
    const duration = 0.12;

    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);

      gain.gain.setValueAtTime(0, now + index * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, now + index * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.08 + duration);

      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + duration);
    });
  }

  // 오답 또는 생명 감소 사운드
  playWrong() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now); // 220Hz
    osc.frequency.linearRampToValueAtTime(110, now + 0.35); // 110Hz로 하강

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // 카운트다운 틱음 (대기 중 소리)
  playTick() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // 카운트다운 마지막 시작음
  playStart() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.25);
  }

  // 게임 오버 멜로디
  playGameOver() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [392.00, 349.23, 311.13, 261.63]; // 솔, 파, 미b, 도
    const durations = [0.15, 0.15, 0.15, 0.5];

    let timeOffset = 0;
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + timeOffset);

      gain.gain.setValueAtTime(0.15, now + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + timeOffset + durations[index]);

      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + durations[index]);

      timeOffset += durations[index] * 0.8;
    });
  }
}

const gameAudio = new GameAudio();

// stages.json과 동일한 백업 데이터 (로컬 file:// 실행 시 CORS 차단 우회용 Fallback)
const DEFAULT_STAGES = [
  { "level": 1, "digits": 4, "showTime": 3.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 2, "digits": 4, "showTime": 3.0, "keypadFadeTime": 3.0, "isShuffledKeypad": true },
  { "level": 3, "digits": 5, "showTime": 3.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 4, "digits": 5, "showTime": 3.0, "keypadFadeTime": 3.0, "isShuffledKeypad": true },
  { "level": 5, "digits": 6, "showTime": 3.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 6, "digits": 6, "showTime": 3.0, "keypadFadeTime": 3.0, "isShuffledKeypad": true },
  { "level": 7, "digits": 4, "showTime": 2.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 8, "digits": 4, "showTime": 2.5, "keypadFadeTime": 2.5, "isShuffledKeypad": true },
  { "level": 9, "digits": 5, "showTime": 2.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 10, "digits": 5, "showTime": 2.5, "keypadFadeTime": 2.5, "isShuffledKeypad": true },
  { "level": 11, "digits": 6, "showTime": 2.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 12, "digits": 6, "showTime": 2.5, "keypadFadeTime": 2.5, "isShuffledKeypad": true },
  { "level": 13, "digits": 4, "showTime": 2.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 14, "digits": 4, "showTime": 2.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 15, "digits": 5, "showTime": 2.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 16, "digits": 5, "showTime": 2.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 17, "digits": 6, "showTime": 2.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 18, "digits": 6, "showTime": 2.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 19, "digits": 4, "showTime": 1.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 20, "digits": 4, "showTime": 1.5, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 21, "digits": 5, "showTime": 1.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 22, "digits": 5, "showTime": 1.5, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 23, "digits": 6, "showTime": 1.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 24, "digits": 6, "showTime": 1.5, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 25, "digits": 4, "showTime": 1.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 26, "digits": 4, "showTime": 1.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 27, "digits": 5, "showTime": 1.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 28, "digits": 5, "showTime": 1.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 29, "digits": 6, "showTime": 1.0, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 30, "digits": 6, "showTime": 1.0, "keypadFadeTime": 2.0, "isShuffledKeypad": true },
  { "level": 31, "digits": 4, "showTime": 0.8, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 32, "digits": 4, "showTime": 0.8, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 33, "digits": 5, "showTime": 0.8, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 34, "digits": 5, "showTime": 0.8, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 35, "digits": 6, "showTime": 0.8, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 36, "digits": 6, "showTime": 0.8, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 37, "digits": 4, "showTime": 0.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 38, "digits": 4, "showTime": 0.5, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 39, "digits": 5, "showTime": 0.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 40, "digits": 5, "showTime": 0.5, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 41, "digits": 6, "showTime": 0.5, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 42, "digits": 6, "showTime": 0.5, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 43, "digits": 4, "showTime": 0.3, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 44, "digits": 4, "showTime": 0.3, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 45, "digits": 5, "showTime": 0.3, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 46, "digits": 5, "showTime": 0.3, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 47, "digits": 6, "showTime": 0.3, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 48, "digits": 6, "showTime": 0.3, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 49, "digits": 4, "showTime": 0.2, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 50, "digits": 4, "showTime": 0.2, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 51, "digits": 5, "showTime": 0.2, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 52, "digits": 5, "showTime": 0.2, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 53, "digits": 6, "showTime": 0.2, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 54, "digits": 6, "showTime": 0.2, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 55, "digits": 4, "showTime": 0.1, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 56, "digits": 4, "showTime": 0.1, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 57, "digits": 5, "showTime": 0.1, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 58, "digits": 5, "showTime": 0.1, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 59, "digits": 6, "showTime": 0.1, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 60, "digits": 6, "showTime": 0.1, "keypadFadeTime": 1.0, "isShuffledKeypad": true },
  { "level": 61, "digits": 4, "showTime": 0.08, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 62, "digits": 4, "showTime": 0.08, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 63, "digits": 5, "showTime": 0.08, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 64, "digits": 5, "showTime": 0.08, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 65, "digits": 6, "showTime": 0.08, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 66, "digits": 6, "showTime": 0.08, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 67, "digits": 4, "showTime": 0.05, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 68, "digits": 4, "showTime": 0.05, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 69, "digits": 5, "showTime": 0.05, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 70, "digits": 5, "showTime": 0.05, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 71, "digits": 6, "showTime": 0.05, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 72, "digits": 6, "showTime": 0.05, "keypadFadeTime": 0.5, "isShuffledKeypad": true },
  { "level": 73, "digits": 4, "showTime": 0.03, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 74, "digits": 4, "showTime": 0.03, "keypadFadeTime": 0.3, "isShuffledKeypad": true },
  { "level": 75, "digits": 5, "showTime": 0.03, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 76, "digits": 5, "showTime": 0.03, "keypadFadeTime": 0.3, "isShuffledKeypad": true },
  { "level": 77, "digits": 6, "showTime": 0.03, "keypadFadeTime": 0, "isShuffledKeypad": false },
  { "level": 78, "digits": 6, "showTime": 0.03, "keypadFadeTime": 0.3, "isShuffledKeypad": true }
];

let stagesData = DEFAULT_STAGES;

// 게임 설정 및 상태 관리 객체
const gameState = {
  currentLevel: 11, // ⭐️ 사용자의 요청에 의해 11탄 즉시 테스트 셋업
  score: 10,
  lives: 3,
  maxLives: 3,
  targetNumber: '',
  inputNumber: '',
  digits: 4,
  showTime: 3.0,
  isShuffledKeypad: false,
  keypadFadeTime: 3,
  timerInterval: null,
  bestLevel: Math.max(parseInt(localStorage.getItem('memory_moment_best_level')) || 1, 11),
  phase: '', // 'countdown', 'memorize', 'input'
  currentTheme: localStorage.getItem('memory_moment_theme') || 'cyber',

  // 게임 일시정지 및 타이머 제어용
  isPaused: false,
  countdownInterval: null,
  countdownRemaining: 3,
  timerStartTime: 0,
  timerDuration: 0,
  timerRemaining: 0,
  delayTimeout: null,
  wasInDelay: false,
};

// DOM 요소 참조
const screens = {
  home: document.getElementById('screen-home'),
  stages: document.getElementById('screen-stages'),
  game: document.getElementById('screen-game'),
  gameover: document.getElementById('screen-gameover'),
  allclear: document.getElementById('screen-allclear'),
};

const dom = {
  container: document.getElementById('game-container'),
  bestScore: document.getElementById('best-score'),
  btnStart: document.getElementById('btn-start-game'),
  btnStagesBack: document.getElementById('btn-stages-back'),
  stagesGrid: document.getElementById('stages-grid'),
  btnRestart: document.getElementById('btn-restart-game'),
  btnRestartAllclear: document.getElementById('btn-restart-allclear'),
  countdownOverlay: document.getElementById('countdown-overlay'),
  gameLevel: document.getElementById('game-level'),
  gameHearts: document.getElementById('game-hearts'),
  timerContainer: document.getElementById('timer-container'),
  timerBar: document.getElementById('timer-bar'),
  inputSlots: document.getElementById('input-slots'),
  shuffleBadge: document.getElementById('shuffle-badge'),
  keypad: document.getElementById('keypad'),
  endLevel: document.getElementById('end-level'),
  endScore: document.getElementById('end-score'),
  allclearScore: document.getElementById('allclear-score'),
  feedbackOverlay: document.getElementById('feedback-overlay'),

  // 게임 포기 관련 신규 DOM 요소
  btnGameBack: document.getElementById('btn-game-back'),
  modalAbandon: document.getElementById('modal-abandon'),
  btnAbandonCancel: document.getElementById('btn-abandon-cancel'),
  btnAbandonConfirm: document.getElementById('btn-abandon-confirm'),

  // 설정 모달 관련 DOM 요소
  btnSettings: document.getElementById('btn-settings'),
  modalSettings: document.getElementById('modal-settings'),
  btnSettingsClose: document.getElementById('btn-settings-close'),
  btnQuitGame: document.getElementById('btn-quit-game'),
  toggleBgm: document.getElementById('toggle-bgm'),
  toggleSfx: document.getElementById('toggle-sfx'),
  btnThemeOptions: document.querySelectorAll('.btn-theme-option'),
};

// 초기화 이벤트 등록
document.addEventListener('DOMContentLoaded', () => {
  initGame();

  // ⭐️ 사용자 첫 터치/클릭 시 배경음악 활성화 (보안 정책 대응 - 모바일 터치 및 데스크톱 클릭 대응)
  const startAudioOnFirstTouch = () => {
    gameAudio.startBgm();
    document.removeEventListener('click', startAudioOnFirstTouch);
    document.removeEventListener('touchstart', startAudioOnFirstTouch);
  };
  document.addEventListener('click', startAudioOnFirstTouch);
  document.addEventListener('touchstart', startAudioOnFirstTouch);
});

async function initGame() {
  if (dom.bestScore) dom.bestScore.textContent = `Level ${gameState.bestLevel}`;

  // 저장된 테마 불러와서 복원
  setTheme(gameState.currentTheme);

  // 브라우저 뒤로가기 가로채기를 위한 초기 상태 및 popstate 이벤트 리스너 등록
  try {
    history.replaceState({ screen: 'home' }, '');
    window.addEventListener('popstate', handlePopState);
  } catch (e) {
    console.warn('History API not supported or blocked:', e);
  }

  // 이벤트 리스너를 즉시 연결하여 첫 번째 클릭/터치 반응이 지연되지 않도록 함
  // 시작하기 버튼을 클릭하면 메인 허브인 스테이지 선택 화면으로 진입합니다.
  dom.btnStart.addEventListener('click', () => {
    gameAudio.startBgm();
    showStagesScreen();
  });
  dom.btnStagesBack.addEventListener('click', () => {
    gameAudio.init();
    gameAudio.playClick();
    changeScreen('home');
  });
  // 게임오버 및 올클리어 재도전 시에도 스테이지 선택 화면으로 복귀시킵니다.
  dom.btnRestart.addEventListener('click', showStagesScreen);
  dom.btnRestartAllclear.addEventListener('click', showStagesScreen);

  // 게임 진행 중 뒤로가기 및 게임포기 확인 모달 관련 이벤트 리스너 등록
  dom.btnGameBack.addEventListener('click', onGameBackClick);
  dom.btnAbandonCancel.addEventListener('click', closeAbandonModal);
  dom.btnAbandonConfirm.addEventListener('click', confirmAbandonGame);

  // 설정 관련 버튼 이벤트 연결
  dom.btnSettings.addEventListener('click', () => {
    gameAudio.startBgm();
    showSettingsModal();
  });
  dom.btnSettingsClose.addEventListener('click', closeSettingsModal);

  // 종료하기 관련 버튼 이벤트 연결
  if (dom.btnQuitGame) {
    dom.btnQuitGame.addEventListener('click', () => {
      gameAudio.init();
      gameAudio.playClick();
      if (confirm('게임을 종료하시겠습니까? (이 브라우저 탭을 닫으실 수 있습니다)')) {
        window.close();
        setTimeout(() => {
          alert('웹 브라우저 보안 정책에 의해 자동으로 창을 닫을 수 없습니다. 직접 브라우저 탭을 닫아주세요.');
        }, 300);
      }
    });
  }

  dom.toggleBgm.addEventListener('change', (e) => {
    gameAudio.setBgmEnabled(e.target.checked);
  });
  dom.toggleSfx.addEventListener('change', (e) => {
    gameAudio.setSfxEnabled(e.target.checked);
  });

  dom.btnThemeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTheme = btn.getAttribute('data-theme');
      setTheme(selectedTheme);
    });
  });

  await loadStages();
}

async function loadStages() {
  try {
    const response = await fetch('stages.json');
    if (response.ok) {
      stagesData = await response.json();
      console.log('Successfully loaded stages from stages.json');
    }
  } catch (error) {
    console.warn('stages.json load failed (CORS/File Protocol). Using embedded configuration fallback.', error);
    stagesData = DEFAULT_STAGES;
  }
}

function changeScreen(targetScreenName, preventPush = false) {
  Object.keys(screens).forEach(key => {
    if (key === targetScreenName) {
      screens[key].classList.add('active');
    } else {
      screens[key].classList.remove('active');
    }
  });

  // popstate 핸들러 내부에서 전환한 경우가 아닐 때만 브라우저 히스토리 스택 추가
  if (!preventPush) {
    try {
      if (!history.state || history.state.screen !== targetScreenName) {
        history.pushState({ screen: targetScreenName }, '');
      }
    } catch (e) {
      console.warn('Failed to push history state:', e);
    }
  }
}

function renderHearts(container) {
  container.innerHTML = '';
  for (let i = 0; i < gameState.maxLives; i++) {
    const heart = document.createElement('span');
    heart.className = 'heart';
    heart.innerHTML = '❤️';
    if (i >= gameState.lives) {
      heart.classList.add('lost');
    }
    container.appendChild(heart);
  }
}

// 시작하기: 선언된 gameState의 레벨로 인게임 플레이 시작
function startGame() {
  gameAudio.init();
  gameAudio.playClick();
  gameState.lives = gameState.maxLives;
  startRound();
}

function restartGame() {
  gameAudio.init();
  gameAudio.playClick();

  // 제품판에서는 재시작 시 1탄 초기화
  gameState.currentLevel = 1;
  gameState.score = 0;
  gameState.lives = gameState.maxLives;

  startRound();
}

// 라운드 준비 (카운트다운)
function startRound() {
  // 혹시 남아있을 모든 타이머 정리
  clearAllGameTimers();

  updateDifficulty();

  gameState.phase = 'countdown';
  gameState.inputNumber = '';
  gameState.isPaused = false;
  gameState.countdownRemaining = 3;

  changeScreen('game');

  // 탑바 레벨 및 하트 정보 동기화
  dom.gameLevel.textContent = gameState.currentLevel;
  renderHearts(dom.gameHearts);

  // 카운트다운 시작할 때 해당 레벨의 키패드를 미리 빌드하여 테두리는 노출하되 숫자는 안 보이고 터치 불가하게 readonly 설정
  buildKeypad();
  dom.keypad.classList.remove('hidden');
  dom.keypad.classList.add('readonly');

  dom.timerContainer.style.opacity = '0';
  dom.shuffleBadge.classList.remove('show'); // 카운트다운/암기 시 셔플 배지 숨김
  dom.inputSlots.classList.add('guiding');

  // 입력 슬롯 미리 생성
  buildInputSlots();

  // 카운트다운 시작
  runCountdown();
}

function runCountdown() {
  dom.countdownOverlay.textContent = gameState.countdownRemaining;
  dom.countdownOverlay.classList.remove('show');
  void dom.countdownOverlay.offsetWidth;
  dom.countdownOverlay.classList.add('show');
  gameAudio.playTick();

  if (gameState.countdownInterval) clearInterval(gameState.countdownInterval);

  gameState.countdownInterval = setInterval(() => {
    if (gameState.isPaused) return;

    gameState.countdownRemaining--;
    if (gameState.countdownRemaining > 0) {
      dom.countdownOverlay.textContent = gameState.countdownRemaining;
      gameAudio.playTick();
      dom.countdownOverlay.classList.remove('show');
      void dom.countdownOverlay.offsetWidth;
      dom.countdownOverlay.classList.add('show');
    } else {
      clearInterval(gameState.countdownInterval);
      gameState.countdownInterval = null;
      dom.countdownOverlay.classList.remove('show');
      gameAudio.playStart();

      // 카운트다운이 종료되면 암기 단계로 넘어갑니다.
      showNumberStage();
    }
  }, 1000);
}

// 난이도 판단 알고리즘
function updateDifficulty() {
  const lvl = gameState.currentLevel;

  if (stagesData && stagesData[lvl - 1]) {
    const config = stagesData[lvl - 1];
    gameState.digits = config.digits;
    gameState.showTime = config.showTime;
    gameState.keypadFadeTime = config.keypadFadeTime;
    gameState.isShuffledKeypad = config.isShuffledKeypad;
  } else {
    const config = stagesData[stagesData.length - 1];
    gameState.digits = config.digits;
    gameState.showTime = config.showTime;
    gameState.keypadFadeTime = config.keypadFadeTime;
    gameState.isShuffledKeypad = config.isShuffledKeypad;
  }
}

// 실제 답 쓰는 슬롯 박스들 생성
function buildInputSlots() {
  dom.inputSlots.innerHTML = '';
  for (let i = 0; i < gameState.digits; i++) {
    const slot = document.createElement('div');
    slot.className = 'input-slot';
    dom.inputSlots.appendChild(slot);
  }
}

// 암기 페이즈 (숫자 노출)
function showNumberStage() {
  gameState.phase = 'memorize';
  gameState.isPaused = false;

  // 1. 카운트다운 오버레이를 지우고, 가이드 흐림을 해제하여 실제 빈 게임판을 먼저 노출시킵니다.
  dom.countdownOverlay.classList.remove('show');
  dom.inputSlots.classList.remove('guiding');

  // 실제 입력 슬롯 박스들을 비워 둔 채로 유지
  const slots = dom.inputSlots.querySelectorAll('.input-slot');
  slots.forEach(slot => {
    slot.textContent = '';
    slot.classList.remove('active');
    slot.classList.remove('filled');
  });

  // 카운트다운이 끝난 후 실제 게임화면(빈 슬롯)을 5프레임(약 250ms) 동안 유지한 뒤 숫자를 보여줍니다.
  if (gameState.delayTimeout) clearTimeout(gameState.delayTimeout);

  gameState.delayTimeout = setTimeout(revealNumbers, 250); // 5프레임 대략 250ms 딜레이
}

function revealNumbers() {
  gameState.delayTimeout = null;
  if (gameState.phase !== 'memorize') return;

  gameState.targetNumber = generateRandomNumber(gameState.digits);

  // 슬롯에 타겟 숫자 채워 넣기
  const slots = dom.inputSlots.querySelectorAll('.input-slot');
  slots.forEach((slot, index) => {
    slot.textContent = gameState.targetNumber[index];
    slot.classList.add('active'); // 노출 하이라이트
  });

  // 타이머 바 노출 및 가동
  dom.timerContainer.style.opacity = '1';
  dom.timerBar.style.transform = 'scaleX(1)';

  gameState.timerDuration = gameState.showTime * 1000;
  gameState.timerRemaining = gameState.timerDuration;
  gameState.timerStartTime = performance.now();

  if (gameState.timerInterval) cancelAnimationFrame(gameState.timerInterval);

  // 1프레임 "깜빡" 처리
  if (gameState.showTime <= 0.05) {
    dom.timerBar.style.transform = 'scaleX(0)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        showInputStage();
      });
    });
    return;
  }

  runMemoryTimer();
}

function runMemoryTimer() {
  if (gameState.timerInterval) cancelAnimationFrame(gameState.timerInterval);

  function animateTimer(timestamp) {
    if (gameState.phase !== 'memorize' || gameState.isPaused) return;

    const elapsed = timestamp - gameState.timerStartTime;
    const currentRemaining = gameState.timerRemaining - elapsed;
    const remainingRatio = Math.max(0, currentRemaining / gameState.timerDuration);

    dom.timerBar.style.transform = `scaleX(${remainingRatio})`;

    if (currentRemaining > 0) {
      gameState.timerInterval = requestAnimationFrame(animateTimer);
    } else {
      dom.timerBar.style.transform = 'scaleX(0)';
      // 0.1초 뒤 입력 페이즈로 이동
      gameState.delayTimeout = setTimeout(showInputStage, 100);
    }
  }

  gameState.timerStartTime = performance.now();
  gameState.timerInterval = requestAnimationFrame(animateTimer);
}

// 입력 페이즈 진입
function showInputStage() {
  if (gameState.timerInterval) cancelAnimationFrame(gameState.timerInterval);

  gameState.phase = 'input';
  dom.keypad.classList.remove('readonly');

  // 타이머 바 숨김
  dom.timerContainer.style.opacity = '0';

  // 암기 숫자를 슬롯에서 싹 지우고 첫 칸에 커서 활성화 (초기화)
  const slots = dom.inputSlots.querySelectorAll('.input-slot');
  slots.forEach((slot, index) => {
    slot.textContent = '';
    slot.classList.remove('active');
    if (index === 0) slot.classList.add('active');
  });

  // ⭐️ [해결책] 이미 buildKeypad가 카운트다운 시작 시 호출되었으므로, 
  // 더 이상 여기서 버튼을 새로 꽂아 높이를 흔들지 않고, 숨겨져 있던 키패드에 hidden만 해제합니다!
  dom.keypad.classList.remove('hidden');

  // 배지 상태 연동
  dom.shuffleBadge.innerHTML = '';
  if (gameState.isShuffledKeypad || gameState.keypadFadeTime > 0) {
    dom.shuffleBadge.classList.add('show');
    let badgeHTML = '';
    if (gameState.isShuffledKeypad) {
      badgeHTML += '⚡ RANDOM ';
    }
    if (gameState.keypadFadeTime > 0) {
      badgeHTML += `👁️ BLIND (${gameState.keypadFadeTime}s)`;
    }
    dom.shuffleBadge.innerHTML = badgeHTML;
  } else {
    dom.shuffleBadge.classList.remove('show');
  }

  // 키패드 블라인드 효과 (step-end 즉시 숨김) 적용
  dom.keypad.classList.remove('fade-out-3s', 'fade-out-2s', 'fade-out-1s');
  void dom.keypad.offsetWidth;
  if (gameState.keypadFadeTime > 0) {
    dom.keypad.classList.add(`fade-out-${gameState.keypadFadeTime}s`);
  }
}

function updateInputSlots() {
  const slots = dom.inputSlots.querySelectorAll('.input-slot');
  slots.forEach((slot, index) => {
    if (index < gameState.inputNumber.length) {
      if (gameState.keypadFadeTime > 0) {
        slot.textContent = '●';
      } else {
        slot.textContent = gameState.inputNumber[index];
      }
      slot.classList.add('filled');
      slot.classList.remove('active');
    } else {
      slot.textContent = '';
      slot.classList.remove('filled');
      if (index === gameState.inputNumber.length) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    }
  });
}

function buildKeypad() {
  dom.keypad.innerHTML = '';
  let numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  if (gameState.isShuffledKeypad) {
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
  }

  const keypadLayout = [];
  for (let i = 0; i < 9; i++) {
    keypadLayout.push({ type: 'number', value: numbers[i] });
  }
  keypadLayout.push({ type: 'empty', value: '' });
  keypadLayout.push({ type: 'number', value: numbers[9] });
  keypadLayout.push({ type: 'backspace', value: '⌫' });

  keypadLayout.forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'keypad-btn';

    if (key.type === 'empty') {
      btn.classList.add('empty');
    } else if (key.type === 'backspace') {
      btn.classList.add('action-btn', 'delete-btn');
      btn.textContent = key.value;
      btn.addEventListener('click', () => handleInput('backspace'));
    } else {
      btn.textContent = key.value;
      btn.addEventListener('click', () => handleInput('number', key.value));
    }

    dom.keypad.appendChild(btn);
  });
}

function handleInput(type, val) {
  // 입력 페이즈가 아닐 때는 조작 및 사운드 출력 완전 차단
  if (gameState.phase !== 'input') return;

  gameAudio.playClick();

  if (type === 'number') {
    if (gameState.inputNumber.length < gameState.digits) {
      gameState.inputNumber += val;
      updateInputSlots();

      if (navigator.vibrate) {
        navigator.vibrate(15);
      }

      if (gameState.inputNumber.length === gameState.digits) {
        setTimeout(checkAnswer, 150);
      }
    }
  } else if (type === 'backspace') {
    if (gameState.inputNumber.length > 0) {
      gameState.inputNumber = gameState.inputNumber.slice(0, -1);
      updateInputSlots();
    }
  }
}

function checkAnswer() {
  const isCorrect = gameState.inputNumber === gameState.targetNumber;

  dom.keypad.classList.remove('fade-out-3s', 'fade-out-2s', 'fade-out-1s');

  if (isCorrect) {
    handleRoundSuccess();
  } else {
    handleRoundFailure();
  }
}

function handleRoundSuccess() {
  gameAudio.playSuccess();
  showFeedback('SUCCESS', 'feedback-success');

  gameState.score++;

  const maxLevel = stagesData.length;
  if (gameState.currentLevel === maxLevel) {
    if (maxLevel > gameState.bestLevel) {
      gameState.bestLevel = maxLevel;
      localStorage.setItem('memory_moment_best_level', maxLevel);
    }
    setTimeout(showAllClear, 1000);
    return;
  }

  gameState.currentLevel++;

  if (gameState.currentLevel > gameState.bestLevel) {
    gameState.bestLevel = gameState.currentLevel;
    localStorage.setItem('memory_moment_best_level', gameState.bestLevel); // 저장 로직 보정
  }

  setTimeout(() => {
    startRound();
  }, 1000);
}

function handleRoundFailure() {
  gameAudio.playWrong();
  dom.inputSlots.classList.add('shake');
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }

  showFeedback('WRONG', 'feedback-wrong');
  gameState.lives--;

  setTimeout(() => {
    dom.inputSlots.classList.remove('shake');
    if (gameState.lives > 0) {
      startRound();
    } else {
      showGameOver();
    }
  }, 1000);
}

function showFeedback(text, className) {
  dom.feedbackOverlay.textContent = text;
  dom.feedbackOverlay.className = `feedback-overlay show ${className}`;

  setTimeout(() => {
    dom.feedbackOverlay.classList.remove('show');
  }, 800);
}

function showGameOver() {
  gameAudio.stopBgm();
  gameAudio.playGameOver();

  dom.endLevel.textContent = `Level ${gameState.currentLevel}`;
  dom.endScore.textContent = gameState.score;
  if (dom.bestScore) dom.bestScore.textContent = `Level ${gameState.bestLevel}`;

  changeScreen('gameover');
}

function showAllClear() {
  const maxLevel = stagesData.length;
  gameAudio.stopBgm();
  dom.allclearScore.textContent = gameState.score;
  if (dom.bestScore) dom.bestScore.textContent = `Level ${maxLevel}`;

  const allclearLevelLabel = document.querySelector('#screen-allclear .stat-value.highlight');
  if (allclearLevelLabel) {
    allclearLevelLabel.textContent = `Level ${maxLevel}`;
  }

  changeScreen('allclear');
}

function generateRandomNumber(digits) {
  let numStr = '';
  for (let i = 0; i < digits; i++) {
    numStr += Math.floor(Math.random() * 10).toString();
  }
  return numStr;
}

// 스테이지 선택 화면 동적 빌드 및 페이지 전환
function showStagesScreen() {
  gameAudio.init();
  gameAudio.playClick();
  gameAudio.startBgm();

  // 최고 도달 스테이지 정보 동기화 (테스트 셋업 및 현재 설정 연동)
  gameState.bestLevel = Math.max(parseInt(localStorage.getItem('memory_moment_best_level')) || 1, gameState.currentLevel);

  dom.stagesGrid.innerHTML = '';

  for (let i = 1; i <= stagesData.length; i++) {
    const stageConfig = stagesData[i - 1] || DEFAULT_STAGES[i - 1] || {};
    const digits = stageConfig.digits || 4;
    const showTime = stageConfig.showTime || 3.0;
    const keypadFadeTime = stageConfig.keypadFadeTime || 0;
    const isShuffledKeypad = stageConfig.isShuffledKeypad || false;

    // 타임라인 아이템 (래퍼) 생성
    const item = document.createElement('div');
    item.className = 'stage-timeline-item';

    // 실제 스테이지 정보 행 (Row)
    const row = document.createElement('div');
    row.className = 'stage-row';

    // 1. 스테이지 번호 및 스펙 영역
    const infoSection = document.createElement('div');
    infoSection.className = 'stage-info-section';

    const stageNum = document.createElement('div');
    stageNum.className = 'stage-number';
    stageNum.textContent = `STAGE ${i.toString().padStart(2, '0')}`;
    infoSection.appendChild(stageNum);

    // 스펙 배지들 컨테이너
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'stage-badge-container';

    // 자릿수 배지 (div 기반 미니어처 슬롯들로 동적 렌더링)
    const digitsBadge = document.createElement('div');
    digitsBadge.className = 'spec-badge digits-badge';

    for (let d = 0; d < digits; d++) {
      const square = document.createElement('div');
      square.className = 'square-dot';
      digitsBadge.appendChild(square);
    }
    badgeContainer.appendChild(digitsBadge);

    // 노출 시간 배지
    const timeBadge = document.createElement('span');
    timeBadge.className = 'spec-badge time-badge';
    if (showTime <= 0.05) {
      timeBadge.textContent = '⚡깜빡';
      timeBadge.classList.add('flash-badge');
    } else {
      timeBadge.textContent = `${showTime}초`;
    }
    badgeContainer.appendChild(timeBadge);

    // 기믹 배지 (BLIND)
    if (keypadFadeTime > 0) {
      const blindBadge = document.createElement('span');
      blindBadge.className = 'spec-badge blind-badge';
      blindBadge.textContent = `👁️⏝`;
      badgeContainer.appendChild(blindBadge);
    }

    // 기믹 배지 (SHUFFLE)
    if (isShuffledKeypad) {
      const shuffleBadge = document.createElement('span');
      shuffleBadge.className = 'spec-badge shuffle-badge-small';
      shuffleBadge.textContent = `🔀셔플`;
      badgeContainer.appendChild(shuffleBadge);
    }

    infoSection.appendChild(badgeContainer);
    row.appendChild(infoSection);

    // 2. 우측 상태 영역
    const actionSection = document.createElement('div');
    actionSection.className = 'stage-action-section';

    // 상태/난이도 테마 분류용 클래스를 item 및 row에 덧붙여서 노드와 자릿수 미니 박스의 색상을 동기화함
    const maxLevel = stagesData.length;
    const third = Math.floor(maxLevel / 3);
    let themeClass = 'theme-easy';
    if (i > third * 2) {
      themeClass = 'theme-hard';
    } else if (i > third) {
      themeClass = 'theme-medium';
    }
    item.classList.add(themeClass);
    row.classList.add(themeClass);

    if (i <= gameState.bestLevel) {
      item.classList.add('unlocked');
      row.classList.add('unlocked');

      // 이미 깬 레벨과 도전할 레벨 구별
      if (i < gameState.bestLevel) {
        item.classList.add('cleared');
        row.classList.add('cleared');
        const clearLabel = document.createElement('span');
        clearLabel.className = 'stage-status-badge status-cleared';
        clearLabel.textContent = 'CLEARED';
        actionSection.appendChild(clearLabel);
      } else {
        item.classList.add('active-stage');
        row.classList.add('active-stage');
      }

      row.addEventListener('click', () => {
        gameAudio.playClick();

        // 해당 스테이지 레벨 셋업
        gameState.currentLevel = i;
        gameState.score = i - 1;
        gameState.lives = gameState.maxLives;

        startRound();
      });
    } else {
      item.classList.add('locked');
      row.classList.add('locked');
      const lockLabel = document.createElement('span');
      lockLabel.className = 'stage-status-badge status-locked';
      lockLabel.textContent = 'LOCKED';
      actionSection.appendChild(lockLabel);
    }

    row.appendChild(actionSection);
    item.appendChild(row);
    dom.stagesGrid.appendChild(item);
  }

  changeScreen('stages');
}

// =============================================================================
// 게임 포기 및 일시정지(Pause) / 재개(Resume) 시스템
// =============================================================================

// 인게임 뒤로가기 버튼 클릭 (게임 일시정지 및 포기 확인 모달 띄우기)
function onGameBackClick() {
  gameAudio.init();
  gameAudio.playClick();
  gameAudio.pauseBgm(); // BGM 임시 일시정지 (볼륨 페이드아웃)

  // 이미 모달이 떠 있거나 인게임 상태가 아닌 경우는 오동작 방지
  if (gameState.phase === '') {
    changeScreen('stages');
    return;
  }

  pauseGame();
  dom.modalAbandon.classList.add('show');
}

// 게임 일시정지 처리 (타이머 멈춤)
function pauseGame() {
  if (gameState.isPaused) return;
  gameState.isPaused = true;

  // 1. 카운트다운 페이즈 일시정지
  if (gameState.phase === 'countdown') {
    if (gameState.countdownInterval) {
      clearInterval(gameState.countdownInterval);
      gameState.countdownInterval = null;
    }
  }

  // 2. 암기 페이즈 일시정지
  if (gameState.phase === 'memorize') {
    // 딜레이 타이머가 대기 중이었다면 취소
    if (gameState.delayTimeout) {
      clearTimeout(gameState.delayTimeout);
      gameState.delayTimeout = null;
      gameState.wasInDelay = true; // 딜레이 대기 중이었음을 기록
    } else {
      gameState.wasInDelay = false;
      // 실행 중이던 requestAnimationFrame 애니메이션 취소 및 남은 시간 저장
      if (gameState.timerInterval) {
        cancelAnimationFrame(gameState.timerInterval);
        gameState.timerInterval = null;
      }
      const elapsed = performance.now() - gameState.timerStartTime;
      gameState.timerRemaining = Math.max(0, gameState.timerRemaining - elapsed);
    }
  }
}

// 모달창에서 '계속하기' 클릭 시 게임 재개
function closeAbandonModal() {
  gameAudio.init();
  gameAudio.playClick();
  gameAudio.resumeBgm(); // BGM 복원 (볼륨 페이드인)

  dom.modalAbandon.classList.remove('show');
  resumeGame();
}

// 게임 재개 처리 (타이머 다시 구동)
function resumeGame() {
  if (!gameState.isPaused) return;
  gameState.isPaused = false;

  // 1. 카운트다운 페이즈 재개
  if (gameState.phase === 'countdown') {
    runCountdown();
  }

  // 2. 암기 페이즈 재개
  if (gameState.phase === 'memorize') {
    if (gameState.wasInDelay) {
      gameState.wasInDelay = false;
      // 5프레임 딜레이(빈 슬롯 유지)를 재개 (250ms)
      gameState.delayTimeout = setTimeout(revealNumbers, 250);
    } else {
      // 남은 타이머 시간부터 다시 구동
      gameState.timerStartTime = performance.now();
      runMemoryTimer();
    }
  }
}

// 모달창에서 '포기하기' 클릭 시 게임 완전히 종료하고 스테이지 화면으로 이동
function confirmAbandonGame() {
  gameAudio.init();
  gameAudio.playClick();
  gameAudio.resumeBgm(); // BGM 복원 (볼륨 페이드인)

  // 모든 인게임 타이머 리셋
  clearAllGameTimers();

  dom.modalAbandon.classList.remove('show');

  // 브라우저 히스토리 상태를 스테이지로 되돌리기 위해 back() 실행
  // 만약 예외 상황이 있다면 fallback으로 showStagesScreen 호출
  try {
    if (history.state && history.state.screen === 'game') {
      history.back();
    } else {
      showStagesScreen();
    }
  } catch (e) {
    showStagesScreen();
  }
}

// 모든 게임용 타이머 초기화
function clearAllGameTimers() {
  gameState.isPaused = false;
  gameState.phase = '';

  if (gameState.countdownInterval) {
    clearInterval(gameState.countdownInterval);
    gameState.countdownInterval = null;
  }
  if (gameState.timerInterval) {
    cancelAnimationFrame(gameState.timerInterval);
    gameState.timerInterval = null;
  }
  if (gameState.delayTimeout) {
    clearTimeout(gameState.delayTimeout);
    gameState.delayTimeout = null;
  }
  gameState.wasInDelay = false;
}

// 브라우저 / 하드웨어 뒤로가기 popstate 이벤트 핸들러
function handlePopState(event) {
  const state = event.state;
  if (!state) return;

  // 1. 현재 게임 플레이 중인데 뒤로가기가 감지된 경우
  if (gameState.phase !== '') {
    // 히스토리 이동을 무력화하기 위해 'game' 히스토리를 다시 주입하여 복구
    try {
      history.pushState({ screen: 'game' }, '');
    } catch (e) { }

    // 포기 확인 모달창 띄우기
    if (!dom.modalAbandon.classList.contains('show')) {
      onGameBackClick();
    }
    return;
  }

  // 2. 일반 화면 전환 (popstate에 의한 화면 전환이므로 pushState를 차단하도록 preventPush=true)
  changeScreen(state.screen, true);
}

// =============================================================================
// 게임 설정 및 테마 전환 시스템
// =============================================================================

function showSettingsModal() {
  gameAudio.init();
  gameAudio.playClick();

  // 체크박스 상태 동기화
  dom.toggleBgm.checked = gameAudio.bgmEnabled;
  dom.toggleSfx.checked = gameAudio.sfxEnabled;

  dom.modalSettings.classList.add('show');
}

function closeSettingsModal() {
  gameAudio.init();
  gameAudio.playClick();
  dom.modalSettings.classList.remove('show');
}

function setTheme(themeName) {
  // body 클래스를 지우고 새 테마 클래스 추가
  document.body.className = '';
  document.body.classList.add(`theme-${themeName}`);

  gameState.currentTheme = themeName;
  localStorage.setItem('memory_moment_theme', themeName);

  // 설정 창 내 테마 아이콘 버튼들 활성 상태 표시
  dom.btnThemeOptions.forEach(btn => {
    if (btn.getAttribute('data-theme') === themeName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
