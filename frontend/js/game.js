// frontend/js/game.js
// 라이어 게임 클라이언트 전체 로직 (채팅 + 단계 + 투표 + 최종 2지선다 + 결과 카드)

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "https://databaseproject-r39m.onrender.com";
    const socket = io(API_BASE_URL);

    // ------------------------------
    // URL / 유저 정보
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
        EXPLAIN: "explain",
        DISCUSS: "discussion",
        VOTE: "voting",
        FINAL: "final",
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

    let speakingOrder = [];      // 설명 순서: [userID, ...]
    let currentSpeakerIndex = -1;
    let currentSpeakerID = null; // 지금 설명 차례인 userID

    let timerId = null;
    let timerRemaining = 0;

    let myVoteTargetId = null;
    let myFinalChoice = null; // "guilty" | "innocent" | null

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
            case PHASE.RESULT: return "결과 발표";
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

            // 소켓으로 방 참가
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

                addLog(`게임 시작! ${info.round || 1}라운드가 곧 시작됩니다. (5초 후 설명)`);

                // 제시어/역할 불러오기
                loadRoundInfo();

                // 5초 카운트 후 호스트가 설명 순서 셔플 + 첫 설명자 호출
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

                infoEl.textContent = `${name}님의 설명 차례입니다. (10초)`;
                addLog(`[설명] ${name}님의 차례입니다.`);

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

                infoEl.textContent = "토론 단계입니다. 모두 자유롭게 채팅으로 의견을 나누세요! (60초)";
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

                infoEl.textContent = "1차 투표 단계입니다. 라이어라고 생각하는 사람에게 투표하세요! (10초)";
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

                infoEl.textContent = `${currentSuspectName}님에 대해 '라이어다 / 아니다'를 선택하세요! (10초)`;
                addLog(`⚖ 최종 판단: ${currentSuspectName}님이 라이어 후보입니다.`);

                myFinalChoice = null;
                renderFinalChoiceButtons(currentSuspectID, currentSuspectName);

                startTimer(10, () => {
                    if (isHost) {
                        // 소켓에 최종 결과 요청 → 서버가 집계해서 finalChoiceResult 브로드캐스트
                        socket.emit("finalChoiceResult", { roomID: Number(roomID) });
                    }
                });
                break;
            }

            // 최종 결과(점수 계산까지 끝난 후, 호스트가 phaseUpdate로 뿌림)
            case "finalResult": {
                gameState = PHASE.RESULT;
                updateRoundAndPhaseUI();
                clearTimer();
                voteAreaEl.innerHTML = "";

                showResultCard(info);
                break;
            }

            default:
                console.warn("알 수 없는 phase:", phase, info);
        }
    }

    // ------------------------------
    // 설명 순서 준비 (호스트만)
    // ------------------------------
    function prepareSpeakingOrder() {
        const ids = players.map(p => Number(p.userID));
        speakingOrder = shuffleArray(ids);
        currentSpeakerIndex = -1;

        // 서버에 설명 순서 저장
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

            // 서버에도 용의자 저장 (socket.js state용)
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

        // 버튼 UI 갱신
        document.querySelectorAll(".final-choice-btn").forEach((b) => {
            b.classList.remove("selected");
        });
        clickedBtn.classList.add("selected");

        // 소켓에 최종 투표 기록 (실시간 집계용)
        socket.emit("finalChoiceVote", {
            roomID: Number(roomID),
            userID,
            choice, // "guilty" or "innocent"
        });

        // 백엔드 DB에도 기록 (점수/랭킹용)
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
        const { guiltyCount, innocentCount, suspectID } = data;
        console.log("🟥 finalChoiceResult:", data);

        if (guiltyCount > innocentCount) {
            // 다수 의견: "라이어다" → 이제 진짜 최종 결과(점수 계산 포함)를 백엔드에서 받아온 뒤 전체에 브로드캐스트
            addLog("다수 의견: 라이어다 → 최종 결과를 계산합니다.");

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

                    // 모든 플레이어에게 최종 결과 브로드캐스트
                    socket.emit("phaseUpdate", {
                        roomID: Number(roomID),
                        phase: "finalResult",
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
            // 다수 의견: "라이어가 아니다" (또는 동점) → 재토론 단계로 되돌리기
            addLog("다수 의견: 라이어가 아니다 → 다시 토론 단계로 돌아갑니다.");

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
    // 결과 카드 표시
    // ------------------------------
    function showResultCard(info) {
        /*
            info 구조 (getFinalVoteResult 결과):
            {
                roundNum,
                suspectID,
                suspectName,
                liarID,
                isLiar,
                liarVoteCount,
                notLiarVoteCount,
                majorityChoice,
                outcome,        // "liarCaught" | "liarWronglyAccused" | "liarEscaped" ...
                winnerInfo      // 마지막 라운드에서 최종 우승자 정보 등 (있을 수도 있고 없음)
            }
        */

        const liarID = info.liarID;
        const suspectID = info.suspectID;
        const suspectName = info.suspectName;
        const liarVoteCount = info.liarVoteCount;
        const notLiarVoteCount = info.notLiarVoteCount;
        const outcome = info.outcome;

        const liarPlayer = getPlayerByID(liarID);
        const liarName = liarPlayer ? liarPlayer.username : (liarID ? `ID ${liarID}` : "알 수 없음");

        // 승패 텍스트
        let outcomeText = "";
        let detailText = "";

        if (outcome === "liarCaught") {
            outcomeText = "시민 승리!";
            detailText = `시민들이 라이어(${liarName})를 정확히 찾아냈습니다.`;
        } else if (outcome === "liarWronglyAccused") {
            outcomeText = "라이어 승리!";
            detailText = `${suspectName}님은 라이어가 아니었습니다. 시민들이 잘못된 사람을 지목했습니다.`;
        } else if (outcome === "liarEscaped") {
            outcomeText = "라이어 승리!";
            detailText = `시민들이 라이어를 잡지 못해, 라이어(${liarName})가 정체를 숨기고 도망쳤습니다.`;
        } else {
            outcomeText = "게임 결과";
            detailText = "최종 결과가 처리되었습니다.";
        }

        resultOutcomeEl.textContent = outcomeText;
        resultLiarNameEl.textContent = `라이어: ${liarName}`;
        // 완벽한 제시어 정보가 없으므로 우선 카테고리만 표시
        resultWordEl.textContent = topicCategory
            ? `제시어 카테고리: ${topicCategory}`
            : "제시어 정보: -";

        resultDetailEl.textContent =
            `${detailText}\n(라이어다: ${liarVoteCount}표 / 아니다: ${notLiarVoteCount}표)`;

        resultOverlayEl.classList.add("show");
    }

    if (resultCloseBtn) {
        resultCloseBtn.addEventListener("click", () => {
            // 일단은 로비로 이동 (추후 다시 한 판 하기 등으로 확장 가능)
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

            // 호스트는 설명이 나오면 다음 사람으로 넘기기
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
        // playerRows = [{ userID, username }, ...]
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
    // 게임 시작 (호스트 전용)
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

    // (선택) 라이어 공개 버튼 – 지금은 안내만
    revealBtn.addEventListener("click", () => {
        showPopup("현재는 라이어를 시스템이 강제로 공개하지 않습니다.\n토론과 추리로 라이어를 찾아보세요!", {
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

            // 소켓에서도 방 나가기 알림
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
