document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "http://localhost:3000";

    const params = new URLSearchParams(location.search);
    const roomID = params.get("roomID");

    const userStr = localStorage.getItem("user");
    if (!userStr) {
        showPopup("로그인이 필요합니다.", {
            title: "로그인 필요",
            type: "error",
            redirectUrl: "login.html",
        });
        return;
    }

    const user = JSON.parse(userStr);
    const userID = user?.id;

    // DOM
    const titleEl = document.getElementById("room-title");
    const hostEl = document.getElementById("room-host");
    const countEl = document.getElementById("room-count");
    const playerListEl = document.getElementById("player-list");

    const startBtn = document.getElementById("start-game-btn");
    const revealBtn = document.getElementById("reveal-liar-btn"); // 개발단계에서는 사용 안 함
    const exitBtn = document.getElementById("exit-room-btn");

    const qEl = document.getElementById("game-question");
    const topicEl = document.getElementById("game-topic");
    const infoEl = document.getElementById("game-info-text");

    const roundInfoEl = document.getElementById("round-info");
    const phaseInfoEl = document.getElementById("phase-info");
    const timerSecEl = document.getElementById("timer-seconds");
    const logAreaEl = document.getElementById("log-area");
    const voteAreaEl = document.getElementById("vote-area");

    // 상태 변수
    let liarID = null;
    let roomHostID = null;
    let currentRound = 0;
    let maxRounds = 5;
    let gameState = "waiting"; // waiting / explaining / discussion / voting / defense / finalVote / result

    let playersCache = [];       // 현재 방 참가자 목록
    let speakingOrder = [];      // 이번 라운드 발언 순서
    let currentSpeakerIndex = -1;

    let myVotedTargetId = null;
    let currentSuspectID = null;     // 최다득표자 ID
    let currentSuspectName = null;   // 최다득표자 이름
    let myFinalChoice = null;        // 1=라이어다, 0=아니다

    // ------------------------------
    // 유틸 함수들
    // ------------------------------
    function updateRoundAndPhaseUI() {
        roundInfoEl.textContent = `${currentRound} / ${maxRounds}`;
        phaseInfoEl.textContent = translatePhase(gameState);
    }

    function translatePhase(phase) {
        switch (phase) {
            case "waiting": return "대기 중";
            case "explaining": return "제시어 설명 단계";
            case "discussion": return "토론 단계";
            case "voting": return "투표 단계";
            case "defense": return "해명 단계";
            case "finalVote": return "최종 판정";
            case "result": return "결과 정리";
            default: return phase;
        }
    }

    function logMessage(text) {
        const entry = document.createElement("div");
        entry.className = "log-entry";

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

        entry.innerHTML = `<span class="time">[${timeStr}]</span><span class="text">${text}</span>`;
        logAreaEl.appendChild(entry);
        logAreaEl.scrollTop = logAreaEl.scrollHeight;
    }

    function clearTimers() {
        // 개발 단계: 실제 타이머는 사용하지 않음
        timerSecEl.textContent = "-";
    }

    // 개발용: 타이머 없이 바로 다음 단계로
    function startCountdown(seconds, onDone) {
        clearTimers();
        if (onDone) onDone();
    }

    // 간단한 셔플 함수 (Fisher-Yates)
    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ------------------------------
    // 1. 방 정보 + 플레이어 목록 불러오기
    // ------------------------------
    async function loadRoom() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/rooms/${roomID}`);
            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "방 정보를 불러올 수 없습니다.", {
                    title: "오류",
                    type: "error",
                    redirectUrl: "game_lobby.html"
                });
                return;
            }

            const room = data.room;
            roomHostID = room.hostID;

            titleEl.textContent = room.roomTitle;
            hostEl.textContent = room.hostName;
            countEl.textContent = `${data.players.length}명`;

            // 라운드/상태 정보 반영
            currentRound = room.currentRound || 0;
            maxRounds = room.maxRounds || 5;
            gameState = room.gameState || "waiting";
            updateRoundAndPhaseUI();

            // 호스트 여부에 따른 "게임 시작" 버튼 상태
            if (Number(userID) === Number(roomHostID)) {
                startBtn.disabled = false;
                startBtn.textContent = "게임 시작(호스트)";
            } else {
                startBtn.disabled = true;
                startBtn.textContent = "게임 시작 (호스트만)";
            }

            playersCache = data.players || [];
            renderPlayers(playersCache);
        } catch (err) {
            console.error("방 정보 불러오기 오류:", err);
            showPopup("방 정보를 불러올 수 없습니다.", {
                title: "오류",
                type: "error",
                redirectUrl: "game_lobby.html"
            });
        }
    }

    function renderPlayers(players) {
        playerListEl.innerHTML = "";

        players.forEach(p => {
            const li = document.createElement("li");
            li.className = "player-item" + (p.isHost ? " host" : "");
            li.innerHTML = `
                <span>${p.isHost ? "👑 " : ""}${p.username}</span>
                <span>${Number(p.userID) === Number(userID) ? "(나)" : ""}</span>
            `;
            playerListEl.appendChild(li);
        });
    }

    // ------------------------------
    // 2. 게임 시작 (호스트 → 다음 라운드 시작)
    // ------------------------------
    startBtn.addEventListener("click", async () => {
        if (Number(userID) !== Number(roomHostID)) {
            showPopup("호스트만 게임을 시작할 수 있습니다.", {
                title: "권한 없음",
                type: "error"
            });
            return;
        }

        clearTimers();
        voteAreaEl.innerHTML = "";
        myVotedTargetId = null;
        currentSuspectID = null;
        currentSuspectName = null;
        myFinalChoice = null;

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID, userID })
            });

            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "게임 시작 실패", {
                    title: "게임 시작 실패",
                    type: "error"
                });
                return;
            }

            liarID = data.liarID;
            currentRound = data.currentRound;
            maxRounds = data.maxRounds || maxRounds;
            gameState = "explaining";
            updateRoundAndPhaseUI();

            qEl.textContent = `${currentRound} 라운드가 시작되었습니다!`;
            topicEl.textContent = `카테고리: ${data.category}`;
            infoEl.textContent = "제시어가 개별적으로 지급됩니다. 곧 설명 단계가 시작됩니다.";

            await loadMyWord();

            revealBtn.style.display = "none"; // 자동 공개 방식으로 갈 거라 숨김

            speakingOrder = shuffleArray(playersCache);
            const orderNames = speakingOrder.map(p => p.username).join(", ");
            logMessage(`${currentRound}라운드 시작! 발언 순서: ${orderNames}`);

            // 타이머 없이 바로 설명 단계
            startExplainPhase();
        } catch (err) {
            console.error("게임 시작 오류:", err);
            showPopup("게임 시작 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    });

    // ------------------------------
    // 2-2. 설명 단계 (랜덤 순서, 원래 10초씩 → 지금은 순서만 로그)
// ------------------------------
    function startExplainPhase() {
        gameState = "explaining";
        updateRoundAndPhaseUI();
        currentSpeakerIndex = -1;
        nextSpeakerTurn();
    }

    function nextSpeakerTurn() {
        currentSpeakerIndex += 1;

        if (!speakingOrder || speakingOrder.length === 0) {
            logMessage("이번 라운드에 참가자가 없습니다.");
            startDiscussionPhase();
            return;
        }

        if (currentSpeakerIndex >= speakingOrder.length) {
            logMessage("모든 플레이어의 설명이 끝났습니다. 토론 단계로 넘어갑니다.");
            startDiscussionPhase();
            return;
        }

        const speaker = speakingOrder[currentSpeakerIndex];
        qEl.textContent = `지금 차례: ${speaker.username}`;
        infoEl.textContent = `${speaker.username}님이 제시어를 설명합니다. (개발 단계라 시간 제한 없음)`;

        logMessage(`▶ ${speaker.username}님의 설명 시작`);

        // 개발 단계: 바로 다음 사람으로 넘기기
        nextSpeakerTurn();
    }

    // ------------------------------
    // 2-3. 토론 단계 (원래 60초 → dev에서는 바로 진행)
// ------------------------------
    function startDiscussionPhase() {
        gameState = "discussion";
        updateRoundAndPhaseUI();

        myVotedTargetId = null;
        myFinalChoice = null;

        qEl.textContent = "자유 토론 시간입니다.";
        infoEl.textContent = "개발 단계라 시간 제한 없이 토론한다고 가정하고 바로 투표로 넘어갑니다.";

        logMessage("💬 토론 단계 시작 (dev, 즉시 다음 단계)");

        // 바로 투표 단계로
        startVotingPhase();
    }

    // ------------------------------
    // 2-4. 1차 투표 단계 (라이어 후보 뽑기)
// ------------------------------
    function startVotingPhase() {
        gameState = "voting";
        updateRoundAndPhaseUI();
        myVotedTargetId = null;

        qEl.textContent = "라이어 1차 투표 시간입니다.";
        infoEl.textContent = "라이어라고 생각하는 사람을 선택하세요.";
        renderVoteButtons();
    }

    function renderVoteButtons() {
        voteAreaEl.innerHTML = "";

        let targets;
        // 혼자 테스트할 땐 자기 자신도 포함
        if (playersCache.length <= 1) {
            targets = playersCache;
        } else {
            targets = playersCache.filter(p => Number(p.userID) !== Number(userID));
        }

        if (targets.length === 0) {
            voteAreaEl.textContent = "투표할 대상이 없습니다.";
            return;
        }

        const label = document.createElement("div");
        label.textContent = "👉 라이어라고 생각하는 사람을 선택:";
        label.style.marginBottom = "4px";
        voteAreaEl.appendChild(label);

        targets.forEach(p => {
            const btn = document.createElement("button");
            btn.className = "vote-btn";
            btn.textContent = p.username;
            btn.dataset.targetId = p.userID;

            btn.addEventListener("click", () => handleVoteClick(p.userID, btn));

            voteAreaEl.appendChild(btn);
        });
    }

    function disableVoteButtons() {
        const buttons = voteAreaEl.querySelectorAll(".vote-btn");
        buttons.forEach(btn => {
            btn.disabled = true;
        });
    }

    async function handleVoteClick(targetID, buttonEl) {
        if (myVotedTargetId && myVotedTargetId === targetID) {
            return; // 같은 사람을 또 누르는 건 무시
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID, userID, targetID })
            });

            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "투표에 실패했습니다.", {
                    title: "투표 실패",
                    type: "error"
                });
                return;
            }

            myVotedTargetId = targetID;
            logMessage(`🗳 ${buttonEl.textContent}님에게 1차 투표했습니다.`);

            const buttons = voteAreaEl.querySelectorAll(".vote-btn");
            buttons.forEach(btn => btn.classList.remove("voted"));
            buttonEl.classList.add("voted");

            // 개발 단계: 한 번 투표하면 바로 결과 계산
            disableVoteButtons();
            showVoteResult();
        } catch (err) {
            console.error("투표 오류:", err);
            showPopup("투표 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    }

    async function showVoteResult() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/vote/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID })
            });

            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "투표 결과를 가져오지 못했습니다.", {
                    title: "투표 결과 오류",
                    type: "error"
                });
                return;
            }

            currentSuspectID = data.suspectID;
            currentSuspectName = data.suspectName || `ID ${data.suspectID}`;

            infoEl.textContent =
                `1차 투표 결과, 가장 많이 지목된 사람은 ${currentSuspectName} 입니다. (${data.votes}표)`;
            logMessage(`📊 1차 투표 결과: ${currentSuspectName} (${data.votes}표)`);

            // 해명 단계로
            startDefensePhase();
        } catch (err) {
            console.error("투표 결과 오류:", err);
            showPopup("투표 결과를 가져오는 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    }

    // ------------------------------
    // 2-5. 해명 단계 (dev: 바로 최종 투표로 연결)
// ------------------------------
    function startDefensePhase() {
        if (!currentSuspectID) {
            logMessage("용의자가 없어 해명 단계를 진행할 수 없습니다.");
            return;
        }

        gameState = "defense";
        updateRoundAndPhaseUI();

        qEl.textContent = `해명 시간: ${currentSuspectName}님의 해명`;
        infoEl.textContent =
            `${currentSuspectName}님이 해명합니다. (개발 단계라 실제 채팅/시간 제한은 스킵됩니다.)`;

        logMessage(`🗣 ${currentSuspectName}님의 해명 시간 시작 (dev)`);

        // 개발 단계: 해명도 바로 끝났다고 보고 최종 투표로
        startFinalVotePhase();
    }

    // ------------------------------
    // 2-6. 최종(2지선다) 투표 단계
    // ------------------------------
    function startFinalVotePhase() {
        if (!currentSuspectID) {
            logMessage("용의자가 없어 최종 투표를 진행할 수 없습니다.");
            return;
        }

        myFinalChoice = null;

        gameState = "finalVote";
        updateRoundAndPhaseUI();

        qEl.textContent = `최종 투표: ${currentSuspectName}님은 라이어인가요?`;
        infoEl.textContent = "라이어다 / 아니다 중 하나를 선택하세요.";

        renderFinalVoteButtons();
    }

    function renderFinalVoteButtons() {
        voteAreaEl.innerHTML = "";

        const label = document.createElement("div");
        label.textContent = `👉 ${currentSuspectName}님에 대한 최종 판단:`;
        label.style.marginBottom = "4px";
        voteAreaEl.appendChild(label);

        const btnLiar = document.createElement("button");
        btnLiar.className = "vote-btn";
        btnLiar.textContent = "라이어다";

        const btnNot = document.createElement("button");
        btnNot.className = "vote-btn";
        btnNot.textContent = "아니다";

        btnLiar.addEventListener("click", () => handleFinalVoteClick(1, btnLiar, btnNot));
        btnNot.addEventListener("click", () => handleFinalVoteClick(0, btnNot, btnLiar));

        voteAreaEl.appendChild(btnLiar);
        voteAreaEl.appendChild(btnNot);
    }

    async function handleFinalVoteClick(choice, clickedBtn, otherBtn) {
        if (myFinalChoice !== null) {
            return;
        }

        myFinalChoice = choice;

        clickedBtn.classList.add("voted");
        clickedBtn.disabled = true;
        if (otherBtn) otherBtn.disabled = true;

        const choiceText = choice === 1 ? "라이어다" : "아니다";
        logMessage(`✅ 최종 판단: "${choiceText}"로 투표했습니다.`);

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/final-vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID, userID, choice })
            });

            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "최종 투표에 실패했습니다.", {
                    title: "최종 투표 실패",
                    type: "error"
                });
                return;
            }

            // 개발 단계: 한 명이라도 투표하면 바로 결과 조회
            showFinalVoteResult();
        } catch (err) {
            console.error("최종 투표 오류:", err);
            showPopup("최종 투표 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    }

    async function showFinalVoteResult() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/final-vote/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID })
            });

            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "최종 투표 결과를 가져오지 못했습니다.", {
                    title: "최종 투표 결과 오류",
                    type: "error"
                });
                return;
            }

            const name = data.suspectName || `ID ${data.suspectID}`;
            const liarVotes = data.liarVoteCount;
            const notLiarVotes = data.notLiarVoteCount;

            logMessage(`📊 최종 투표 결과: "${name}"에 대해 라이어다=${liarVotes}표, 아니다=${notLiarVotes}표`);

            if (data.outcome === "redoDiscussion") {
                infoEl.textContent =
                    `최종 결과: "${name}"는 라이어가 아니라고 보는 의견이 많았습니다. 다시 토론을 진행합니다.`;
                logMessage("🔁 다시 토론 단계로 돌아갑니다.");
                // 다시 토론 + 1차 투표로
                startDiscussionPhase();
            } else if (data.outcome === "liarCaught") {
                infoEl.textContent =
                    `최종 결과: "${name}"는 실제 라이어였습니다! (점수 계산은 다음 단계에서 구현)`;
                logMessage("🎉 라이어를 잡았습니다! (점수 계산/랭킹은 다음 단계에서)");
                gameState = "result";
                updateRoundAndPhaseUI();
            } else if (data.outcome === "liarWronglyAccused") {
                infoEl.textContent =
                    `최종 결과: "${name}"는 라이어가 아니었습니다. 라이어는 숨어버렸습니다. (점수 계산은 다음 단계에서 구현)`;
                logMessage("💀 시민들이 오판했습니다. (점수 계산/랭킹은 다음 단계에서)");
                gameState = "result";
                updateRoundAndPhaseUI();
            } else {
                logMessage("알 수 없는 최종 투표 결과 상태입니다.");
            }
        } catch (err) {
            console.error("최종 투표 결과 오류:", err);
            showPopup("최종 투표 결과를 가져오는 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    }

    // ------------------------------
    // 3. 제시어 불러오기
    // ------------------------------
    async function loadMyWord() {
        try {
            const res = await fetch(
                `${API_BASE_URL}/api/game/round/${roomID}/${userID}`
            );
            const data = await res.json();

            if (!res.ok) {
                showPopup(data.message || "제시어를 불러오지 못했습니다.", {
                    title: "제시어 오류",
                    type: "error"
                });
                return;
            }

            if (data.isLiar) {
                qEl.textContent = "당신은 라이어입니다!";
            }

            topicEl.textContent = `카테고리: ${data.topic}`;
            infoEl.textContent = `당신의 제시어: ${data.word}`;
        } catch (err) {
            console.error("제시어 불러오기 오류:", err);
            showPopup("제시어를 불러오는 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error"
            });
        }
    }

    // ------------------------------
    // 5. 방 나가기 (공통 팝업 사용)
// ------------------------------
    exitBtn.addEventListener("click", () => {
        showConfirmPopup("방에서 나가시겠습니까?", {
            title: "방 나가기",
            type: "error",
            confirmText: "나가기",
            cancelText: "취소",
            onConfirm: async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/game/leave`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ roomID, userID })
                    });

                    const data = await res.json();

                    if (!res.ok) {
                        showPopup(data.message || "방 나가기 실패", {
                            title: "오류",
                            type: "error"
                        });
                        return;
                    }

                    if (data.roomDeleted) {
                        showPopup("호스트가 나가서 방이 삭제되었습니다.", {
                            title: "방 삭제",
                            type: "success",
                            redirectUrl: "game_lobby.html"
                        });
                    } else {
                        showPopup("방에서 나갔습니다.", {
                            title: "나가기 완료",
                            type: "success",
                            redirectUrl: "game_lobby.html"
                        });
                    }
                } catch (err) {
                    console.error("방 나가기 오류:", err);
                    showPopup("서버 오류로 방 나가기에 실패했습니다.", {
                        title: "오류",
                        type: "error"
                    });
                }
            }
        });
    });

    // ------------------------------
    // 초기 방 정보 로드
    // ------------------------------
    loadRoom();
});
