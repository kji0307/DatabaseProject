// js/game.js (최종 통합 코드)

// ==== HTML 요소 정의 (어몽어스 UI 기반) ====
const playerListEl = document.getElementById('player-list');
const timerEl = document.getElementById('timer').querySelector('span');
const keywordDisplayEl = document.getElementById('keyword-display');
const myRoleEl = document.getElementById('my-role');
const skipVoteBtn = document.getElementById('skip-vote-btn');
const endVoteBtn = document.getElementById('end-vote-btn');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessagesEl = document.getElementById('chat-messages');

// ==== 🎭 라이어 게임 데이터 (문화재 기반) ====
const culturalHeritageTopics = [
    {
        category: "석탑",
        mainWord: "불국사 다보탑",
        liarHint: "경주 석탑" 
    },
    {
        category: "불상",
        mainWord: "석굴암 본존불",
        liarHint: "경주 부처님"
    },
    {
        category: "왕릉",
        mainWord: "첨성대", 
        liarHint: "경주 유적"
    }
];

// ==== 👤 플레이어 목록 (테스트용) ====
const allPlayers = [
    { id: 1, name: "지혁", color: "red", isAlive: true },
    { id: 2, name: "창민", color: "blue", isAlive: true },
    { id: 3, name: "성민", color: "green", isAlive: true },
    { id: 4, name: "유진", color: "yellow", isAlive: true },
];

// ==== 게임 상태 변수 ====
let gameState = {
    myPlayerId: 1, // ⚠️ 내 ID는 로그인 세션에서 가져와야 함.
    players: JSON.parse(JSON.stringify(allPlayers)), 
    liarId: null,
    selectedTopic: null,
    timer: 60, 
    myVoteTarget: null,
    isVoting: false
};


// 1. 🚀 게임 시작 (로컬에서 역할 분배 시뮬레이션)
function startGame() {
    // 1-1. 랜덤 주제 및 라이어 지정
    const topicIndex = Math.floor(Math.random() * culturalHeritageTopics.length);
    gameState.selectedTopic = culturalHeritageTopics[topicIndex];
    
    const liarIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.liarId = gameState.players[liarIndex].id;

    gameState.players.forEach(p => {
        p.isLiar = (p.id === gameState.liarId);
        p.myKeyword = p.isLiar ? gameState.selectedTopic.liarHint : gameState.selectedTopic.mainWord;
    });
    
    gameState.isVoting = true;
    gameState.timer = 60;
    
    // 1-2. UI 렌더링 및 타이머 시작
    renderKeywordInfo();
    renderPlayers();
    startTimer();
    console.log(`⭐ 라이어는 ID: ${gameState.liarId} (${gameState.players.find(p => p.id === gameState.liarId).name}) 입니다. (테스트용)`);
}


// 2. 📝 나의 역할 및 키워드 정보 렌더링
function renderKeywordInfo() {
    const me = gameState.players.find(p => p.id === gameState.myPlayerId);
    
    if (!me) return;

    myRoleEl.textContent = me.isLiar ? "라이어" : "시민";
    // CSS 스타일을 JS로 직접 적용 (인라인 스타일)
    myRoleEl.style.color = me.isLiar ? 'red' : 'green'; 
    
    keywordDisplayEl.textContent = me.myKeyword;
}


// 3. 🎨 플레이어 카드 목록 렌더링
function renderPlayers() {
    playerListEl.innerHTML = '';
    
    gameState.players.forEach(p => {
        const isVoted = (p.id === gameState.myVoteTarget);
        
        const card = document.createElement('div');
        card.className = `player-card player-${p.color} ${p.isAlive ? '' : 'dead'} ${isVoted ? 'selected-vote' : ''}`;
        card.dataset.playerId = p.id;
        
        // 여기에 어몽어스 스타일 캐릭터 이미지 태그를 삽입할 수 있습니다.
        // 예: card.innerHTML = `<img src="assets/crewmate-${p.color}.svg" class="crewmate-icon">`;
        
        card.innerHTML += `
            <span class="player-name">${p.name}</span>
            ${isVoted ? '<div class="vote-badge">지목됨</div>' : ''}
        `;
        
        if (p.isAlive && gameState.isVoting) {
             card.addEventListener('click', () => handleVote(p.id));
        } else {
             card.style.cursor = 'default';
        }

        playerListEl.appendChild(card);
    });
}


// 4. 🗳️ 투표 (라이어 지목) 로직
function handleVote(targetId) {
    if (!gameState.isVoting) return alert('투표 시간이 아닙니다.');

    gameState.myVoteTarget = targetId;
    
    renderPlayers();
    console.log(`라이어 지목 대상 변경: ID ${targetId}`);
}


// 5. ⏱️ 타이머 로직
function startTimer() {
    const interval = setInterval(() => {
        if (!gameState.isVoting) {
            clearInterval(interval);
            return;
        }
        
        gameState.timer--;
        timerEl.textContent = `${gameState.timer}s`;

        if (gameState.timer <= 0) {
            clearInterval(interval);
            endVotingPhase(); 
        }
    }, 1000);
}


// 6. 🛑 투표 종료 시 처리 (서버 통신 로직이 필요함)
function endVotingPhase() {
    gameState.isVoting = false;
    
    // 이 시점에 서버로 최종 투표를 전송하고 결과를 받아와야 합니다.
    alert("투표 시간이 종료되었습니다. 서버에서 라이어를 공개합니다.");

    // 투표 액션 버튼 비활성화
    skipVoteBtn.disabled = true;
    endVoteBtn.disabled = true;
}


// 7. 💬 채팅 기능 (간소화된 로컬 구현)
chatSendBtn.addEventListener('click', () => sendMessage());

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '') return;

    const me = gameState.players.find(p => p.id === gameState.myPlayerId);
    if (!me) return;

    // UI에 메시지 표시 
    const msgDiv = document.createElement('p');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `<b>${me.name}:</b> ${message}`;
    
    chatMessagesEl.appendChild(msgDiv);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    chatInput.value = '';
    
    // (⚠️ 실제로는 WebSocket을 통해 서버로 메시지 전송 로직이 필요합니다.)
}


// 8. 🖱️ 이벤트 리스너 연결
skipVoteBtn.addEventListener('click', () => {
    if (!gameState.isVoting) return;
    gameState.myVoteTarget = 'SKIP';
    renderPlayers();
    console.log("투표 건너뛰기");
});

endVoteBtn.addEventListener('click', () => {
    if (!gameState.isVoting) return;
    if (!gameState.myVoteTarget || gameState.myVoteTarget === 'SKIP') {
        return alert('지목할 플레이어를 선택하거나 건너뛰기를 선택해주세요.');
    }
    // 투표 완료 로직
    endVotingPhase();
});

// 9. ✨ 초기화 및 게임 시작
startGame();