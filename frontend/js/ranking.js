// frontend/js/ranking.js
// 누적 점수 기반 랭킹 표시

document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "https://databaseproject-r39m.onrender.com";
  const tbody = document.getElementById("ranking-body");
  if (!tbody) return;

  // 현재 로그인한 사용자 이름 (있으면 내 랭크 강조)
  let currentUsername = null;
  try {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      currentUsername = user?.username || null;
    }
  } catch (e) {
    console.warn("user 파싱 오류:", e);
  }

  async function loadRanking() {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="ranking-empty">랭킹을 불러오는 중입니다...</td>
      </tr>
    `;

    try {
      const res = await fetch(`${API_BASE_URL}/api/game/ranking`);
      const data = await res.json();

      if (!res.ok) {
        console.error("랭킹 조회 실패:", data.message || res.statusText);
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="ranking-empty">랭킹을 불러오지 못했습니다.</td>
          </tr>
        `;
        return;
      }

      const list = data.ranking || [];

      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="ranking-empty">아직 랭킹 데이터가 없습니다.</td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = "";

      list.forEach((row, index) => {
        const tr = document.createElement("tr");

        // 내 닉네임과 같으면 강조
        if (currentUsername && row.username === currentUsername) {
          tr.classList.add("my-rank");
        }

        tr.innerHTML = `
          <td class="rank-num">${index + 1}</td>
          <td class="rank-nickname">${row.username}</td>
          <td class="rank-score">${Number(row.score || 0).toLocaleString()}</td>
        `;

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error("랭킹 조회 오류:", err);
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="ranking-empty">랭킹 조회 중 오류가 발생했습니다.</td>
        </tr>
      `;
    }
  }

  loadRanking();
});
