document.addEventListener("DOMContentLoaded", function () {
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

