// backend/src/socket.js
// 라이어 게임 실시간 엔진 (설명 → 토론 → 투표 → 최종판단 → 결과)

const pool = require("./models/db");

module.exports = function setupGameSocket(io) {
    const rooms = {}; 
    // 구조:
    // rooms[roomID] = {
    //     speakingOrder: [],
    //     currentSpeakerIndex: -1,
    //     currentPhase: "waiting",
    //     suspectID: null,
    //     finalVotes: {}, 
    // }

    // 🔹 누군가 방에 입장
    io.on("connection", (socket) => {
        console.log("🔌 New client connected:", socket.id);

        // ------------------------------
        // 방 입장
        // ------------------------------
        socket.on("joinRoom", async ({ roomID, userID, username }) => {
            roomID = String(roomID);
            socket.join(`room_${roomID}`);
            socket.roomID = roomID;
            socket.userID = userID;
            socket.username = username;

            console.log(`➡ ${username} (${userID}) joined room ${roomID}`);

            // DB에서 최신 플레이어 목록 가져오기
            const [players] = await pool.query(
                `SELECT userID, username FROM user_tbl WHERE currentRoom = ?`,
                [roomID]
            );

            // 방에 state 없으면 초기화
            if (!rooms[roomID]) {
                rooms[roomID] = {
                    speakingOrder: [],
                    currentSpeakerIndex: -1,
                    currentPhase: "waiting",
                    suspectID: null,
                    finalVotes: {}
                };
            }

            io.to(`room_${roomID}`).emit("playerUpdate", players);

            io.to(`room_${roomID}`).emit("systemMessage", {
                text: `${username} 님이 방에 입장했습니다.`,
            });
        });

        // ------------------------------
        // 방 나가기
        // ------------------------------
        socket.on("leaveRoom", async ({ roomID, userID }) => {
            roomID = String(roomID);
            socket.leave(`room_${roomID}`);

            console.log(`⬅ User ${userID} left room ${roomID}`);

            // DB에서도 currentRoom 비우기
            await pool.query(
                `UPDATE user_tbl SET currentRoom = NULL WHERE userID = ?`,
                [userID]
            );

            const [players] = await pool.query(
                `SELECT userID, username FROM user_tbl WHERE currentRoom = ?`,
                [roomID]
            );

            io.to(`room_${roomID}`).emit("playerUpdate", players);

            io.to(`room_${roomID}`).emit("systemMessage", {
                text: `${socket.username} 님이 방에서 나갔습니다.`,
            });
        });

        // ------------------------------
        // 채팅
        // ------------------------------
        socket.on("chatMessage", (data) => {
            const { roomID, userID, username, message } = data;
            io.to(`room_${roomID}`).emit("chatMessage", {
                userID,
                username,
                message,
            });
        });

        // ------------------------------
        // 단계 업데이트 (호스트만 emit)
        // ------------------------------
        socket.on("phaseUpdate", ({ roomID, phase, info }) => {
            roomID = String(roomID);
            console.log(`📢 phaseUpdate in room ${roomID}: ${phase}`);

            // 서버에서 단계 기억
            if (!rooms[roomID]) return;
            rooms[roomID].currentPhase = phase;

            io.to(`room_${roomID}`).emit("phaseUpdate", { phase, info });
        });

        // ------------------------------
        // 설명 단계 랜덤 순서 설정 (호스트만)
        // ------------------------------
        socket.on("setSpeakingOrder", ({ roomID, order }) => {
            roomID = String(roomID);
            if (!rooms[roomID]) return;

            rooms[roomID].speakingOrder = order;
            rooms[roomID].currentSpeakerIndex = -1;

            console.log(`🔀 Speaking order for room ${roomID}:`, order);
        });

        // ------------------------------
        // 다음 설명자 호출 (호스트만)
        // ------------------------------
        socket.on("nextSpeaker", ({ roomID }) => {
            roomID = String(roomID);
            if (!rooms[roomID]) return;

            const state = rooms[roomID];
            const order = state.speakingOrder;

            state.currentSpeakerIndex++;

            // 모두 설명 끝
            if (state.currentSpeakerIndex >= order.length) {
                console.log(`🟦 설명 완료 → 토론 단계 전환`);
                io.to(`room_${roomID}`).emit("phaseUpdate", {
                    phase: "discussionStart",
                    info: {}
                });
                return;
            }

            // 다음 설명자
            const speakerID = order[state.currentSpeakerIndex];

            console.log(`🟦 설명 차례: user ${speakerID}`);

            io.to(`room_${roomID}`).emit("phaseUpdate", {
                phase: "explainTurn",
                info: { speakerID }
            });
        });

        // ------------------------------
        // 1차 투표에서 1위 나온 사람 저장
        // ------------------------------
        socket.on("setSuspect", ({ roomID, suspectID }) => {
            roomID = String(roomID);
            if (!rooms[roomID]) return;

            rooms[roomID].suspectID = suspectID;
        });

        // ------------------------------
        // 최종 이지선다 투표
        // ------------------------------
        socket.on("finalChoiceVote", ({ roomID, userID, choice }) => {
            roomID = String(roomID);
            if (!rooms[roomID]) return;

            const state = rooms[roomID];
            // choice = "guilty" 또는 "innocent"
            state.finalVotes[userID] = choice;
        });

        // ------------------------------
        // 최종 이지선다 결과 요청
        // ------------------------------
        socket.on("finalChoiceResult", ({ roomID }) => {
            roomID = String(roomID);
            const state = rooms[roomID];
            if (!state) return;

            const votes = state.finalVotes;
            const values = Object.values(votes);

            const guiltyCount = values.filter(v => v === "guilty").length;
            const innocentCount = values.filter(v => v === "innocent").length;

            console.log(`🟥 최종판단 결과 in room ${roomID}:`, {
                guiltyCount,
                innocentCount
            });

            io.to(`room_${roomID}`).emit("finalChoiceResult", {
                guiltyCount,
                innocentCount,
                suspectID: state.suspectID
            });

            // 상태 초기화
            state.finalVotes = {};
        });

        // ------------------------------
        // 소켓 연결 종료
        // ------------------------------
        socket.on("disconnect", async () => {
            if (!socket.roomID || !socket.userID) return;

            const roomID = socket.roomID;
            const userID = socket.userID;

            console.log(`❌ Disconnect user ${userID}`);

            // DB 비우기
            await pool.query(
                `UPDATE user_tbl SET currentRoom = NULL WHERE userID = ?`,
                [userID]
            );

            const [players] = await pool.query(
                `SELECT userID, username FROM user_tbl WHERE currentRoom = ?`,
                [roomID]
            );

            io.to(`room_${roomID}`).emit("playerUpdate", players);

            io.to(`room_${roomID}`).emit("systemMessage", {
                text: `${socket.username} 님이 연결 종료됨`,
            });
        });
    });
};
