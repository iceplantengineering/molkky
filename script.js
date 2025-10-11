class MolkkyGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
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

    initializePins() {
        const pins = [];
        // モルックの正しいV字型配置（スキットル配置）
        // 先端から後ろにかけて広がるV字型
        const centerY = 200;
        const spacing = 35; // ピン間の距離
        const rowSpacing = 40; // 列間の距離

        const positions = [
            // 1列目（先端）
            { x: 400, y: centerY, number: 12 },

            // 2列目
            { x: 400 - spacing/2, y: centerY + rowSpacing, number: 11 },
            { x: 400 + spacing/2, y: centerY + rowSpacing, number: 10 },

            // 3列目
            { x: 400 - spacing, y: centerY + rowSpacing * 2, number: 9 },
            { x: 400, y: centerY + rowSpacing * 2, number: 8 },
            { x: 400 + spacing, y: centerY + rowSpacing * 2, number: 7 },

            // 4列目
            { x: 400 - spacing * 1.5, y: centerY + rowSpacing * 3, number: 6 },
            { x: 400 - spacing * 0.5, y: centerY + rowSpacing * 3, number: 5 },
            { x: 400 + spacing * 0.5, y: centerY + rowSpacing * 3, number: 4 },
            { x: 400 + spacing * 1.5, y: centerY + rowSpacing * 3, number: 3 },

            // 5列目
            { x: 400 - spacing * 2, y: centerY + rowSpacing * 4, number: 2 },
            { x: 400 + spacing * 2, y: centerY + rowSpacing * 4, number: 1 }
        ];

        positions.forEach(pos => {
            pins.push({
                number: pos.number,
                x: pos.x,
                y: pos.y,
                originalX: pos.x,
                originalY: pos.y,
                knocked: false,
                radius: 12,
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

    togglePin(pinNumber) {
        if (this.isAnimating) return;

        const pin = this.pins.find(p => p.number === pinNumber);
        const button = document.querySelector(`[data-pin-number="${pinNumber}"]`);

        // すでに倒れているピンは元に戻せない（ラウンド中は）
        if (pin.knocked) {
            return;
        }

        pin.knocked = true;
        button.classList.add('knocked');
        this.knockDownPin(pin);
    }

    knockDownPin(pin) {
        // はじける距離を制限してエリア内に収める
        const angle = Math.random() * Math.PI * 2;
        const force = 2 + Math.random() * 2; // 力を弱める

        // エリア内に収まるように方向を制限
        let safeAngle = angle;
        if (pin.y < 150) { // 上寄りなら下方向に
            safeAngle = Math.PI / 4 + Math.random() * Math.PI / 2;
        } else if (pin.y > 350) { // 下寄りなら上方向に
            safeAngle = -Math.PI / 4 + Math.random() * Math.PI / 2;
        }
        if (pin.x < 200) { // 左寄りなら右方向に
            safeAngle = -Math.PI / 6 + Math.random() * Math.PI / 3;
        } else if (pin.x > 600) { // 右寄りなら左方向に
            safeAngle = Math.PI * 5/6 + Math.random() * Math.PI / 3;
        }

        pin.velocity = {
            x: Math.cos(safeAngle) * force,
            y: Math.sin(safeAngle) * force
        };
        pin.rotationSpeed = (Math.random() - 0.5) * 0.15; // 回転も少し弱める
        pin.animating = true;

        // 連鎖反応を計算
        this.calculateChainReaction(pin);
    }

    calculateChainReaction(knockedPin) {
        const impactRadius = 50;

        this.pins.forEach(pin => {
            if (pin !== knockedPin && !pin.knocked) {
                const distance = Math.sqrt(
                    Math.pow(pin.x - knockedPin.x, 2) +
                    Math.pow(pin.y - knockedPin.y, 2)
                );

                if (distance < impactRadius) {
                    // 確率的に連鎖倒壊
                    if (Math.random() < 0.3) {
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

    resetPinPosition(pin) {
        pin.x = pin.originalX;
        pin.y = pin.originalY;
        pin.velocity = { x: 0, y: 0 };
        pin.rotation = 0;
        pin.rotationSpeed = 0;
        pin.animating = false;
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
        const friction = 0.96; // 摩擦を強めて早く停止
        const rotationFriction = 0.93;
        const minVelocity = 0.05; // 最低速度を下げて早く停止

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

                // 境界チェック（より強制力を持って）
                if (pin.x < pin.radius + 20) {
                    pin.velocity.x = Math.abs(pin.velocity.x) * 0.5;
                    pin.x = pin.radius + 20;
                }
                if (pin.x > this.canvas.width - pin.radius - 20) {
                    pin.velocity.x = -Math.abs(pin.velocity.x) * 0.5;
                    pin.x = this.canvas.width - pin.radius - 20;
                }
                if (pin.y < pin.radius + 20) {
                    pin.velocity.y = Math.abs(pin.velocity.y) * 0.5;
                    pin.y = pin.radius + 20;
                }
                if (pin.y > 480 - pin.radius) { // 投球ラインより上
                    pin.velocity.y = -Math.abs(pin.velocity.y) * 0.5;
                    pin.y = 480 - pin.radius;
                }
            }
        });

        // モルックの投球アニメーション
        if (this.molkkyThrow) {
            this.updateMolkkyThrow();
        }
    }

    throwMolkky(targetX, targetY) {
        if (this.isAnimating) return;

        this.isAnimating = true;
        const startX = 400;
        const startY = 520;

        this.molkkyThrow = {
            x: startX,
            y: startY,
            targetX: targetX,
            targetY: targetY,
            progress: 0,
            speed: 0.03,
            rotation: 0,
            trail: []
        };

        // キャンバスクリックで投球
        this.canvas.addEventListener('click', this.handleCanvasClick);
    }

    handleCanvasClick(e) {
        if (!this.throwModeEnabled || this.isAnimating) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 投球エリアの外では投げられない
        if (y > 500) {
            this.throwMolkky(x, y);
        }
    }

    updateMolkkyThrow() {
        if (!this.molkkyThrow) return;

        this.molkkyThrow.progress += this.molkkyThrow.speed;
        this.molkkyThrow.rotation += 0.1;

        // 放物線運動
        const t = this.molkkyThrow.progress;
        const startX = 400;
        const startY = 520;

        // 現在位置を計算
        this.molkkyThrow.x = startX + (this.molkkyThrow.targetX - startX) * t;
        this.molkkyThrow.y = startY + (this.molkkyThrow.targetY - startY) * t - Math.sin(t * Math.PI) * 100;

        // 軌跡を保存
        this.molkkyThrow.trail.push({ x: this.molkkyThrow.x, y: this.molkkyThrow.y });
        if (this.molkkyThrow.trail.length > 20) {
            this.molkkyThrow.trail.shift();
        }

        // 衝突判定
        this.checkMolkkyCollision();

        // アニメーション完了
        if (this.molkkyThrow.progress >= 1) {
            this.molkkyThrow = null;
            this.isAnimating = false;
        }
    }

    checkMolkkyCollision() {
        if (!this.molkkyThrow) return;

        const molkkyRadius = 8;

        this.pins.forEach(pin => {
            // 立っているピンのみ衝突判定
            if (!pin.knocked) {
                const distance = Math.sqrt(
                    Math.pow(pin.x - this.molkkyThrow.x, 2) +
                    Math.pow(pin.y - this.molkkyThrow.y, 2)
                );

                if (distance < pin.radius + molkkyRadius) {
                    // 衝突！ピンを倒す
                    pin.knocked = true;
                    const button = document.querySelector(`[data-pin-number="${pin.number}"]`);
                    if (button) button.classList.add('knocked');

                    this.knockDownPin(pin);
                }
            }
        });
    }

    attachEventListeners() {
        document.getElementById('confirmThrow').addEventListener('click', () => this.confirmThrow());
        document.getElementById('resetPins').addEventListener('click', () => this.resetPins());
        document.getElementById('newGame').addEventListener('click', () => this.newGame());
        document.getElementById('throwMode').addEventListener('click', () => this.toggleThrowMode());

        // キャンバスクリックイベント
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    }

    toggleThrowMode() {
        const button = document.getElementById('throwMode');
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
        this.ctx.fillText('投げるエリア（クリックして投球）', 400, 550);

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

    drawIdleMolkky() {
        const molkkyX = 400;
        const molkkyY = 520;
        const molkkyLength = 40;
        const molkkyWidth = 8;

        this.ctx.save();
        this.ctx.translate(molkkyX, molkkyY);
        this.ctx.rotate(-Math.PI / 4);

        // 棒のグラデーション
        const gradient = this.ctx.createLinearGradient(-molkkyLength/2, 0, molkkyLength/2, 0);
        gradient.addColorStop(0, '#8b4513');
        gradient.addColorStop(0.5, '#a0522d');
        gradient.addColorStop(1, '#8b4513');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(-molkkyLength/2, -molkkyWidth/2, molkkyLength, molkkyWidth);

        // 棒の端
        this.ctx.fillStyle = '#654321';
        this.ctx.beginPath();
        this.ctx.arc(-molkkyLength/2, 0, molkkyWidth/2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(molkkyLength/2, 0, molkkyWidth/2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();

        // ヒントテキスト
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('クリックして狙いを定めて投球', 400, 570);
    }

    drawFlyingMolkky() {
        const molkkyLength = 35;
        const molkkyWidth = 6;

        this.ctx.save();
        this.ctx.translate(this.molkkyThrow.x, this.molkkyThrow.y);
        this.ctx.rotate(this.molkkyThrow.rotation);

        // 飛行中のモルック（少し発光させる）
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        this.ctx.shadowBlur = 10;

        // 棒のグラデーション
        const gradient = this.ctx.createLinearGradient(-molkkyLength/2, 0, molkkyLength/2, 0);
        gradient.addColorStop(0, '#8b4513');
        gradient.addColorStop(0.5, '#a0522d');
        gradient.addColorStop(1, '#8b4513');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(-molkkyLength/2, -molkkyWidth/2, molkkyLength, molkkyWidth);

        // 棒の端
        this.ctx.fillStyle = '#654321';
        this.ctx.beginPath();
        this.ctx.arc(-molkkyLength/2, 0, molkkyWidth/2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(molkkyLength/2, 0, molkkyWidth/2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    
    confirmThrow() {
        if (this.gameOver) return;

        const knockedPins = this.pins.filter(pin => pin.knocked);
        let points = 0;

        if (knockedPins.length === 0) {
            points = 0;
        } else if (knockedPins.length === 1) {
            points = knockedPins[0].number;
        } else {
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

    resetPins() {
        this.pins.forEach(pin => {
            pin.knocked = false;
            this.resetPinPosition(pin);
        });
        document.querySelectorAll('.pin-btn').forEach(btn => {
            btn.classList.remove('knocked');
        });
    }

    resetPinsForNextPlayer() {
        // 倒れたピンを立て直す（アニメーション付き）
        this.pins.forEach(pin => {
            if (pin.knocked) {
                pin.knocked = false;
                this.resetPinPosition(pin);

                // 少しの遅延でアニメーション
                setTimeout(() => {
                    pin.animating = true;
                    pin.velocity = {
                        x: (Math.random() - 0.5) * 2,
                        y: -1 - Math.random() * 2
                    };
                    pin.rotationSpeed = (Math.random() - 0.5) * 0.1;
                }, Math.random() * 200);
            }
        });

        // ボタンの状態も更新
        document.querySelectorAll('.pin-btn').forEach(btn => {
            btn.classList.remove('knocked');
        });
    }

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
        document.getElementById('scoreHistory').innerHTML = '';
    }

    updateUI() {
        // プレイヤー情報更新
        this.players.forEach((player, index) => {
            const playerElement = document.getElementById(`player${player.id}`);
            playerElement.querySelector('.score').textContent = player.score;
            playerElement.querySelector('.misses').textContent = `ミス: ${player.misses}/3`;

            if (index === this.currentPlayerIndex && !this.gameOver) {
                playerElement.classList.add('active');
            } else {
                playerElement.classList.remove('active');
            }
        });

        // 現在のターン情報
        if (!this.gameOver) {
            document.getElementById('current-player').textContent = this.players[this.currentPlayerIndex].name;
        }

        // ボタンの状態
        document.getElementById('confirmThrow').disabled = this.gameOver;
    }

    addScoreHistory(playerName, throwCount, pins, points, totalScore) {
        const historyElement = document.getElementById('scoreHistory');
        const item = document.createElement('div');
        item.className = 'history-item';

        let pinsText = pins.length > 0 ? `倒したピン: [${pins.join(', ')}]` : 'ミス';
        item.innerHTML = `
            <strong>${playerName}</strong> - ${throwCount}回目: ${points}点 (合計: ${totalScore}点)
            <br><small>${pinsText}</small>
        `;

        historyElement.insertBefore(item, historyElement.firstChild);
    }

    showWinner() {
        const modal = document.createElement('div');
        modal.className = 'winner-message';
        modal.innerHTML = `
            <h2>🎉 ${this.winner.name}の勝利！ 🎉</h2>
            <p>最終スコア: ${this.winner.score}点</p>
            <button onclick="game.newGame(); this.parentElement.remove();" class="btn primary">新しいゲームを開始</button>
        `;
        document.body.appendChild(modal);
    }
}

// ゲームを初期化
const game = new MolkkyGame();