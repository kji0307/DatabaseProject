const BASE_URL = "http://localhost:3000"; // 백엔드 서버 주소

async function loadHeritageList() {
  try {
    const res = await fetch(`${BASE_URL}/api/heritage`);
    const data = await res.json();

    const listContainer = document.getElementById("heritage-list");
    listContainer.innerHTML = "";

    data.forEach(item => {
      const card = document.createElement("div");
      card.classList.add("heritage-item");

      card.innerHTML = `
        <h3>${item.heritageName}</h3>
        <p>유형: ${item.heritageCategory}</p>
        <p>${item.heritageDesc}</p>
      `;

      card.addEventListener("click", () => {
        window.location.href = `heritage_detail.html?id=${item.heritageID}`;
      });

      listContainer.appendChild(card);
    });
  } catch (err) {
    console.error("데이터 불러오기 오류:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadHeritageList);
