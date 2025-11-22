// backend/src/routes/gameRoutes.js
// 라이어 게임 관련 REST API 라우터

const express = require("express");
const router = express.Router();

const gameController = require("../controllers/gameController");

// 방 목록 / 상세
router.get("/rooms", gameController.getRooms);
router.get("/rooms/:roomID", gameController.getRoomDetail);

// 방 생성 / 참가 / 나가기
router.post("/create", gameController.createRoom);
router.post("/join", gameController.joinRoom);
router.post("/leave", gameController.leaveRoom);

// 게임 시작(다음 라운드 시작) + 제시어 정보
router.post("/start", gameController.startGame);
router.get("/round/:roomID/:userID", gameController.getRoundInfo);

// 1차 투표 (라이어 후보 뽑기)
router.post("/vote", gameController.castVote);
router.post("/vote/result", gameController.getVoteResult);

// 최종(라이어다/아니다) 투표
router.post("/final-vote", gameController.castFinalVote);
router.post("/final-vote/result", gameController.getFinalVoteResult);

// 누적 점수 기반 랭킹 조회
router.get("/ranking", gameController.getRanking);

module.exports = router;
