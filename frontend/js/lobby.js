// 로컬스토리지 키
const roomsKey = 'rooms_demo_v1';

function loadRooms(){
  try{ return JSON.parse(localStorage.getItem(roomsKey)) || [] }
  catch(e){ return [] }
}

const roomGrid = document.getElementById('roomGrid');
const emptyEl = document.getElementById('empty');

function renderRooms(){
  let list = loadRooms();
  roomGrid.innerHTML = '';

  if(list.length === 0){
    emptyEl.style.display='block';
    return;
  }

  emptyEl.style.display='none';

  list.forEach(r => {
    const card = document.createElement('article');
    card.className = 'room-card';
    card.innerHTML = `
      <div class="room-header">
        <div>
          <div class="room-title">${r.title}</div>
          <div class="room-meta">${r.category} · 참가자 ${r.players}/${r.maxPlayers}</div>
        </div>
        <div class="pill ${r.status==='open'?'open':'wait'}">
          ${r.status==='open'?'참가 가능':'게임중'}
        </div>
      </div>
      <div class="room-body">
        <div class="actions">
          <button class="btn" onclick="joinRoom(${r.id})">참가</button>
        </div>
      </div>
    `;
    roomGrid.appendChild(card);
  });
}

function joinRoom(id){
  const list = loadRooms();
  const room = list.find(r=>r.id===id);

  if(!room) return alert('방이 없습니다.');
  if(room.players >= room.maxPlayers) return alert('정원이 가득 찼습니다.');

  room.players++;
  localStorage.setItem(roomsKey, JSON.stringify(list));

  renderRooms();
  alert('참가 완료!');
}

// 페이지 열리면 바로 실행
renderRooms();
