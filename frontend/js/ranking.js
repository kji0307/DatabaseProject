// ranking.js 파일 내용

// --- 1. 가상 랭킹 데이터 수정 (avatar, winRate 필드 제거) --- (실제로는 서버 API에서 가져와야 함)
const rankingData = [
    // rank, nickname, score, isMine 필드만 유지
    { rank: 1, nickname: '선덕여왕', score: 12500, isMine: false },
    { rank: 2, nickname: '김유신', score: 11000, isMine: false },
    { rank: 3, nickname: '최치원', score: 9800, isMine: false },
    { rank: 4, nickname: '불국사덕후', score: 9500, isMine: false },
    { rank: 5, nickname: '경주사랑', score: 9200, isMine: false },
    // ... (중간 생략)
    { rank: 47, nickname: '나의 닉네임', score: 2500, isMine: true }, // 현재 사용자
    // ...
];

const MY_NICKNAME = '나의 닉네임';  // 로그인된 사용자 닉네임 (실제로는 세션/로컬 스토리지에서 가져옴)

// --- 2. 랭킹 데이터 렌더링 함수 (변경 없음) ---
function renderRanking() {
    // 1. Top 3 렌더링
    const top3Container = document.querySelector('.top3-rank');
    if (!top3Container) return;

    const top1 = rankingData.find(item => item.rank === 1);
    const top2 = rankingData.find(item => item.rank === 2);
    const top3 = rankingData.find(item => item.rank === 3);

    top3Container.innerHTML = `
        ${createTopRankItem(top2, 'rank-2')}
        ${createTopRankItem(top1, 'rank-1')}
        ${createTopRankItem(top3, 'rank-3')}
    `;

    // 2. 일반 랭킹 목록 렌더링
    const listBody = document.querySelector('.ranking-list tbody');
    if (!listBody) return;
    listBody.innerHTML = ''; 

    rankingData.forEach(item => {
        if (item.rank >= 4) {
            listBody.appendChild(createListItem(item));
        }
    });

    const myRankItem = rankingData.find(item => item.nickname === MY_NICKNAME);
    if (myRankItem && myRankItem.rank > 3) {
         listBody.appendChild(createListItem(myRankItem, true));
    }
}


// --- 3. HTML 생성 헬퍼 함수 수정 (아바타/승률 관련 코드 제거) ---

// Top 3 항목 HTML 생성 (아바타 div 제거)
function createTopRankItem(data, rankClass) {
    if (!data) return '';
    const medal = data.rank === 1 ? '🥇' : data.rank === 2 ? '🥈' : '🥉';
    const isMineClass = data.isMine ? ' my-rank-top' : '';

    return `
        <div class="rank-item ${rankClass}${isMineClass}">
            <span class="medal">${medal}</span>
            <div class="nickname">${data.nickname}</div>
            <div class="score">${data.score.toLocaleString()}점</div>
        </div>
    `;
}

// 일반 목록 항목 HTML 생성 (아바타와 승률 td 제거)
function createListItem(data, isMyRank = false) {
    const row = document.createElement('tr');
    // 현재 사용자 순위라면 'my-rank' 클래스 추가
    if (data.isMine || isMyRank) {
        row.classList.add('my-rank');
    }

    row.innerHTML = `
        <td class="rank-num">${data.rank}</td>
        <td class="rank-nickname">${data.nickname}</td>
        <td class="rank-score">${data.score.toLocaleString()}</td>
        `;
    return row;
}

// --- 4. DOM 로드 후 함수 실행 ---
document.addEventListener('DOMContentLoaded', renderRanking);