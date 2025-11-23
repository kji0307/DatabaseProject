// frontend/js/game.js
// 라이어 게임 클라이언트 전체 로직 (채팅 + 단계 + 투표 + 최종 2지선다 + 멀티 라운드 + 결과 카드)

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "https://databaseproject-r39m.onrender.com";
    const socket = io(API_BASE_URL);

    // ------------------------------
    // 기본 정보
    // ------------------------------
    const params = new URLSearchParams(location.search);
    const roomID = params.get("roomID");

    if (!roomID) {
        showPopup("방 정보가 없습니다.", {
            title: "오류",
            type: "error",
            redirectUrl: "game_lobby.html",
        });
        return;
    }

    const userStr = localStorage.getItem("user");
    if (!userStr) {
        showPopup("로그인이 필요합니다.", {
            title: "로그인 필요",
            type: "error",
            redirectUrl: "login.html",
        });
        return;
    }

    let user;
    try {
        user = JSON.parse(userStr);
    } catch (e) {
        console.error("user 파싱 오류:", e);
        showPopup("로그인 정보가 손상되었습니다. 다시 로그인해주세요.", {
            title: "오류",
            type: "error",
            redirectUrl: "login.html",
        });
        return;
    }

    const userID = Number(user.id);
    const username = user.username || "플레이어";

    // ------------------------------
    // DOM 요소
    // ------------------------------
    const titleEl = document.getElementById("room-title");
    const hostEl = document.getElementById("room-host");
    const countEl = document.getElementById("room-count");
    const playerListEl = document.getElementById("player-list");

    const roundInfoEl = document.getElementById("round-info");
    const phaseInfoEl = document.getElementById("phase-info");
    const timerSecEl = document.getElementById("timer-seconds");

    const qEl = document.getElementById("game-question");   // 상태/안내 문구
    const topicEl = document.getElementById("game-topic");  // 카테고리
    const infoEl = document.getElementById("game-info-text"); // ✅ 내 제시어(시민/라이어 모두) - 게임 내내 유지!

    const startBtn = document.getElementById("start-game-btn");
    const revealBtn = document.getElementById("reveal-liar-btn");
    const exitBtn = document.getElementById("exit-room-btn");

    const explainSummaryEl = document.getElementById("explain-summary");
    const voteAreaEl = document.getElementById("vote-area");
    const logAreaEl = document.getElementById("log-area");

    const chatMessagesEl = document.getElementById("chat-messages");
    const chatInputEl = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send-btn");

    const resultOverlayEl = document.getElementById("result-overlay");
    const resultOutcomeEl = document.getElementById("result-outcome");
    const resultLiarNameEl = document.getElementById("result-liar-name");
    const resultWordEl = document.getElementById("result-word");
    const resultDetailEl = document.getElementById("result-detail");
    const resultCloseBtn = document.getElementById("result-close-btn");

    // ------------------------------
    // 상태값
    // ------------------------------
    const PHASE = {
        WAIT: "waiting",
        EXPLAIN: "explaining",
        DISCUSS: "discussion",
        VOTE: "voting",
        FINAL: "final",
        ROUND_RESULT: "roundResult",
        RESULT: "result",
    };

    let roomHostID = null;
    let isHost = false;

    let players = [];            // { userID, username, isHost }
    let currentRound = 0;
    let maxRounds = 5;
    let gameState = PHASE.WAIT;

    let isLiar = false;
    let topicCategory = "";
    let myWord = "";             // 실제로 받은 제시어 (시민은 진짜, 라이어는 가짜)
    let myWordText = "";         // 화면에 보여줄 문구 (게임 내내 infoEl에 유지하기 위해)

    let speakingOrder = [];      // 설명 순서: [userID, ...]
    let currentSpeakerIndex = -1;
    let currentSpeakerID = null; // 지금 설명 차례인 userID

    let timerId = null;
    let timerRemaining = 0;

    let myVoteTargetId = null;
    let myFinalChoice = null;    // "guilty" or "innocent"

    let currentSuspectID = null;
    let currentSuspectName = null;

    // ------------------------------
    // 유틸
    // ------------------------------
    function translatePhase(phaseConst) {
        switch (phaseConst) {
            case PHASE.WAIT: return "대기 중";
            case PHASE.EXPLAIN: return "설명 단계";
            case PHASE.DISCUSS: return "토론 단계";
            case PHASE.VOTE: return "1차 투표";
            case PHASE.FINAL: return "최종 판단";
            case PHASE.ROUND_RESULT: return "라운드 결과";
            case PHASE.RESULT: return "최종 결과";
            default: return phaseConst || "-";
        }
    }

    function updateRoundAndPhaseUI() {
        roundInfoEl.textContent = `${currentRound} / ${maxRounds}`;
        phaseInfoEl.textContent = translatePhase(gameState);
    }

    function addLog(text) {
        if (!logAreaEl) return;

        const entry = document.createElement("div");
        entry.className = "log-entry";

        const now = new Date();
        const timeStr = [
            now.getHours().toString().padStart(2, "0"),
            now.getMinutes().toString().padStart(2, "0"),
            now.getSeconds().toString().padStart(2, "0")
        ].join(":");

        entry.innerHTML = `<span class="time">[${timeStr}]</span><span class="text">${text}</span>`;
        logAreaEl.appendChild(entry);
        logAreaEl.scrollTop = logAreaEl.scrollHeight;
    }

    function clearTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        timerRemaining = 0;
        timerSecEl.textContent = "-";
    }

    function startTimer(seconds, onEnd) {
        clearTimer();
        timerRemaining = seconds;
        timerSecEl.textContent = String(timerRemaining);

        timerId = setInterval(() => {
            timerRemaining--;
            if (timerRemaining < 0) timerRemaining = 0;
            timerSecEl.textContent = String(timerRemaining);

            if (timerRemaining <= 0) {
                clearTimer();
                if (typeof onEnd === "function") {
                    onEnd();
                }
            }
        }, 1000);
    }

    function renderPlayers() {
        playerListEl.innerHTML = "";
        players.forEach(p => {
            const li = document.createElement("li");
            li.className = "player-item" + (p.isHost ? " host" : "");
            li.innerHTML = `
                <span>${p.isHost ? "👑 " : ""}${p.username}</span>
                <span class="player-tag">${Number(p.userID) === Number(userID) ? "(나)" : ""}</span>
            `;
            playerListEl.appendChild(li);
        });
        countEl.textContent = `${players.length}명`;
    }

    function appendChatMessage(name, message, options = {}) {
        if (!chatMessagesEl) return;
        const { isSystem = false, isMine = false } = options;

        const row = document.createElement("div");
        row.className = "chat-message-row";

        const displayName = isSystem ? "SYSTEM" : name || "익명";
        const nameClass = isSystem ? "chat-name system" : "chat-name";
        const msgClass = isMine ? "chat-text mine" : "chat-text";

        row.innerHTML = `
            <span class="${nameClass}">${displayName}</span>
            <span class="${msgClass}">${message}</span>
        `;

        chatMessagesEl.appendChild(row);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }

    function getPlayerByID(id) {
        return players.find(p => Number(p.userID) === Number(id)) || null;
    }

    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function clearExplainSummary() {
        if (explainSummaryEl) explainSummaryEl.innerHTML = "";
    }

    function addExplainSummaryLine(playerID, text) {
        if (!explainSummaryEl) return;
        const player = getPlayerByID(playerID);
        const name = player ? player.username : `플레이어 ${playerID}`;

        const li = document.createElement("li");
        li.textContent = `${name}: ${text}`;
        explainSummaryEl.appendChild(li);
        explainSummaryEl.scrollTop = explainSummaryEl.scrollHeight;
    }

    // ------------------------------
    // 방 정보 + 제시어
    // ------------------------------
    async function loadRoom() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/rooms/${roomID}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || "방 정보를 불러올 수 없습니다.");
            }

            const data = await res.json();
            const room = data.room;

            roomHostID = room.hostID;
            isHost = Number(roomHostID) === Number(userID);

            titleEl.textContent = room.roomTitle;
            hostEl.textContent = room.hostName;

            players = (data.players || []).map(p => ({
                userID: Number(p.userID),
                username: p.username,
                isHost: Number(p.userID) === Number(roomHostID),
            }));

            currentRound = room.currentRound || 0;
            maxRounds = room.maxRounds || 5;
            gameState = PHASE.WAIT;
            updateRoundAndPhaseUI();
            renderPlayers();

            // 버튼 상태
            if (isHost) {
                startBtn.disabled = false;
                startBtn.textContent = "게임 시작 (호스트)";
            } else {
                startBtn.disabled = true;
                startBtn.textContent = "게임 시작 (호스트만)";
            }

            // 소켓 join
            socket.emit("joinRoom", { roomID: Number(roomID), userID, username });

            addLog(`방에 입장했습니다. (호스트: ${room.hostName})`);
        } catch (err) {
            console.error("방 정보 불러오기 오류:", err);
            showPopup(err.message || "방 정보를 불러올 수 없습니다.", {
                title: "오류",
                type: "error",
                redirectUrl: "game_lobby.html",
            });
        }
    }

    async function loadRoundInfo() {
        try {
            const res = await fetch(
                `${API_BASE_URL}/api/game/round/${roomID}/${userID}`
            );
            const data = await res.json();
            if (!res.ok) {
                console.warn("제시어 불러오기 실패:", data.message || res.statusText);
                return;
            }

            isLiar = !!data.isLiar;
            topicCategory = data.topic || "";
            myWord = data.word || "";
            currentRound = data.currentRound || currentRound || 1;
            maxRounds = data.maxRounds || maxRounds || 5;
            gameState = data.gameState || gameState;
            updateRoundAndPhaseUI();

            // 카테고리 항상 표시
            topicEl.textContent = topicCategory
                ? `카테고리: ${topicCategory}`
                : "카테고리 정보 없음";

            // ✅ 시민/라이어 모두 제시어를 항상 부여받고, infoEl에 고정 표시
            if (isLiar) {
                qEl.textContent = "당신은 라이어입니다!";
                myWordText = myWord
                    ? `당신의 (가짜) 제시어: ${myWord}`
                    : "가짜 제시어를 불러오지 못했습니다.";
            } else {
                qEl.textContent = "당신은 시민입니다.";
                myWordText = myWord
                    ? `당신의 제시어: ${myWord}`
                    : "제시어를 불러오지 못했습니다.";
            }
            infoEl.textContent = myWordText;  // 🔥 이 줄 이후로는 infoEl을 건드리지 않음!

        } catch (err) {
            console.error("제시어 불러오기 오류:", err);
        }
    }

    // ------------------------------
    // 단계(phase) 처리
    // ------------------------------
    function handlePhaseUpdate(phase, info = {}) {
        console.log("📢 phaseUpdate:", phase, info);

        switch (phase) {
            // 라운드 시작: 5초 후 설명 단계
            case "roundStart": {
                gameState = PHASE.EXPLAIN;
                updateRoundAndPhaseUI();
                clearExplainSummary();
                voteAreaEl.innerHTML = "";

                currentRound = info.round || currentRound || 1;
                qEl.textContent = `라운드 ${currentRound}가 곧 시작됩니다. (5초 후 설명 단계)`;
                addLog(`게임 시작! ${currentRound}라운드가 곧 시작됩니다. (5초 후 설명)`);

                // 새 라운드 제시어/역할 로딩
                loadRoundInfo();

                // 5초 후 설명 순서 시작 (호스트만)
                startTimer(5, () => {
                    if (isHost) {
                        prepareSpeakingOrder();
                        hostNextSpeaker();
                    }
                });
                break;
            }

            // 설명 차례
            case "explainTurn": {
                gameState = PHASE.EXPLAIN;
                currentSpeakerID = info.speakerID ? Number(info.speakerID) : null;
                updateRoundAndPhaseUI();

                const speaker = getPlayerByID(currentSpeakerID);
                const name = speaker ? speaker.username : `플레이어 ${currentSpeakerID}`;

                qEl.textContent = `${name}님의 설명 차례입니다. (10초)`;
                addLog(`📝 [설명] ${name}님의 차례입니다.`);

                startTimer(10, () => {
                    if (isHost) {
                        hostNextSpeaker();
                    }
                });
                break;
            }

            // 토론 시작
            case "discussionStart": {
                gameState = PHASE.DISCUSS;
                currentSpeakerID = null;
                updateRoundAndPhaseUI();

                qEl.textContent = "토론 단계입니다. 모두 자유롭게 채팅으로 의견을 나누세요! (60초)";
                addLog("💬 토론 단계 시작 (60초)");

                voteAreaEl.innerHTML = "";
                startTimer(60, () => {
                    if (isHost) {
                        socket.emit("phaseUpdate", {
                            roomID: Number(roomID),
                            phase: "voteStart",
                            info: {},
                        });
                    }
                });
                break;
            }

            // 1차 투표 시작
            case "voteStart": {
                gameState = PHASE.VOTE;
                currentSpeakerID = null;
                updateRoundAndPhaseUI();

                qEl.textContent = "1차 투표 단계입니다. 라이어라고 생각하는 사람에게 투표하세요! (10초)";
                addLog("🗳 1차 투표 단계 시작 (10초)");

                myVoteTargetId = null;
                renderVoteButtons();

                startTimer(10, () => {
                    if (isHost) {
                        requestVoteResult();
                    }
                });
                break;
            }

            // 최종 2지선다 시작
            case "finalChoiceStart": {
                gameState = PHASE.FINAL;
                updateRoundAndPhaseUI();

                currentSuspectID = info.suspectID ? Number(info.suspectID) : null;
                currentSuspectName = info.suspectName || "용의자";

                qEl.textContent = `${currentSuspectName}님이 라이어인지 최종 판단하세요! (10초)`;
                addLog(`⚖ 최종 판단: ${currentSuspectName}님이 라이어 후보입니다.`);

                myFinalChoice = null;
                renderFinalChoiceButtons(currentSuspectID, currentSuspectName);

                startTimer(10, () => {
                    if (isHost) {
                        socket.emit("finalChoiceResult", { roomID: Number(roomID) });
                    }
                });
                break;
            }

            // 라운드 결과(게임 계속 진행)
            case "roundResult": {
                gameState = PHASE.ROUND_RESULT;
                updateRoundAndPhaseUI();
                clearTimer();
                voteAreaEl.innerHTML = "";

                const liarPlayer = getPlayerByID(info.liarID);
                const liarName = liarPlayer ? liarPlayer.username : (info.liarID || "라이어");

                let roundMsg = "";
                if (info.outcome === "liarCaught") {
                    roundMsg = `🎉 이번 라운드에서 라이어(${liarName})를 잡았습니다!`;
                } else if (info.outcome === "liarWronglyAccused") {
                    roundMsg = `💀 시민들이 오판했습니다. ${info.suspectName}님은 라이어가 아니었습니다.`;
                } else if (info.outcome === "liarEscaped") {
                    roundMsg = `😈 라이어(${liarName})가 정체를 숨기고 도망쳤습니다.`;
                } else {
                    roundMsg = "이번 라운드 결과가 처리되었습니다.";
                }

                qEl.textContent = roundMsg;
                addLog(roundMsg);

                // ✅ 5초 후 다음 라운드 자동 시작 (호스트만)
                if (isHost && currentRound < maxRounds) {
                    setTimeout(() => {
                        startNextRound();
                    }, 5000);
                }
                break;
            }

            // 최종 결과(마지막 라운드 종료, 우승자 팝업)
            case "finalResult": {
                gameState = PHASE.RESULT;
                updateRoundAndPhaseUI();
                clearTimer();
                voteAreaEl.innerHTML = "";

                showResultCard(info);  // info.winnerInfo 포함
                break;
            }

            default:
                console.warn("알 수 없는 phase:", phase, info);
        }
    }

    // ------------------------------
    // 설명 순서 준비/진행 (호스트)
    // ------------------------------
    function prepareSpeakingOrder() {
        const ids = players.map(p => Number(p.userID));
        speakingOrder = shuffleArray(ids);
        currentSpeakerIndex = -1;

        socket.emit("setSpeakingOrder", {
            roomID: Number(roomID),
            order: speakingOrder,
        });

        console.log("🔀 설명 순서:", speakingOrder);
    }

    function hostNextSpeaker() {
        socket.emit("nextSpeaker", {
            roomID: Number(roomID),
        });
    }

    // ------------------------------
    // 1차 투표
    // ------------------------------
    function renderVoteButtons() {
        voteAreaEl.innerHTML = "";

        const title = document.createElement("div");
        title.className = "vote-section-title";
        title.textContent = "라이어라고 생각하는 사람을 선택하세요:";
        voteAreaEl.appendChild(title);

        players.forEach((p) => {
            const btn = document.createElement("button");
            btn.className = "vote-btn";
            btn.textContent = p.username;
            btn.dataset.targetId = p.userID;

            btn.addEventListener("click", () => {
                handleVoteClick(p.userID, btn);
            });

            voteAreaEl.appendChild(btn);
        });
    }

    async function handleVoteClick(targetID, btn) {
        if (gameState !== PHASE.VOTE) {
            showPopup("지금은 투표 단계가 아닙니다.", {
                title: "알림",
                type: "error",
            });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomID: Number(roomID),
                    userID,
                    targetID,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                showPopup(data.message || "투표에 실패했습니다.", {
                    title: "투표 실패",
                    type: "error",
                });
                return;
            }

            myVoteTargetId = targetID;
            document.querySelectorAll(".vote-btn").forEach((b) => {
                b.classList.remove("voted");
            });
            btn.classList.add("voted");

            const targetName = getPlayerByID(targetID)?.username || targetID;
            addLog(`당신은 ${targetName}님에게 투표했습니다.`);
        } catch (err) {
            console.error("투표 오류:", err);
            showPopup("투표 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    }

    async function requestVoteResult() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/vote/result`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomID: Number(roomID) }),
            });

            const data = await res.json();
            if (!res.ok) {
                showPopup(data.message || "투표 결과를 가져오지 못했습니다.", {
                    title: "오류",
                    type: "error",
                });
                return;
            }

            const { suspectID, suspectName, votes } = data;

            currentSuspectID = suspectID;
            currentSuspectName = suspectName;

            addLog(`📌 1차 투표 결과: ${suspectName}님이 ${votes}표로 용의자로 지목되었습니다.`);

            // 서버에도 용의자 저장
            socket.emit("setSuspect", {
                roomID: Number(roomID),
                suspectID,
            });

            // 최종 2지선다 단계 시작
            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "finalChoiceStart",
                info: { suspectID, suspectName, votes },
            });
        } catch (err) {
            console.error("투표 결과 조회 오류:", err);
            showPopup("투표 결과 조회 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    }

    // ------------------------------
    // 최종 2지선다 (라이어다 / 아니다)
    // ------------------------------
    function renderFinalChoiceButtons(suspectID, suspectName) {
        voteAreaEl.innerHTML = "";

        const title = document.createElement("div");
        title.className = "vote-section-title";
        title.textContent = `${suspectName}님은 라이어인가요?`;
        voteAreaEl.appendChild(title);

        const btnLiar = document.createElement("button");
        btnLiar.className = "final-choice-btn";
        btnLiar.textContent = "라이어다";

        const btnNot = document.createElement("button");
        btnNot.className = "final-choice-btn";
        btnNot.textContent = "라이어가 아니다";

        btnLiar.addEventListener("click", () => {
            handleFinalChoice("guilty", btnLiar, btnNot);
        });
        btnNot.addEventListener("click", () => {
            handleFinalChoice("innocent", btnNot, btnLiar);
        });

        voteAreaEl.appendChild(btnLiar);
        voteAreaEl.appendChild(btnNot);
    }

    async function handleFinalChoice(choice, clickedBtn, otherBtn) {
        if (gameState !== PHASE.FINAL) {
            showPopup("지금은 최종 판단 단계가 아닙니다.", {
                title: "알림",
                type: "error",
            });
            return;
        }

        myFinalChoice = choice;

        document.querySelectorAll(".final-choice-btn").forEach((b) => {
            b.classList.remove("selected");
        });
        clickedBtn.classList.add("selected");

        // 실시간 집계용
        socket.emit("finalChoiceVote", {
            roomID: Number(roomID),
            userID,
            choice,
        });

        // DB 저장용 (0/1)
        const numericChoice = choice === "guilty" ? 1 : 0;
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/final-vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomID: Number(roomID),
                    userID,
                    choice: numericChoice,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                console.warn("최종 투표 저장 실패:", data.message || res.statusText);
            }
        } catch (err) {
            console.error("최종 투표 저장 오류:", err);
        }
    }

    // ------------------------------
    // 최종 2지선다 집계 결과 (소켓)
    // ------------------------------
    socket.on("finalChoiceResult", async (data) => {
        const { guiltyCount, innocentCount } = data;
        console.log("🟥 finalChoiceResult:", data);

        if (guiltyCount > innocentCount) {
            // "라이어다" 다수 → 백엔드에서 최종 결과(점수 계산 + 우승자 여부) 받아오기
            addLog("다수 의견: '라이어다' → 최종 결과를 계산합니다.");

            if (isHost) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/game/final-vote/result`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ roomID: Number(roomID) }),
                    });

                    const resultData = await res.json();
                    if (!res.ok) {
                        console.error("최종 결과 조회 실패:", resultData.message || res.statusText);
                        showPopup(resultData.message || "최종 결과를 가져오지 못했습니다.", {
                            title: "오류",
                            type: "error",
                        });
                        return;
                    }

                    const isGameOver = !!resultData.winnerInfo;
                    // 라운드 결과 or 최종 결과를 방 전체에 브로드캐스트
                    socket.emit("phaseUpdate", {
                        roomID: Number(roomID),
                        phase: isGameOver ? "finalResult" : "roundResult",
                        info: resultData,
                    });
                } catch (err) {
                    console.error("최종 결과 조회 오류:", err);
                    showPopup("최종 결과 조회 중 오류가 발생했습니다.", {
                        title: "오류",
                        type: "error",
                    });
                }
            }
        } else {
            // "라이어가 아니다" 다수 → 다시 토론 단계로
            addLog("다수 의견: '라이어가 아니다' → 다시 토론 단계로 돌아갑니다.");
            if (isHost) {
                socket.emit("phaseUpdate", {
                    roomID: Number(roomID),
                    phase: "discussionStart",
                    info: { from: "finalChoice" },
                });
            }
        }
    });

    // ------------------------------
    // 다음 라운드 시작 (호스트용)
    // ------------------------------
    async function startNextRound() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/game/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomID: Number(roomID),
                    userID,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                showPopup(data.message || "다음 라운드를 시작할 수 없습니다.", {
                    title: "오류",
                    type: "error",
                });
                return;
            }

            currentRound = data.currentRound || currentRound + 1;
            maxRounds = data.maxRounds || maxRounds;
            updateRoundAndPhaseUI();

            addLog(`${currentRound}라운드가 곧 시작됩니다.`);

            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "roundStart",
                info: { round: currentRound },
            });
        } catch (err) {
            console.error("다음 라운드 시작 오류:", err);
            showPopup("다음 라운드를 시작하는 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    }

    // ------------------------------
    // 결과 카드 표시 (마지막 라운드에서만 호출)
    // ------------------------------
    function showResultCard(info) {
    const liarID = info.liarID;
    const suspectName = info.suspectName;
    const liarVoteCount = info.liarVoteCount;
    const notLiarVoteCount = info.notLiarVoteCount;
    const outcome = info.outcome;
    const winners = info.winnerInfo || [];

    const liarPlayer = getPlayerByID(liarID);
    const liarName = liarPlayer ? liarPlayer.username : (liarID ? `ID ${liarID}` : "알 수 없음");

    let outcomeText = "게임 결과";
    let detailText = "";
    let isFinal = false;

    if (Array.isArray(winners) && winners.length > 0) {
        isFinal = true;

        if (winners.length === 1) {
            const w = winners[0];
            const user = getPlayerByID(w.winnerID);
            const name = user ? user.username : `유저${w.winnerID}`;
            outcomeText = "최종 우승자";
            detailText = `${name}님이 총 ${w.totalScore}점을 기록하며 우승했습니다!`;
        } else {
            outcomeText = `최종 우승자(${winners.length}명)`;
            detailText =
                winners
                    .map((w) => {
                        const user = getPlayerByID(w.winnerID);
                        const name = user ? user.username : `유저${w.winnerID}`;
                        return `${name}: ${w.totalScore}점`;
                    })
                    .join("\n");
        }
    } else {
        detailText = "게임이 종료되었습니다.";
    }

    let outcomeSub = "";
    if (outcome === "liarCaught") {
        outcomeSub = `시민들이 라이어(${liarName})를 잡았습니다!`;
    } else if (outcome === "liarWronglyAccused") {
        outcomeSub = `${suspectName}님은 라이어가 아니었습니다. 시민들이 오판했습니다.`;
    } else if (outcome === "liarEscaped") {
        outcomeSub = `시민들이 라이어(${liarName})를 잡지 못했습니다.`;
    }

    resultOutcomeEl.textContent = outcomeText;
    resultDetailEl.textContent =
        `${detailText}\n${outcomeSub}\n(라이어다: ${liarVoteCount}표 / 아니다: ${notLiarVoteCount}표)`;

    resultLiarNameEl.textContent = `라이어: ${liarName}`;

    resultWordEl.textContent = topicCategory
        ? `제시어 카테고리: ${topicCategory}`
        : "";

    resultOverlayEl.classList.add("show");
}

    if (resultCloseBtn) {
        resultCloseBtn.addEventListener("click", () => {
            location.href = "game_lobby.html";
        });
    }

    // ------------------------------
    // 채팅 처리
    // ------------------------------
    function sendChatMessage() {
        if (!chatInputEl) return;
        const msg = chatInputEl.value.trim();
        if (!msg) return;

        // 설명 단계에서는 자신의 차례만 발언
        if (gameState === PHASE.EXPLAIN && currentSpeakerID && Number(currentSpeakerID) !== Number(userID)) {
            showPopup("설명 단계에서는 자신의 차례에만 발언할 수 있습니다.", {
                title: "알림",
                type: "error",
            });
            return;
        }

        socket.emit("chatMessage", {
            roomID: Number(roomID),
            userID,
            username,
            message: msg,
        });

        chatInputEl.value = "";
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener("click", sendChatMessage);
    }
    if (chatInputEl) {
        chatInputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    // 수신: 채팅
    socket.on("chatMessage", (data) => {
        const isMine = Number(data.userID) === Number(userID);
        appendChatMessage(data.username, data.message, { isMine });

        // 설명 단계 + 현재 설명자라면 → 설명 요약에도 추가
        if (gameState === PHASE.EXPLAIN && currentSpeakerID && Number(data.userID) === Number(currentSpeakerID)) {
            addExplainSummaryLine(data.userID, data.message);

            // 호스트는 설명이 나오면 바로 다음 사람으로
            if (isHost) {
                clearTimer();
                setTimeout(() => {
                    hostNextSpeaker();
                }, 500);
            }
        }
    });

    // 수신: 시스템 메시지
    socket.on("systemMessage", (data) => {
        appendChatMessage("SYSTEM", data.text || "", { isSystem: true });
        addLog(data.text || "");
    });

    // 수신: 플레이어 목록 업데이트
    socket.on("playerUpdate", (playerRows) => {
        players = playerRows.map(p => ({
            userID: Number(p.userID),
            username: p.username,
            isHost: Number(p.userID) === Number(roomHostID),
        }));
        renderPlayers();
    });

    // 수신: 단계 업데이트
    socket.on("phaseUpdate", ({ phase, info }) => {
        handlePhaseUpdate(phase, info || {});
    });

    // ------------------------------
    // 버튼 이벤트
    // ------------------------------
    // 게임 시작 (호스트 전용, 1라운드 시작)
    startBtn.addEventListener("click", async () => {
        if (!isHost) {
            showPopup("게임 시작은 호스트만 할 수 있습니다.", {
                title: "알림",
                type: "error",
            });
            return;
        }

        if (players.length < 3) {
            showPopup("게임은 최소 3명 이상일 때 시작할 수 있습니다.", {
                title: "인원 부족",
                type: "error",
            });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomID: Number(roomID),
                    userID,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                showPopup(data.message || "게임 시작에 실패했습니다.", {
                    title: "게임 시작 실패",
                    type: "error",
                });
                return;
            }

            currentRound = data.currentRound || 1;
            maxRounds = data.maxRounds || maxRounds;
            updateRoundAndPhaseUI();

            addLog("호스트가 게임을 시작했습니다.");

            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "roundStart",
                info: { round: currentRound },
            });
        } catch (err) {
            console.error("게임 시작 오류:", err);
            showPopup("게임 시작 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    });

    // (선택) 라이어 공개 버튼 – 현재는 안내만
    revealBtn.addEventListener("click", () => {
        showPopup("현재는 라이어를 시스템이 강제 공개하지 않습니다.\n토론과 추리로 라이어를 찾아보세요!", {
            title: "알림",
            type: "info",
        });
    });

    // 방 나가기
    exitBtn.addEventListener("click", async () => {
        const ok = confirm("방을 나가시겠습니까?");
        if (!ok) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/game/leave`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomID: Number(roomID),
                    userID,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                showPopup(data.message || "방 나가기에 실패했습니다.", {
                    title: "오류",
                    type: "error",
                });
                return;
            }

            socket.emit("leaveRoom", {
                roomID: Number(roomID),
                userID,
            });

            showPopup("방에서 나갔습니다.", {
                title: "알림",
                type: "success",
                redirectUrl: "game_lobby.html",
            });
        } catch (err) {
            console.error("방 나가기 오류:", err);
            showPopup("서버 오류로 방 나가기에 실패했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    });

    // ------------------------------
    // 초기 실행
    // ------------------------------
    loadRoom();
});
