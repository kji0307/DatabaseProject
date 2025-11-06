// 라이어 게임 데이터
const topics = [
    {
        category: "음식",
        words: ["김치찌개", "된장찌개", "순두부찌개", "스테이크"]
    },
    {
        category: "스포츠",
        words: ["축구", "야구", "농구", "체스"]
    },
    {
        category: "동물",
        words: ["강아지", "고양이", "토끼", "상어"]
    },
    {
        category: "과일",
        words: ["사과", "배", "복숭아", "당근"]
    }
];

const startBtn = document.getElementById("start-btn");
const revealBtn = document.getElementById("reveal-btn");
const questionEl = document.getElementById("question");
const resultEl = document.getElementById("result");
const choicesEl = document.getElementById("choices");

let players = ["지혁", "창민", "성민"];
let liar = "";
let selectedTopic = null;

// 🎮 게임 시작
startBtn.addEventListener("click", () => {
    // 랜덤 주제 선택
    selectedTopic = topics[Math.floor(Math.random() * topics.length)];
    const { category, words } = selectedTopic;

    // 라이어 지정
    liar = players[Math.floor(Math.random() * players.length)];

    // 화면 출력
    questionEl.textContent = `오늘의 주제: ${category}`;
    choicesEl.innerHTML = `
        <p>각 플레이어는 제시어를 확인하세요.<br>단, ${liar}님은 라이어입니다! (제시어 없음)</p>
        <ul>
            ${players.map(p => `<li>${p}님의 제시어: <strong>${p === liar ? "❓ (비밀)" : words[Math.floor(Math.random() * (words.length - 1))]}</strong></li>`).join('')}
        </ul>
    `;

    startBtn.style.display = "none";
    revealBtn.style.display = "inline-block";
    resultEl.textContent = "";
});

// 🕵️‍♀️ 라이어 공개
revealBtn.addEventListener("click", () => {
    resultEl.textContent = `🎭 오늘의 라이어는 바로... ${liar}님입니다!`;
    revealBtn.style.display = "none";
    startBtn.style.display = "inline-block";
    questionEl.textContent = "다시 시작하려면 [게임 시작]을 누르세요.";
});