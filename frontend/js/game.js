// frontend/js/game.js
// 라이어 게임 클라이언트 로직 (채팅 + 단계 진행 + 제시어 표시)

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "https://databaseproject-r39m.onrender.com";
    const socket = io("https://databaseproject-r39m.onrender.com");

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

    const qEl = document.getElementById("game-question");
    const topicEl = document.getElementById("game-topic");
    const infoEl = document.getElementById("game-info-text");

    const voteAreaEl = document.getElementById("vote-area");
    const logAreaEl = document.getElementById("log-area");

    const startBtn = document.getElementById("start-game-btn");
    const revealBtn = document.getElementById("reveal-liar-btn");
    const exitBtn = document.getElementById("exit-room-btn");

    const chatMessagesEl = document.getElementById("chat-messages");
    const chatInputEl = document.getElementById("chat-input");
    const chatSendBtn = document.getElementById("chat-send-btn");

    // ------------------------------
    // 상태 변수
    // ------------------------------
    const PHASE = {
        WAIT: "waiting",
        EXPLAIN: "explain",
        DISCUSS: "discussion",
        VOTE: "voting",
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
    let myWord = "";

    let speakingOrder = [];      // 이번 라운드 발언 순서 (userID 배열)
    let currentSpeakerIndex = -1;
    let currentSpeakerID = null; // 지금 설명 차례인 userID

    let timerId = null;
    let timerRemaining = 0;

    let myVotedTargetId = null;  // 내가 찍은 사람

    // ------------------------------
    // 유틸 함수들
    // ------------------------------
    function translatePhase(phase) {
        switch (phase) {
            case PHASE.WAIT: return "대기 중";
            case PHASE.EXPLAIN: return "설명 단계";
            case PHASE.DISCUSS: return "토론 단계";
            case PHASE.VOTE: return "투표 단계";
            case PHASE.RESULT: return "결과 발표";
            default: return phase || "-";
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
        const timeStr =
            `${now.getHours().toString().padStart(2, "0")}:` +
            `${now.getMinutes().toString().padStart(2, "0")}:` +
            `${now.getSeconds().toString().padStart(2, "0")}`;

        entry.innerHTML = `<span class="time">[${timeStr}]</span><span class="text">${text}</span>`;
        logAreaEl.appendChild(entry);
        logAreaEl.scrollTop = logAreaEl.scrollHeight;
    }

    function clearTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        timerSecEl.textContent = "-";
        timerRemaining = 0;
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
                <span>${Number(p.userID) === Number(userID) ? "(나)" : ""}</span>
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

    // ------------------------------
    // 방 정보 및 제시어
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
            gameState = room.gameState || PHASE.WAIT;
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

            // 소켓 joinRoom (플레이어 목록 다 받은 후)
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.warn("제시어 불러오기 실패:", data.message || res.statusText);
                return;
            }

            const data = await res.json();
            isLiar = !!data.isLiar;
            topicCategory = data.topic || "";
            myWord = data.word || "";
            currentRound = data.currentRound || currentRound || 1;
            maxRounds = data.maxRounds || maxRounds || 5;
            gameState = data.gameState || gameState;
            updateRoundAndPhaseUI();

            topicEl.textContent = topicCategory
                ? `카테고리: ${topicCategory}`
                : "카테고리 정보 없음";

            if (isLiar) {
                qEl.textContent = "당신은 라이어입니다!";
                infoEl.textContent =
                    "제시어를 모릅니다. 다른 사람의 설명을 듣고 제시어를 추리하세요.";
            } else {
                qEl.textContent = "당신은 시민입니다.";
                infoEl.textContent = myWord
                    ? `당신의 제시어: ${myWord}`
                    : "제시어를 불러오지 못했습니다.";
            }
        } catch (err) {
            console.error("제시어 불러오기 오류:", err);
        }
    }

    // ------------------------------
    // 단계(Phase) 제어: 서버에서 phaseUpdate 수신
    // ------------------------------
    function handlePhaseUpdate(phase, info) {
        console.log("📢 phaseUpdate:", phase, info);
        switch (phase) {
            case "roundStart": {
                // 라운드 시작: 5초 후 설명 단계
                gameState = PHASE.EXPLAIN;
                currentRound = (info && info.round) || currentRound || 1;
                updateRoundAndPhaseUI();

                addLog(`게임 시작! ${currentRound}라운드가 곧 시작됩니다. (5초 후 설명)`);

                // 내 제시어/역할 불러오기
                loadRoundInfo();

                // 5초 카운트, 끝나면 호스트가 첫 설명자 호출
                startTimer(5, () => {
                    if (isHost) {
                        prepareSpeakingOrder();
                        hostNextSpeaker();
                    }
                });
                break;
            }

            case "explainTurn": {
                gameState = PHASE.EXPLAIN;
                currentSpeakerID = info && Number(info.speakerID);
                updateRoundAndPhaseUI();

                const speaker = getPlayerByID(currentSpeakerID);
                const name = speaker ? speaker.username : `플레이어 ${currentSpeakerID}`;

                infoEl.textContent = `${name}님의 설명 차례입니다. (10초)`;
                addLog(`[설명] ${name}님의 차례입니다.`);

                // 설명자는 채팅으로 한 줄 설명
                startTimer(10, () => {
                    if (isHost) {
                        // 시간이 끝나면 다음 사람으로
                        hostNextSpeaker();
                    }
                });
                break;
            }

            case "discussionStart": {
                gameState = PHASE.DISCUSS;
                currentSpeakerID = null;
                updateRoundAndPhaseUI();

                infoEl.textContent = "토론 단계입니다. 모두 자유롭게 채팅으로 의견을 나누세요! (60초)";
                addLog("💬 토론 단계 시작 (60초)");

                startTimer(60, () => {
                    if (isHost) {
                        // 토론이 끝나면 투표 시작
                        socket.emit("phaseUpdate", {
                            roomID: Number(roomID),
                            phase: "voteStart",
                            info: {},
                        });
                    }
                });
                break;
            }

            case "voteStart": {
                gameState = PHASE.VOTE;
                currentSpeakerID = null;
                updateRoundAndPhaseUI();

                infoEl.textContent = "투표 단계입니다. 라이어라고 생각하는 사람을 선택하세요! (10초)";
                addLog("🗳 투표 단계 시작 (10초)");

                myVotedTargetId = null;
                renderVoteButtons();

                startTimer(10, () => {
                    if (isHost) {
                        requestVoteResult();
                    }
                });
                break;
            }

            case "voteResult": {
                gameState = PHASE.RESULT;
                updateRoundAndPhaseUI();
                clearTimer();

                const suspectID = info && info.suspectID;
                const suspectName = (info && info.suspectName) || "알 수 없음";
                const votes = info && info.votes;

                infoEl.textContent = `최다 득표자는 ${suspectName}님 (${votes}표) 입니다.`;
                addLog(`📌 투표 결과: ${suspectName}님이 ${votes}표를 받았습니다.`);

                // 아주 간단하게: 라이어 여부 안내(내 입장에서만)
                if (isLiar) {
                    addLog("당신은 라이어입니다. 들키지 않았는지 확인해보세요!");
                } else {
                    addLog("당신은 시민입니다. 라이어를 잘 골랐는지 생각해보세요.");
                }
                break;
            }

            default:
                console.warn("알 수 없는 phaseUpdate:", phase, info);
        }
    }

    function prepareSpeakingOrder() {
        // 방 참가자 목록으로 랜덤 순서 구성 (중복 없음)
        const ids = players.map(p => Number(p.userID));
        speakingOrder = shuffleArray(ids);
        currentSpeakerIndex = -1;
        console.log("🔀 speakingOrder:", speakingOrder);
    }

    function hostNextSpeaker() {
        currentSpeakerIndex++;
        if (currentSpeakerIndex >= speakingOrder.length) {
            // 모두 설명이 끝났으면 토론 단계로 전환
            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "discussionStart",
                info: {},
            });
            return;
        }

        const speakerID = speakingOrder[currentSpeakerIndex];
        socket.emit("phaseUpdate", {
            roomID: Number(roomID),
            phase: "explainTurn",
            info: { speakerID },
        });
    }

    // ------------------------------
    // 투표 처리
    // ------------------------------
    function renderVoteButtons() {
        voteAreaEl.innerHTML = "";

        players.forEach(p => {
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

            myVotedTargetId = targetID;
            // 버튼 하이라이트
            document.querySelectorAll(".vote-btn").forEach(b => {
                b.classList.remove("voted");
            });
            btn.classList.add("voted");

            addLog(`당신은 ${getPlayerByID(targetID)?.username || targetID}님에게 투표했습니다.`);
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

            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "voteResult",
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
    // 채팅 처리
    // ------------------------------
    function sendChatMessage() {
        if (!chatInputEl) return;
        const msg = chatInputEl.value.trim();
        if (!msg) return;

        // 설명 단계에서: 자신의 차례가 아니면 채팅 금지
        if (gameState === PHASE.EXPLAIN && currentSpeakerID && Number(currentSpeakerID) !== Number(userID)) {
            showPopup("설명 단계에서는 자신의 차례에만 발언할 수 있습니다.", {
                title: "알림",
                type: "error",
            });
            return;
        }

        // 투표/결과 단계에서 채팅 막고 싶으면 여기서 제어 가능
        // if (gameState === PHASE.VOTE || gameState === PHASE.RESULT) { ... }

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

    // 소켓 수신: 채팅
    socket.on("chatMessage", (data) => {
        const isMine = Number(data.userID) === Number(userID);
        appendChatMessage(data.username, data.message, { isMine });

        // 호스트: 설명 단계에서 현재 설명자가 발언하면 다음 사람으로 넘김
        if (isHost && gameState === PHASE.EXPLAIN && currentSpeakerID && Number(data.userID) === Number(currentSpeakerID)) {
            // 설명자가 한 번이라도 말하면 다음 사람으로
            clearTimer();   // 남은 10초 무시
            setTimeout(() => hostNextSpeaker(), 500);
        }
    });

    // 소켓 수신: 시스템 메시지
    socket.on("systemMessage", (data) => {
        appendChatMessage("SYSTEM", data.text || "", { isSystem: true });
        addLog(data.text || "");
    });

    // 소켓 수신: 단계 업데이트
    socket.on("phaseUpdate", ({ phase, info }) => {
        handlePhaseUpdate(phase, info || {});
    });

    // ------------------------------
    // 버튼 이벤트
    // ------------------------------
    // 게임 시작 (호스트 전용)
    startBtn.addEventListener("click", async () => {
        if (!isHost) {
            showPopup("게임 시작은 호스트만 할 수 있습니다.", {
                title: "알림",
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

            addLog("호스트가 게임을 시작했습니다.");
            // 라운드 시작 알림 (5초 후 설명 단계)
            socket.emit("phaseUpdate", {
                roomID: Number(roomID),
                phase: "roundStart",
                info: { round: data.currentRound || 1 },
            });
        } catch (err) {
            console.error("게임 시작 오류:", err);
            showPopup("게임 시작 중 오류가 발생했습니다.", {
                title: "오류",
                type: "error",
            });
        }
    });

    // 라이어 공개 버튼 (일단 단순 안내용, 필요시 확장)
    revealBtn.addEventListener("click", () => {
        showPopup("현재 구현에서는 라이어를 시스템이 직접 공개하지 않습니다.\n토론과 추리로 라이어를 찾아보세요!", {
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
