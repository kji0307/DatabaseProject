// backend/src/app.js
// Express + Socket.io 통합 서버 엔트리

const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// Socket.io 서버 생성
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", // 개발 단계: 어디서든 접속 허용
        methods: ["GET", "POST"],
    },
});

// ====== 미들웨어 ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== 정적 파일 서빙 설정 ======
// __dirname = backend/src
// ../../frontend = 프로젝트 루트 기준 frontend 폴더
const FRONTEND_DIR = path.join(__dirname, "../../frontend");

// / → index.html, /game_lobby.html, /login.html 등 정적 파일 제공
app.use(express.static(FRONTEND_DIR));

// 루트(/)로 접속 시 frontend/index.html 반환
app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ====== 라우터 연결 ======
const gameRoutes = require("./routes/gameRoutes");
const authRoutes = require("./routes/authRoutes");
const heritageRoutes = require("./routes/heritageRoutes");

app.use("/api/game", gameRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/heritage", heritageRoutes);

// 헬스 체크용 엔드포인트
app.get("/health", (req, res) => {
    res.send("Heritage Liar Game API 서버 동작 중");
});

// ====== Socket.io 이벤트 설정 ======
const setupGameSocket = require("./socket");
setupGameSocket(io);

// ====== 서버 시작 ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT} (http://localhost:${PORT})`);
});

module.exports = { app, server, io };
