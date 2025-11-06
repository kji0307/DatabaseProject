document.addEventListener("DOMContentLoaded", function () {
<<<<<<< HEAD
      // 1️⃣ 현재 페이지 메뉴 하이라이트 !!여기 부분은 main.js에 있던 코드임!!
    const currentPage = location.pathname.split("/").pop();
    const navLinks = document.querySelectorAll(".nav-link");

    navLinks.forEach(link => {
        if (link.getAttribute("href") === currentPage) {
            link.classList.add("active");
        }
    });

    // 2️⃣ 로그인/로그아웃 기능
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
            e.preventDefault(); // href 이동 막기
            localStorage.removeItem("user");
            alert("로그아웃 되었습니다!");
            if (loginMenu) loginMenu.style.display = "block";
            if (logoutMenu) logoutMenu.style.display = "none";
            window.location.href = "index.html"; // 로그아웃 후 이동
        });
    }

});








document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("form");

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const id = document.getElementById("username").value.trim().toLowerCase();
        const password = document.getElementById("password").value.trim();

         if (!id || !password) {
            alert("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        // localStorage에서 회원 정보 불러오기
        const users = JSON.parse(localStorage.getItem("users")) || {};

        if (users[id] && users[id] === password) {
            // 로그인 성공 → 상태 저장
            localStorage.setItem("user", id);

            alert("로그인 성공!");
            window.location.href = "index.html"; // 로그인 후 이동
        } else {
            alert("ID 또는 비밀번호가 틀렸습니다!");
        }
    });
});

=======
  // 메뉴 하이라이트 및 로그인 상태 표시
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
      alert("로그아웃 되었습니다!");
      if (loginMenu) loginMenu.style.display = "block";
      if (logoutMenu) logoutMenu.style.display = "none";
      window.location.href = "index.html";
    });
  }
});

// --------------------------
// 🚀 JWT API 연결 기능 (회원가입 & 로그인)
// --------------------------

const BASE_URL = "http://localhost:3000"; // 백엔드 주소

// ✅ 회원가입
async function signupUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("아이디와 비밀번호를 모두 입력해주세요.");
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
      alert("회원가입 성공! 로그인 페이지로 이동합니다.");
      window.location.href = "login.html";
    } else {
      alert(data.message || "회원가입 실패");
    }
  } catch (error) {
    console.error("회원가입 오류:", error);
    alert("서버 연결 실패");
  }
}

// ✅ 로그인
async function loginUser() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    alert("아이디와 비밀번호를 모두 입력해주세요.");
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
      // ✅ JWT 토큰 또는 사용자 정보 저장
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("token", data.token); // 백엔드가 token 보낼 경우

      alert("로그인 성공!");
      window.location.href = "index.html";
    } else {
      alert(data.message || "로그인 실패");
    }
  } catch (error) {
    console.error("로그인 오류:", error);
    alert("서버 연결 실패");
  }
}
>>>>>>> origin/backend-dev
