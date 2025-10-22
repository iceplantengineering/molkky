/**
 * Game configuration constants
 */
const GAME_CONFIG = {
    canvas: {
        width: 800,
        height: 600,
        throwLineY: 500,
        startX: 400,
        startY: 520
    },
    pins: {
        centerX: 400,
        startY: 150,
        spacing: 35,
        rowSpacing: 40,
        radius: 12,
        impactRadius: 50,
        chainReactionProbability: 0.3
    },
    physics: {
        friction: 0.96,
        rotationFriction: 0.93,
        minVelocity: 0.05,
        knockForce: { min: 2, max: 4 },
        boundaryPadding: 20
    },
    molkky: {
        radius: 12,
        idleLength: 40,
        idleWidth: 8,
        flyingLength: 35,
        flyingWidth: 6,
        rotationSpeed: 0.15
    },
    throwing: {
        minSpeed: 0.02,
        maxSpeed: 0.08,
        baseSpeed: 0.05,
        speedMultiplier: 0.0001,
        maxTrailLength: 15
    }
};

/**
 * Main game class for Molkky referee training application
 */
class MolkkyGame {
    /**
     * Initialize the Molkky game
     * @throws {Error} If canvas element is not found or context cannot be created
     */
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            throw new Error('Canvas element with id "gameCanvas" not found');
        }

        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('Failed to get 2D context from canvas');
        }

        this.players = [
            { id: 1, name: 'プレイヤー1', score: 0, misses: 0, history: [] },
            { id: 2, name: 'プレイヤー2', score: 0, misses: 0, history: [] }
        ];
        this.currentPlayerIndex = 0;
        this.throwCount = 1;
        this.selectedPins = new Set();
        this.pins = this.initializePins();
        this.gameOver = false;
        this.winner = null;

        // アニメーション関連
        this.animationId = null;
        this.molkkyThrow = null;
        this.isAnimating = false;
        this.throwModeEnabled = false;

        this.initializeUI();
        this.startAnimation();
    }

    /**
     * Initialize pins with official Molkky configuration
     * @returns {Array} Array of pin objects with positions and states
     */
    initializePins() {
        const pins = [];
        const { centerX, startY, spacing, rowSpacing, radius } = GAME_CONFIG.pins;

        const positions = [
            // 1列目（一番遠い）
            { x: centerX - spacing, y: startY, number: 7 },
            { x: centerX, y: startY, number: 9 },
            { x: centerX + spacing, y: startY, number: 8 },

            // 2列目
            { x: centerX - spacing * 1.5, y: startY + rowSpacing, number: 5 },
            { x: centerX - spacing * 0.5, y: startY + rowSpacing, number: 11 },
            { x: centerX + spacing * 0.5, y: startY + rowSpacing, number: 12 },
            { x: centerX + spacing * 1.5, y: startY + rowSpacing, number: 6 },

            // 3列目
            { x: centerX - spacing, y: startY + rowSpacing * 2, number: 3 },
            { x: centerX, y: startY + rowSpacing * 2, number: 10 },
            { x: centerX + spacing, y: startY + rowSpacing * 2, number: 4 },

            // 4列目（手前）
            { x: centerX - spacing * 0.5, y: startY + rowSpacing * 3, number: 1 },
            { x: centerX + spacing * 0.5, y: startY + rowSpacing * 3, number: 2 }
        ];

        positions.forEach(pos => {
            pins.push({
                number: pos.number,
                x: pos.x,
                y: pos.y,
                originalX: pos.x,
                originalY: pos.y,
                knocked: false,
                radius: radius,
                velocity: { x: 0, y: 0 },
                rotation: 0,
                rotationSpeed: 0,
                animating: false
            });
        });

        return pins;
    }

    initializeUI() {
        this.createPinButtons();
        this.attachEventListeners();
        this.updateUI();
    }

    createPinButtons() {
        const pinsGrid = document.getElementById('pinsGrid');
        if (!pinsGrid) {
            console.error('Element with id "pinsGrid" not found');
            return;
        }

        pinsGrid.innerHTML = '';

        for (let i = 1; i <= 12; i++) {
            const button = document.createElement('button');
            button.className = 'pin-btn';
            button.textContent = i;
            button.dataset.pinNumber = i;
            button.addEventListener('click', () => this.togglePin(i));
            pinsGrid.appendChild(button);
        }
    }

    /**
     * Toggle a pin's knocked state
     * @param {number} pinNumber - Pin number (1-12)
     */
    togglePin(pinNumber) {
        if (this.isAnimating) return;

        if (pinNumber < 1 || pinNumber > 12) {
            console.error(`Invalid pin number: ${pinNumber}`);
            return;
        }

        const pin = this.pins.find(p => p.number === pinNumber);
        if (!pin) {
            console.error(`Pin ${pinNumber} not found in game state`);
            return;
        }

        const button = document.querySelector(`[data-pin-number="${pinNumber}"]`);
        if (!button) {
            console.warn(`Button for pin ${pinNumber} not found in DOM`);
        }

        // すでに倒れているピンは元に戻せない
        if (pin.knocked) {
            return;
        }

        pin.knocked = true;
        if (button) {
            button.classList.add('knocked');
        }
        this.knockDownPin(pin);
    }

    /**
     * Knock down a pin with physics simulation
     * @param {Object} pin - Pin object to knock down
     */
    knockDownPin(pin) {
        const angle = Math.random() * Math.PI * 2;
        const { min, max } = GAME_CONFIG.physics.knockForce;
        const force = min + Math.random() * (max - min);

        // エリア内に収まるように方向を制限
        let safeAngle = angle;
        if (pin.y < GAME_CONFIG.pins.startY) {
            safeAngle = Math.PI / 4 + Math.random() * Math.PI / 2;
        } else if (pin.y > 350) {
            safeAngle = -Math.PI / 4 + Math.random() * Math.PI / 2;
        }
        if (pin.x < 200) {
            safeAngle = -Math.PI / 6 + Math.random() * Math.PI / 3;
        } else if (pin.x > 600) {
            safeAngle = Math.PI * 5/6 + Math.random() * Math.PI / 3;
        }

        pin.velocity = {
            x: Math.cos(safeAngle) * force,
            y: Math.sin(safeAngle) * force
        };
        pin.rotationSpeed = (Math.random() - 0.5) * 0.15;
        pin.animating = true;

        this.calculateChainReaction(pin);
    }

    calculateChainReaction(knockedPin) {
        const { impactRadius, chainReactionProbability } = GAME_CONFIG.pins;

        this.pins.forEach(pin => {
            if (pin !== knockedPin && !pin.knocked) {
                const distance = Math.sqrt(
                    Math.pow(pin.x - knockedPin.x, 2) +
                    Math.pow(pin.y - knockedPin.y, 2)
                );

                if (distance < impactRadius) {
                    if (Math.random() < chainReactionProbability) {
                        setTimeout(() => {
                            pin.knocked = true;
                            const button = document.querySelector(`[data-pin-number="${pin.number}"]`);
                            if (button) button.classList.add('knocked');
                            this.knockDownPin(pin);
                        }, 100 + Math.random() * 200);
                    }
                }
            }
        });
    }

    resetPinState(pin, resetPosition = true) {
        pin.knocked = false;
        pin.velocity = { x: 0, y: 0 };
        pin.rotation = 0;
        pin.rotationSpeed = 0;
        pin.animating = false;

        if (resetPosition) {
            pin.x = pin.originalX;
            pin.y = pin.originalY;
        }
    }

    startAnimation() {
        const animate = () => {
            this.updatePhysics();
            this.drawGameField();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    updatePhysics() {
        const { friction, rotationFriction, minVelocity, boundaryPadding } = GAME_CONFIG.physics;

        this.pins.forEach(pin => {
            if (pin.animating) {
                // 位置更新
                pin.x += pin.velocity.x;
                pin.y += pin.velocity.y;
                pin.rotation += pin.rotationSpeed;

                // 摩擦
                pin.velocity.x *= friction;
                pin.velocity.y *= friction;
                pin.rotationSpeed *= rotationFriction;

                // 速度が小さくなったら停止
                if (Math.abs(pin.velocity.x) < minVelocity &&
                    Math.abs(pin.velocity.y) < minVelocity) {
                    pin.velocity.x = 0;
                    pin.velocity.y = 0;
                    pin.rotationSpeed = 0;
                    pin.animating = false;
                }

                // 境界チェック
                const minX = pin.radius + boundaryPadding;
                const maxX = this.canvas.width - pin.radius - boundaryPadding;
                const minY = pin.radius + boundaryPadding;
                const maxY = 480 - pin.radius;

                if (pin.x < minX) {
                    pin.velocity.x = Math.abs(pin.velocity.x) * 0.5;
                    pin.x = minX;
                }
                if (pin.x > maxX) {
                    pin.velocity.x = -Math.abs(pin.velocity.x) * 0.5;
                    pin.x = maxX;
                }
                if (pin.y < minY) {
                    pin.velocity.y = Math.abs(pin.velocity.y) * 0.5;
                    pin.y = minY;
                }
                if (pin.y > maxY) {
                    pin.velocity.y = -Math.abs(pin.velocity.y) * 0.5;
                    pin.y = maxY;
                }
            }
        });

        // モルックの投球アニメーション
        if (this.molkkyThrow) {
            this.updateMolkkyThrow();
        }
    }

    /**
     * Throw molkky stick towards target position
     * @param {number} targetX - Target X coordinate
     * @param {number} targetY - Target Y coordinate
     */
    throwMolkky(targetX, targetY) {
        if (this.isAnimating) {
            return;
        }

        this.isAnimating = true;
        const { startX, startY } = GAME_CONFIG.canvas;
        const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

        const { minSpeed, maxSpeed, baseSpeed, speedMultiplier } = GAME_CONFIG.throwing;
        const speed = Math.max(minSpeed, Math.min(maxSpeed, baseSpeed + distance * speedMultiplier));

        this.molkkyThrow = {
            x: startX,
            y: startY,
            targetX: targetX,
            targetY: targetY,
            progress: 0,
            speed: speed,
            rotation: 0,
            trail: [],
            distance: distance
        };
    }

    handleCanvasClick(e) {
        if (!this.throwModeEnabled || this.isAnimating) {
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // どこをクリックしてもその位置が目標になる（平面図なので）
        // 投球エリア制限を廃止 - キャンバス全体を投球可能に
        if (y < 480) { // 投球ラインより上
            this.throwMolkky(x, y);
        }
    }

    updateMolkkyThrow() {
        if (!this.molkkyThrow) return;

        this.molkkyThrow.progress += this.molkkyThrow.speed;
        this.molkkyThrow.rotation += GAME_CONFIG.molkky.rotationSpeed;

        const t = this.molkkyThrow.progress;
        const { startX, startY } = GAME_CONFIG.canvas;

        // 単純な直線補間
        this.molkkyThrow.x = startX + (this.molkkyThrow.targetX - startX) * t;
        this.molkkyThrow.y = startY + (this.molkkyThrow.targetY - startY) * t;

        // 軌跡を保存
        this.molkkyThrow.trail.push({ x: this.molkkyThrow.x, y: this.molkkyThrow.y });
        if (this.molkkyThrow.trail.length > GAME_CONFIG.throwing.maxTrailLength) {
            this.molkkyThrow.trail.shift();
        }

        this.checkMolkkyCollision();

        if (this.molkkyThrow.progress >= 1) {
            this.molkkyThrow = null;
            this.isAnimating = false;
        }
    }

    checkMolkkyCollision() {
        if (!this.molkkyThrow) return;

        const molkkyRadius = GAME_CONFIG.molkky.radius;

        this.pins.forEach(pin => {
            if (!pin.knocked) {
                const distance = Math.sqrt(
                    Math.pow(pin.x - this.molkkyThrow.x, 2) +
                    Math.pow(pin.y - this.molkkyThrow.y, 2)
                );

                if (distance < pin.radius + molkkyRadius) {
                    pin.knocked = true;
                    const button = document.querySelector(`[data-pin-number="${pin.number}"]`);
                    if (button) button.classList.add('knocked');

                    this.knockDownPin(pin);
                }
            }
        });
    }

    attachEventListeners() {
        const confirmBtn = document.getElementById('confirmThrow');
        const resetBtn = document.getElementById('resetPins');
        const newGameBtn = document.getElementById('newGame');
        const throwModeBtn = document.getElementById('throwMode');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmThrow());
        } else {
            console.error('Element with id "confirmThrow" not found');
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetPins());
        } else {
            console.error('Element with id "resetPins" not found');
        }

        if (newGameBtn) {
            newGameBtn.addEventListener('click', () => this.newGame());
        } else {
            console.error('Element with id "newGame" not found');
        }

        if (throwModeBtn) {
            throwModeBtn.addEventListener('click', () => this.toggleThrowMode());
        } else {
            console.error('Element with id "throwMode" not found');
        }

        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
    }

    toggleThrowMode() {
        const button = document.getElementById('throwMode');
        if (!button) {
            console.error('Element with id "throwMode" not found');
            return;
        }

        this.throwModeEnabled = !this.throwModeEnabled;

        if (this.throwModeEnabled) {
            button.textContent = '投球モード: ON';
            button.classList.add('active');
            this.canvas.style.cursor = 'crosshair';
        } else {
            button.textContent = '投球モード: OFF';
            button.classList.remove('active');
            this.canvas.style.cursor = 'default';
        }
    }

    drawGameField() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 背景
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 投げるエリア
        this.ctx.fillStyle = '#27ae60';
        this.ctx.fillRect(0, 500, this.canvas.width, 100);

        // 投げるエリアのラベル
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';

        if (this.throwModeEnabled) {
            this.ctx.fillText('投球モード！ピンめがけてクリックしてください', 400, 540);
            this.ctx.font = '14px Arial';
            this.ctx.fillText('平面図 - クリックした位置にモルックが直進します', 400, 560);
        } else {
            this.ctx.fillText('投げるエリア（投球モードONで使用可）', 400, 550);
        }

        // ラウンド情報を表示
        const standingPins = this.pins.filter(pin => !pin.knocked).length;
        const knockedPins = this.pins.filter(pin => pin.knocked).length;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = '14px Arial';
        this.ctx.fillText(`立っているピン: ${standingPins} | 倒れたピン: ${knockedPins}`, 400, 30);

        // 次のプレイヤー情報
        const nextPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        const nextPlayer = this.players[nextPlayerIndex];
        this.ctx.fillText(`次のプレイヤー: ${nextPlayer.name}`, 400, 50);

        // 投球ライン
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(50, 500);
        this.ctx.lineTo(750, 500);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // ピンを描画
        this.pins.forEach(pin => {
            this.ctx.save();

            if (pin.animating) {
                this.ctx.translate(pin.x, pin.y);
                this.ctx.rotate(pin.rotation);
                this.ctx.translate(-pin.x, -pin.y);
            }

            if (pin.knocked && !pin.animating) {
                this.ctx.globalAlpha = 0.5;
                this.ctx.translate(pin.x, pin.y);
                this.ctx.rotate(Math.PI / 4);
                this.ctx.translate(-pin.x, -pin.y);
            }

            // ピンの影
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.ellipse(pin.x, pin.y + 5, pin.radius * 0.8, pin.radius * 0.4, 0, 0, Math.PI * 2);
            this.ctx.fill();

            // ピンの本体（円柱のような見た目）
            const gradient = this.ctx.createLinearGradient(
                pin.x - pin.radius, pin.y - pin.radius,
                pin.x + pin.radius, pin.y + pin.radius
            );

            if (pin.knocked) {
                gradient.addColorStop(0, '#95a5a6');
                gradient.addColorStop(0.5, '#7f8c8d');
                gradient.addColorStop(1, '#636e72');
            } else {
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.3, '#ecf0f1');
                gradient.addColorStop(1, '#bdc3c7');
            }

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // ピンの縁
            this.ctx.strokeStyle = pin.knocked ? '#636e72' : '#34495e';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // ピンの番号
            this.ctx.fillStyle = pin.knocked ? '#ecf0f1' : '#2c3e50';
            this.ctx.font = `bold ${pin.radius * 0.8}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(pin.number, pin.x, pin.y);

            this.ctx.restore();
        });

        // モルックの軌跡を描画
        if (this.molkkyThrow && this.molkkyThrow.trail.length > 0) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 4;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.molkkyThrow.trail.forEach((point, index) => {
                if (index === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
            this.ctx.stroke();
        }

        // モルック（投げる棒）を描画
        this.drawMolkky();
    }

    drawMolkky() {
        if (this.molkkyThrow) {
            // 投球中のモルック
            this.drawFlyingMolkky();
        } else {
            // 待機中のモルック
            this.drawIdleMolkky();
        }
    }

    drawMolkkyStick(x, y, rotation, length, width, isFlying = false) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rotation);

        if (isFlying) {
            this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            this.ctx.shadowBlur = 10;
        }

        // 棒のグラデーション
        const gradient = this.ctx.createLinearGradient(-length/2, 0, length/2, 0);
        gradient.addColorStop(0, '#8b4513');
        gradient.addColorStop(0.5, '#a0522d');
        gradient.addColorStop(1, '#8b4513');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(-length/2, -width/2, length, width);

        // 棒の端
        this.ctx.fillStyle = '#654321';
        this.ctx.beginPath();
        this.ctx.arc(-length/2, 0, width/2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(length/2, 0, width/2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawIdleMolkky() {
        const { startX, startY } = GAME_CONFIG.canvas;
        const { idleLength, idleWidth } = GAME_CONFIG.molkky;

        this.drawMolkkyStick(startX, startY, -Math.PI / 4, idleLength, idleWidth, false);

        // ヒントテキスト
        if (this.throwModeEnabled) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('クリックした位置が目標点になります', GAME_CONFIG.canvas.startX, 570);
        } else {
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('投球モードをONにしてクリック投球', GAME_CONFIG.canvas.startX, 570);
        }
    }

    drawFlyingMolkky() {
        const { flyingLength, flyingWidth } = GAME_CONFIG.molkky;
        this.drawMolkkyStick(
            this.molkkyThrow.x,
            this.molkkyThrow.y,
            this.molkkyThrow.rotation,
            flyingLength,
            flyingWidth,
            true
        );
    }

    /**
     * Confirm the current throw and calculate score
     * Updates player scores, checks for win/lose conditions
     */
    confirmThrow() {
        if (this.gameOver) return;

        const knockedPins = this.pins.filter(pin => pin.knocked);
        let points = 0;

        if (knockedPins.length === 0) {
            points = 0;
        } else if (knockedPins.length === 1) {
            points = knockedPins[0].number;
        } else {
            // 複数倒れた場合：倒れた本数が点数
            points = knockedPins.length;
        }

        const currentPlayer = this.players[this.currentPlayerIndex];
        currentPlayer.score += points;
        currentPlayer.history.push({
            throw: this.throwCount,
            pins: knockedPins.map(p => p.number),
            points: points,
            totalScore: currentPlayer.score
        });

        if (points === 0) {
            currentPlayer.misses++;
        } else {
            currentPlayer.misses = 0;
        }

        this.addScoreHistory(currentPlayer.name, this.throwCount, knockedPins.map(p => p.number), points, currentPlayer.score);

        if (currentPlayer.score === 50) {
            this.gameOver = true;
            this.winner = currentPlayer;
            this.showWinner();
        } else if (currentPlayer.score > 50) {
            currentPlayer.score = 25;
        } else if (currentPlayer.misses >= 3) {
            currentPlayer.score = 0;
            currentPlayer.misses = 0;
            this.addScoreHistory(currentPlayer.name, 0, [], '失格（3回連続ミス）', 0);
        }

        // 1ターンに1回投球なので即交代
        this.nextPlayer();

        // 倒れたピンを立て直して次のプレイヤーも使用可能に
        this.resetPinsForNextPlayer();
        this.updateUI();
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        // 1ターンに1回投球なので投球カウントはリセットしない
    }

    /**
     * Reset all pins to their original positions
     */
    resetPins() {
        this.pins.forEach(pin => {
            this.resetPinState(pin, true);
        });
        document.querySelectorAll('.pin-btn').forEach(btn => {
            btn.classList.remove('knocked');
        });
    }

    /**
     * Reset knocked pins for the next player
     * Pins stand up at their knocked positions (official Molkky rules)
     */
    resetPinsForNextPlayer() {
        this.pins.forEach(pin => {
            if (pin.knocked) {
                // 倒れた位置を新しい基準位置として保存
                pin.originalX = pin.x;
                pin.originalY = pin.y;

                // ピンの状態をリセット（位置はそのまま）
                this.resetPinState(pin, false);

                // 軽い立て直しアニメーション
                setTimeout(() => {
                    pin.animating = true;
                    pin.velocity = {
                        x: (Math.random() - 0.5) * 0.5,
                        y: -0.3 - Math.random() * 0.5
                    };
                    pin.rotationSpeed = (Math.random() - 0.5) * 0.03;
                }, Math.random() * 100);
            }
        });

        document.querySelectorAll('.pin-btn').forEach(btn => {
            btn.classList.remove('knocked');
        });
    }

    /**
     * Start a new game
     * Resets all player scores, pins, and game state
     */
    newGame() {
        this.players.forEach(player => {
            player.score = 0;
            player.misses = 0;
            player.history = [];
        });
        this.currentPlayerIndex = 0;
        this.throwCount = 1;
        this.gameOver = false;
        this.winner = null;
        this.molkkyThrow = null;
        this.isAnimating = false;
        this.resetPins();
        this.updateUI();

        const scoreHistory = document.getElementById('scoreHistory');
        if (scoreHistory) {
            scoreHistory.innerHTML = '';
        }
    }

    updateUI() {
        // プレイヤー情報更新
        this.players.forEach((player, index) => {
            const playerElement = document.getElementById(`player${player.id}`);
            if (!playerElement) {
                console.warn(`Element with id "player${player.id}" not found`);
                return;
            }

            const scoreElement = playerElement.querySelector('.score');
            const missesElement = playerElement.querySelector('.misses');

            if (scoreElement) {
                scoreElement.textContent = player.score;
            }

            if (missesElement) {
                missesElement.textContent = `ミス: ${player.misses}/3`;
            }

            if (index === this.currentPlayerIndex && !this.gameOver) {
                playerElement.classList.add('active');
            } else {
                playerElement.classList.remove('active');
            }
        });

        // 現在のターン情報
        if (!this.gameOver) {
            const currentPlayerElement = document.getElementById('current-player');
            if (currentPlayerElement) {
                currentPlayerElement.textContent = this.players[this.currentPlayerIndex].name;
            }
        }

        // ボタンの状態
        const confirmBtn = document.getElementById('confirmThrow');
        if (confirmBtn) {
            confirmBtn.disabled = this.gameOver;
        }
    }

    addScoreHistory(playerName, throwCount, pins, points, totalScore) {
        const historyElement = document.getElementById('scoreHistory');
        if (!historyElement) {
            console.warn('Element with id "scoreHistory" not found');
            return;
        }

        const item = document.createElement('div');
        item.className = 'history-item';

        const playerSpan = document.createElement('strong');
        playerSpan.textContent = playerName;
        item.appendChild(playerSpan);

        const mainText = document.createTextNode(` - ${throwCount}回目: ${points}点 (合計: ${totalScore}点)`);
        item.appendChild(mainText);

        const lineBreak = document.createElement('br');
        item.appendChild(lineBreak);

        const pinsSmall = document.createElement('small');
        pinsSmall.textContent = pins.length > 0 ? `倒したピン: [${pins.join(', ')}]` : 'ミス';
        item.appendChild(pinsSmall);

        historyElement.insertBefore(item, historyElement.firstChild);
    }

    showWinner() {
        const modal = document.createElement('div');
        modal.className = 'winner-message';

        const title = document.createElement('h2');
        title.textContent = `🎉 ${this.winner.name}の勝利！ 🎉`;
        modal.appendChild(title);

        const scoreText = document.createElement('p');
        scoreText.textContent = `最終スコア: ${this.winner.score}点`;
        modal.appendChild(scoreText);

        const newGameBtn = document.createElement('button');
        newGameBtn.className = 'btn primary';
        newGameBtn.textContent = '新しいゲームを開始';
        newGameBtn.addEventListener('click', () => {
            this.newGame();
            modal.remove();
        });
        modal.appendChild(newGameBtn);

        document.body.appendChild(modal);
    }
}

/**
 * Initialize the game when DOM is ready
 * Uses IIFE to avoid polluting global scope
 */
(function() {
    // Initialize game when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new MolkkyGame();
        });
    } else {
        new MolkkyGame();
    }
})();