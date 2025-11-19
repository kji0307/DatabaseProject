const pool = require('../models/db');

// 방 생성
exports.createRoom = async (req, res) => {
  try {
    const { hostID, heritageID } = req.body;

    if (!hostID || !heritageID) {
      return res.status(400).json({ message: "hostID와 heritageID는 필수입니다." });
    }

    // ✅ 한 사용자가 여러 방을 생성하지 못하도록 확인
    const [existing] = await pool.query(
      "SELECT * FROM liar_game_room_tbl WHERE hostID = ? AND isActive = 1",
      [hostID]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "이미 생성한 방이 있습니다." });
    }

    // ✅ 방 생성
    const [result] = await pool.query(
      "INSERT INTO liar_game_room_tbl (hostID, heritageID, playerCount, isActive, createdAT) VALUES (?, ?, ?, ?, NOW())",
      [hostID, heritageID, 1, 1]
    );

    res.status(201).json({
      message: "방이 생성되었습니다!",
      roomID: result.insertId,
      hostID,
      heritageID
    });
  } catch (err) {
    console.error("방 생성 오류:", err);
    res.status(500).json({ message: "방 생성 실패", error: err.message });
  }
};

// 방 참가
exports.joinRoom = async (req, res) => {
  try {
    const { roomID, userID } = req.body;

    if (!roomID || !userID) {
      return res.status(400).json({ message: "roomID와 userID는 필수입니다." });
    }

    // 방 존재 여부 확인
    const [room] = await pool.query("SELECT * FROM liar_game_room_tbl WHERE roomID = ?", [roomID]);
    if (room.length === 0) {
      return res.status(404).json({ message: "존재하지 않는 방입니다." });
    }

    const roomData = room[0];

    // 이미 방이 꽉 찼는지 확인
    if (roomData.playerCount >= 5) {
      return res.status(400).json({ message: "이 방은 이미 최대 인원(5명)입니다." });
    }

    // 유저가 이미 다른 방에 참여 중인지 확인
    const [existingUser] = await pool.query(
      "SELECT * FROM liar_game_room_tbl WHERE (hostID = ? OR liarID = ?) AND isActive = 1",
      [userID, userID]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: "이미 다른 방에 참여 중입니다." });
    }

    // playerCount +1
    await pool.query("UPDATE liar_game_room_tbl SET playerCount = playerCount + 1 WHERE roomID = ?", [roomID]);

    res.json({ message: "방에 참가했습니다!", roomID, userID });
  } catch (err) {
    console.error("방 참가 오류:", err);
    res.status(500).json({ message: "방 참가 실패", error: err.message });
  }
};

// 게임 시작 (라이어 자동 배정)
exports.startGame = async (req, res) => {
  try {
    const { roomID } = req.body;

    // 방 정보 가져오기
    const [rooms] = await pool.query("SELECT * FROM liar_game_room_tbl WHERE roomID = ?", [roomID]);
    if (rooms.length === 0) return res.status(404).json({ message: "방을 찾을 수 없습니다." });

    const room = rooms[0];

    // 이미 라이어가 배정된 경우
    if (room.liarID) return res.status(400).json({ message: "이미 라이어가 배정되었습니다." });

    // 현재 방에 있는 유저 목록 가져오기
    const [users] = await pool.query(`
      SELECT userID FROM user_tbl 
      WHERE currentRoom = ? OR userID = ?
    `, [roomID, room.hostID]);

    // 임시 테스트용 (라이어 배정 기능만 확인)
    if (users.length < 1) {
      return res.status(400).json({ message: "유저가 없습니다." });
    }


    //if (users.length < 3) {
    //  return res.status(400).json({ message: "게임을 시작하려면 최소 3명이 필요합니다." });
    //}

    // ✅ 랜덤으로 라이어 선택
    const liarIndex = Math.floor(Math.random() * users.length);
    const liarID = users[liarIndex].userID;

    // liarID 업데이트
    await pool.query("UPDATE liar_game_room_tbl SET liarID = ? WHERE roomID = ?", [liarID, roomID]);

    res.json({ message: "라이어가 배정되었습니다!", liarID });
  } catch (err) {
    console.error("게임 시작 오류:", err);
    res.status(500).json({ message: "게임 시작 실패", error: err.message });
  }
};
