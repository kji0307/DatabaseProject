const BASE_URL = "https://databaseproject-r39m.onrender.com"; // Render 백엔드 주소

async function loadHeritageList() {
  try {
    const res = await fetch(`${BASE_URL}/api/heritage`);
    const data = await res.json();

    const listContainer = document.getElementById("heritage-list");
    listContainer.innerHTML = "";

    data.forEach(item => {
      const desc =
        item.heritageDesc ||    // 예전 필드명
        item.heritageContent || // 지금 DB 필드명
        "설명 없음";            // 둘 다 없을 때

      const card = document.createElement("div");
      card.classList.add("heritage-item");

      card.innerHTML = `
        <h3>${item.heritageName}</h3>
        <p>유형: ${item.heritageCategory}</p>
        <p>${desc}</p>
      `;

      card.addEventListener("click", () => {
        window.location.href = `heritage_info.html?id=${item.heritageID}`;
      });

      listContainer.appendChild(card);
    });
  } catch (err) {
    console.error("데이터 불러오기 오류:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadHeritageList);
