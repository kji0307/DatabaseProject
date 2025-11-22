// --------------------------
// ✅ 공통 팝업(모달) UI 공용 함수들
// --------------------------

function getPopupOverlay() {
  let overlay = document.querySelector(".app-popup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "app-popup-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
}

// ✅ 기본 알림 팝업 (확인 1버튼)
function showPopup(message, options = {}) {
  const {
    title = "알림",
    type = "success",
    onClose = null,
    redirectUrl = null,
  } = options;

  const overlay = getPopupOverlay();

  overlay.innerHTML = `
    <div class="app-popup">
      <div class="app-popup-title"></div>
      <div class="app-popup-message"></div>
      <div class="app-popup-buttons">
        <button class="app-popup-button-ok">확인</button>
      </div>
    </div>
  `;

  const popup = overlay.querySelector(".app-popup");
  const titleEl = overlay.querySelector(".app-popup-title");
  const msgEl = overlay.querySelector(".app-popup-message");
  const okBtn = overlay.querySelector(".app-popup-button-ok");

  popup.classList.remove("app-popup-success", "app-popup-error");
  popup.classList.add(type === "error" ? "app-popup-error" : "app-popup-success");

  titleEl.textContent = title;
  msgEl.textContent = message;

  const closePopup = () => {
    overlay.style.display = "none";
    okBtn.removeEventListener("click", handleClick);
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
    if (onClose) onClose();
  };

  const handleClick = () => {
    closePopup();
  };

  okBtn.addEventListener("click", handleClick);
  overlay.style.display = "flex";
}

// --------------------------
// 🚪 메뉴 하이라이트 & 로그인 상태 표시
// --------------------------
document.addEventListener("DOMContentLoaded", function () {
  const currentPage = location.pathname.split("/").pop();
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });

  const user = localStorage.getItem("user");
  const loginMenu = document.getElementById("login-menu");
  const logoutMenu = document.getElementById("logout-menu");
  const logoutBtn = document.getElementById("logout-btn");

  if (user) {
    if (loginMenu) loginMenu.style.display = "none";
    if (logoutMenu) logoutMenu.style.display = "block";
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      if (loginMenu) loginMenu.style.display = "block";
      if (logoutMenu) logoutMenu.style.display = "none";

      showPopup("로그아웃 되었습니다.", {
        title: "로그아웃",
        type: "success",
        redirectUrl: "index.html",
      });
    });
  }
});

// --------------------------
// 🚀 JWT API 연결 기능 (회원가입 & 로그인)
// --------------------------

// 🔄 Render 서버로 변경됨!!!
const BASE_URL = "https://databaseproject-r39m.onrender.com";

// --------------------------
// 📌 회원가입
// --------------------------
async function signupUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    showPopup("아이디와 비밀번호를 모두 입력해주세요.", {
      title: "입력 확인",
      type: "error",
    });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      showPopup("회원가입이 완료되었습니다.\n로그인 페이지로 이동합니다.", {
        title: "회원가입 성공",
        type: "success",
        redirectUrl: "login.html",
      });
    } else {
      showPopup(data.message || "회원가입에 실패했습니다.", {
        title: "회원가입 실패",
        type: "error",
      });
    }
  } catch (error) {
    console.error("회원가입 오류:", error);
    showPopup("서버 연결에 실패했습니다.\n잠시 후 다시 시도해주세요.", {
      title: "오류",
      type: "error",
    });
  }
}

// --------------------------
// 📌 로그인
// --------------------------
async function loginUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    showPopup("아이디와 비밀번호를 모두 입력해주세요.", {
      title: "입력 확인",
      type: "error",
    });
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token);

      showPopup(`로그인에 성공했습니다.\n환영합니다, ${data.user.username}님!`, {
        title: "로그인 성공",
        type: "success",
        redirectUrl: "index.html",
      });
    } else {
      showPopup(data.message || "로그인에 실패했습니다.", {
        title: "로그인 실패",
        type: "error",
      });
    }
  } catch (error) {
    console.error("로그인 오류:", error);
    showPopup("서버 연결에 실패했습니다.\n잠시 후 다시 시도해주세요.", {
      title: "오류",
      type: "error",
    });
  }
}
