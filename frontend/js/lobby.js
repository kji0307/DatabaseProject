// 로컬스토리지 키
const roomsKey = 'rooms_demo_v1';

// 초기 테스트 데이터 (로컬스토리지에 데이터가 없을 경우 사용)
const initialRooms = [
    { id: 1, title: '경주 문화재 라이어', category: '라이어 게임', players: 8, maxPlayers: 8, status: 'wait' },
    { id: 2, title: '신라의 왕 찾기 퀴즈', category: '객관식', players: 3, maxPlayers: 6, status: 'open' },
    { id: 3, title: '초보자 환영 방', category: 'O/X 퀴즈', players: 1, maxPlayers: 4, status: 'open' },
    { id: 4, title: '황룡사 9층 목탑 복원전', category: '토론', players: 5, maxPlayers: 6, status: 'open' }
];

function loadRooms(){
  try{ 
    // 데이터가 없으면 초기 데이터 저장 후 로드
    let data = JSON.parse(localStorage.getItem(roomsKey));
    if (!data || data.length === 0) {
        localStorage.setItem(roomsKey, JSON.stringify(initialRooms));
        return initialRooms;
    }
    return data;
  }
  catch(e){ 
    return initialRooms;
  }
}

// HTML에서 roomGrid ID를 가진 요소를 가져옴 (이제 .rooms-container 임)
const roomGrid = document.getElementById('roomGrid');
const emptyEl = document.getElementById('empty');

function renderRooms(){
  let list = loadRooms();
  roomGrid.innerHTML = ''; // 기존 내용 비우기

  // 방이 없을 경우 메시지 표시
  if(list.length === 0){
    emptyEl.style.display='block';
    return;
  }

  emptyEl.style.display='none';

  // 각 방 카드를 동적으로 생성
  list.forEach(r => {
    // 8/8이면 게임중(wait) 상태로 강제 변경하여 '입장' 버튼 비활성화
    const isFull = r.players >= r.maxPlayers;
    const currentStatus = isFull ? 'wait' : r.status;
    const statusText = currentStatus === 'open' ? 'WAITING' : 'PLAYING';
    const btnDisabled = isFull ? 'disabled' : '';

    const card = document.createElement('div');
    card.className = 'room-card'; // 스크린샷과 동일한 클래스 사용

    // 정원이 가득 찬 경우(isFull)에만 'full' 클래스 추가 (CSS로 회색 처리 등을 위해)
    if (isFull) {
        card.classList.add('full');
    }

    card.innerHTML = `
        <div class="room-title">★ ${r.title} ★</div>
        <div class="room-status">
            <span>${statusText}</span>
            <span>${r.players}/${r.maxPlayers}</span>
        </div>
        <button class="enter-btn" ${btnDisabled} onclick="joinRoom(${r.id})">
            ${isFull ? '정원 초과' : '입장'}
        </button>
    `;
    roomGrid.appendChild(card);
  });

    // 빈 카드 채우기 (스크린샷처럼 9칸을 맞추기 위함)
    const totalCards = list.length;
    const maxGrid = 9; // 스크린샷 기준으로 최대 9칸
    for (let i = totalCards; i < maxGrid; i++) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'room-card empty';
        roomGrid.appendChild(emptyCard);
    }
}

// 방 참가 로직 함수
function joinRoom(id){
  const list = loadRooms();
  const room = list.find(r=>r.id===id);

  if(!room) return alert('방이 없습니다.');
  if(room.players >= room.maxPlayers) return alert('정원이 가득 찼습니다. 게임중이거나 꽉 찬 방입니다.');

  // 플레이어 수 증가
  room.players++;
  localStorage.setItem(roomsKey, JSON.stringify(list));

  renderRooms(); // 방 목록 업데이트

  // 실제로는 여기서 game_room.html로 이동해야 함
  // window.location.href = "game_room.html?id=" + id;

  alert('참가 완료! (실제로는 방으로 이동합니다)');
}

// 페이지 열리면 바로 실행
renderRooms();