// backend/src/socket.js
// 라이어 게임 실시간 처리 socket.io 서버

module.exports = (io) => {

    // 모든 소켓 연결 시작
    io.on("connection", (socket) => {
        console.log("🔌 소켓 연결됨:", socket.id);

        // =========================
        // 1) 방 참가
        // =========================
        socket.on("joinRoom", ({ roomID, userID, username }) => {
            socket.join(`room_${roomID}`);
            socket.roomID = roomID;
            socket.userID = userID;
            socket.username = username;

            io.to(`room_${roomID}`).emit("systemMessage", {
                type: "join",
                text: `${username} 님이 방에 입장했습니다.`
            });

            console.log(`➡️ User ${username} (${userID}) joined room ${roomID}`);
        });

        // =========================
        // 2) 토론/해명 채팅
        // =========================
        socket.on("chatMessage", ({ roomID, userID, username, message }) => {
            io.to(`room_${roomID}`).emit("chatMessage", {
                userID,
                username,
                message,
                time: new Date()
            });
        });

        // =========================
        // 3) 설명 순서 / 게임 상태 변화 브로드캐스트
        // =========================
        socket.on("phaseUpdate", ({ roomID, phase, info }) => {
            io.to(`room_${roomID}`).emit("phaseUpdate", { phase, info });
            console.log(`📢 Phase update in room ${roomID}: ${phase}`);
        });

        // =========================
        // 4) 타이머 동기화
        // =========================
        socket.on("timerStart", ({ roomID, duration }) => {
            io.to(`room_${roomID}`).emit("timerStart", { duration });
        });

        socket.on("timerTick", ({ roomID, remain }) => {
            io.to(`room_${roomID}`).emit("timerTick", { remain });
        });

        socket.on("timerEnd", ({ roomID }) => {
            io.to(`room_${roomID}`).emit("timerEnd");
        });

        // =========================
        // 5) 용의자 결정 / 최종판단 알림
        // =========================
        socket.on("suspectSelected", ({ roomID, suspectID, suspectName }) => {
            io.to(`room_${roomID}`).emit("suspectSelected", {
                suspectID,
                suspectName
            });
        });

        socket.on("finalVoteCompleted", ({ roomID, result }) => {
            io.to(`room_${roomID}`).emit("finalVoteCompleted", result);
        });

        // =========================
        // 6) 방 폭파 (호스트 퇴장 시)
        // =========================
        socket.on("roomClosed", ({ roomID }) => {
            io.to(`room_${roomID}`).emit("roomClosed");
            io.in(`room_${roomID}`).socketsLeave(`room_${roomID}`);
        });

        // =========================
        // 7) 소켓 연결 해제
        // =========================
        socket.on("disconnect", () => {
            console.log("❌ 소켓 연결 해제:", socket.id);

            if (socket.roomID) {
                io.to(`room_${socket.roomID}`).emit("systemMessage", {
                    type: "leave",
                    text: `${socket.username || "유저"} 님이 퇴장했습니다.`
                });
            }
        });
    });

};
