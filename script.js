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
        // モルックの公式ピン配置（正しいルール）
        // 投げる側から見た配置
        const centerX = 400;
        const startY = 150; // 開始位置
        const pinSpacing = 35; // ピン間の距離
        const rowSpacing = 40; // 列間の距離

        const positions = [
            // ご指摘の正しい配置に修正
            // 1列目（一番遠い）
            { x: centerX - pinSpacing, y: startY, number: 7 },
            { x: centerX, y: startY, number: 9 },
            { x: centerX + pinSpacing, y: startY, number: 8 },

            // 2列目
            { x: centerX - pinSpacing * 1.5, y: startY + rowSpacing, number: 5 },
            { x: centerX - pinSpacing * 0.5, y: startY + rowSpacing, number: 11 },
            { x: centerX + pinSpacing * 0.5, y: startY + rowSpacing, number: 12 },
            { x: centerX + pinSpacing * 1.5, y: startY + rowSpacing, number: 6 },

            // 3列目
            { x: centerX - pinSpacing, y: startY + rowSpacing * 2, number: 3 },
            { x: centerX, y: startY + rowSpacing * 2, number: 10 },
            { x: centerX + pinSpacing, y: startY + rowSpacing * 2, number: 4 },

            // 4列目（手前）
            { x: centerX - pinSpacing * 0.5, y: startY + rowSpacing * 3, number: 1 },
            { x: centerX + pinSpacing * 0.5, y: startY + rowSpacing * 3, number: 2 }
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
        console.log('throwMolkky関数が呼ばれました', targetX, targetY); // デバッグ用

        if (this.isAnimating) {
            console.log('アニメーション中なので無視'); // デバッグ用
            return;
        }

        this.isAnimating = true;
        const startX = 400;
        const startY = 520;

        // 平面図らしい直線的な動きに変更
        const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

        // 距離に基づいて速度を調整（遠くへ速く、近くへゆっくり）
        const speed = Math.max(0.02, Math.min(0.08, 0.05 + distance * 0.0001));

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

        console.log('モルック投球設定完了:', this.molkkyThrow); // デバッグ用
    }

    handleCanvasClick(e) {
        console.log('キャンバスクリックされた', this.throwModeEnabled, this.isAnimating); // デバッグ用

        if (!this.throwModeEnabled || this.isAnimating) {
            console.log('投球モードがOFFまたはアニメーション中なので無視'); // デバッグ用
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        console.log('クリック位置:', x, y); // デバッグ用

        // どこをクリックしてもその位置が目標になる（平面図なので）
        // 投球エリア制限を廃止 - キャンバス全体を投球可能に
        if (y < 480) { // 投球ラインより上
            console.log('投球開始:', x, y); // デバッグ用
            this.throwMolkky(x, y);
        } else {
            console.log('投球ラインより下です'); // デバッグ用
        }
    }

    updateMolkkyThrow() {
        if (!this.molkkyThrow) return;

        this.molkkyThrow.progress += this.molkkyThrow.speed;
        this.molkkyThrow.rotation += 0.15;

        // 平面図らしい直線運動（簡単な直線移動）
        const t = this.molkkyThrow.progress;
        const startX = 400;
        const startY = 520;

        // 単純な直線補間 - 平面図なので放物線は不要
        this.molkkyThrow.x = startX + (this.molkkyThrow.targetX - startX) * t;
        this.molkkyThrow.y = startY + (this.molkkyThrow.targetY - startY) * t;

        // 軌跡を保存
        this.molkkyThrow.trail.push({ x: this.molkkyThrow.x, y: this.molkkyThrow.y });
        if (this.molkkyThrow.trail.length > 15) {
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

        const molkkyRadius = 12; // 少し大きくして当たりやすく

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
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
    }

    toggleThrowMode() {
        const button = document.getElementById('throwMode');
        this.throwModeEnabled = !this.throwModeEnabled;

        console.log('投球モード切り替え:', this.throwModeEnabled); // デバッグ用

        if (this.throwModeEnabled) {
            button.textContent = '投球モード: ON';
            button.classList.add('active');
            this.canvas.style.cursor = 'crosshair';
            console.log('投球モードON - キャンバスクリックで投球可能'); // デバッグ用
        } else {
            button.textContent = '投球モード: OFF';
            button.classList.remove('active');
            this.canvas.style.cursor = 'default';
            console.log('投球モードOFF'); // デバッグ用
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
        if (this.throwModeEnabled) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('クリックした位置が目標点になります', 400, 570);
        } else {
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('投球モードをONにしてクリック投球', 400, 570);
        }
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
        // 倒れたピンを立て直す（倒れた位置で）
        this.pins.forEach(pin => {
            if (pin.knocked) {
                pin.knocked = false;
                // 倒れた位置のまま立て直す（originalX/Yは使用しない）
                // 現在位置（倒れた位置）を新しいoriginal位置として保存
                pin.originalX = pin.x;
                pin.originalY = pin.y;
                pin.rotation = 0; // 立てるので回転はリセット
                pin.rotationSpeed = 0;
                pin.velocity = { x: 0, y: 0 };
                pin.animating = false;

                // 少しの遅延で軽い立て直しアニメーション
                setTimeout(() => {
                    pin.animating = true;
                    pin.velocity = {
                        x: (Math.random() - 0.5) * 0.5, // さらに弱く
                        y: -0.3 - Math.random() * 0.5  // 軽く上方向
                    };
                    pin.rotationSpeed = (Math.random() - 0.5) * 0.03; // 最小限の回転
                }, Math.random() * 100);
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