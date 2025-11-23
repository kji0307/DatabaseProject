// backend/src/controllers/gameController.js
// 라이어 게임 백엔드 로직 (DB + 점수 + 랭킹)

const pool = require("../models/db");

// -----------------------
// 방 목록
// -----------------------
exports.getRooms = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT r.*, u.username AS hostName
            FROM liar_game_room_tbl r
            JOIN user_tbl u ON r.hostID = u.userID
            WHERE r.isActive = 1
        `);

        res.json(rows);
    } catch (err) {
        console.error("방 목록 오류:", err);
        res.status(500).json({ message: "서버 오류" });
    }
};

// -----------------------
// 방 상세 정보 + 플레이어 목록
// -----------------------
exports.getRoomDetail = async (req, res) => {
    const { roomID } = req.params;

    try {
        const [[room]] = await pool.query(
            `
            SELECT r.*, u.username AS hostName
            FROM liar_game_room_tbl r
            JOIN user_tbl u ON r.hostID = u.userID
            WHERE r.roomID = ?
        `,
            [roomID]
        );

        if (!room) {
            return res.status(404).json({ message: "방이 존재하지 않습니다." });
        }

        const [players] = await pool.query(
            `
            SELECT userID, username, score,
                    CASE WHEN userID = ? THEN 1 ELSE 0 END AS isHost
            FROM user_tbl
            WHERE currentRoom = ?
        `,
            [room.hostID, roomID]
        );


        res.json({ room, players });
    } catch (err) {
        console.error("방 상세 불러오기 오류:", err);
        res.status(500).json({ message: "서버 오류" });
    }
};

// -----------------------
// 방 생성
// -----------------------
exports.createRoom = async (req, res) => {
    const { hostID, roomTitle } = req.body;

    try {
        const sql = `
            INSERT INTO liar_game_room_tbl 
                (hostID, roomTitle, playerCount, isActive, currentRound, maxRounds, gameState, topic, suspectID)
            VALUES (?, ?, 1, 1, 0, 5, 'waiting', NULL, NULL)
        `;

        const [result] = await pool.query(sql, [hostID, roomTitle]);

        // 호스트를 방에 입장 처리
        await pool.query(
            `UPDATE user_tbl SET currentRoom = ? WHERE userID = ?`,
            [result.insertId, hostID]
        );

        res.json({ roomID: result.insertId });
    } catch (err) {
        console.error("방 생성 오류:", err);
        res.status(500).json({ message: "방 생성 실패" });
    }
};

// -----------------------
// 방 참여
// -----------------------
exports.joinRoom = async (req, res) => {
    const { roomID, userID } = req.body;

    try {
        // 현재 유저가 어느 방에 있는지 확인
        const [[user]] = await pool.query(
            `SELECT currentRoom FROM user_tbl WHERE userID = ?`,
            [userID]
        );

        if (!user) {
            return res.status(404).json({ message: "유저가 존재하지 않습니다." });
        }

        const prevRoom = user.currentRoom;

        // 이미 같은 방에 있는 경우
        if (prevRoom && Number(prevRoom) === Number(roomID)) {
            return res.json({ message: "이미 해당 방에 참여 중입니다." });
        }

        // 다른 방에 있었다면 그 방의 playerCount 1 감소
        if (prevRoom && Number(prevRoom) !== Number(roomID)) {
            await pool.query(
                `UPDATE liar_game_room_tbl
                 SET playerCount = GREATEST(playerCount - 1, 0)
                 WHERE roomID = ?`,
                [prevRoom]
            );
        }

        // 새 방으로 이동
        await pool.query(
            `UPDATE user_tbl SET currentRoom = ? WHERE userID = ?`,
            [roomID, userID]
        );

        // 새 방 인원 수 증가
        await pool.query(
            `UPDATE liar_game_room_tbl
             SET playerCount = playerCount + 1
             WHERE roomID = ?`,
            [roomID]
        );

        res.json({ message: "입장 완료" });
    } catch (err) {
        console.error("입장 오류:", err);
        res.status(500).json({ message: "입장 실패" });
    }
};

// -----------------------
// 방 나가기 (호스트면 방 삭제)
// -----------------------
exports.leaveRoom = async (req, res) => {
    const { roomID, userID } = req.body;

    try {
        // 방 정보 조회 (host인지 확인)
        const [[room]] = await pool.query(
            `SELECT hostID, playerCount FROM liar_game_room_tbl WHERE roomID = ?`,
            [roomID]
        );

        if (!room) {
            return res.status(404).json({ message: "방이 존재하지 않습니다." });
        }

        const isHost = Number(room.hostID) === Number(userID);

        // 유저 방 탈출 처리
        await pool.query(
            `UPDATE user_tbl SET currentRoom = NULL WHERE userID = ?`,
            [userID]
        );

        // 호스트가 나간 경우 → 방 및 관련 데이터 삭제
        if (isHost) {
            // 1) 이 방에 있는 모든 유저 currentRoom 초기화
            await pool.query(
                `UPDATE user_tbl SET currentRoom = NULL WHERE currentRoom = ?`,
                [roomID]
            );

            // 2) 이 방과 관련된 투표/최종투표/점수 로그 삭제
            await pool.query(
                `DELETE FROM liar_score_log WHERE roomID = ?`,
                [roomID]
            );
            await pool.query(
                `DELETE FROM liar_final_vote_tbl WHERE roomID = ?`,
                [roomID]
            );
            await pool.query(
                `DELETE FROM liar_vote_tbl WHERE roomID = ?`,
                [roomID]
            );

            // 3) 마지막으로 방 삭제
            await pool.query(
                `DELETE FROM liar_game_room_tbl WHERE roomID = ?`,
                [roomID]
            );

            return res.json({
                message: "호스트가 나가서 방이 삭제되었습니다.",
                roomDeleted: true
            });
        }

        // 일반 유저가 나간 경우 → playerCount 감소 (0 미만 방지)
        await pool.query(
            `UPDATE liar_game_room_tbl 
             SET playerCount = GREATEST(playerCount - 1, 0) 
             WHERE roomID = ?`,
            [roomID]
        );

        res.json({ message: "방에서 나갔습니다.", roomDeleted: false });
    } catch (err) {
        console.error("방 나가기 오류:", err);
        res.status(500).json({ message: "방 나가기 실패" });
    }
};

// -----------------------
// 게임 시작 / 다음 라운드 시작
// -----------------------
exports.startGame = async (req, res) => {
    const { roomID, userID } = req.body;

    try {
        // 방 정보에서 호스트, 현재 라운드 확인
        const [[room]] = await pool.query(
            `SELECT hostID, currentRound, maxRounds 
             FROM liar_game_room_tbl 
             WHERE roomID = ?`,
            [roomID]
        );

        if (!room) {
            return res.status(404).json({ message: "방이 존재하지 않습니다." });
        }

        // 호스트만 시작 가능
        if (Number(room.hostID) !== Number(userID)) {
            return res
                .status(403)
                .json({ message: "호스트만 게임을 시작할 수 있습니다." });
        }

        // maxRounds 초과 방지
        if (room.currentRound >= room.maxRounds) {
            return res.status(400).json({ message: "모든 라운드를 이미 진행했습니다." });
        }

        const [players] = await pool.query(
            `SELECT userID FROM user_tbl WHERE currentRoom = ?`,
            [roomID]
        );

        // 최소 인원 체크 (로컬 개발이라 주석 가능)
        /*
        if (players.length < 3) {
            return res.status(400).json({ message: "게임은 최소 3명 이상일 때 시작할 수 있습니다." });
        }
        */

        if (players.length < 1) {
            return res.status(400).json({ message: "플레이어가 없습니다。" });
        }

        // --------- 라이어 선정 ---------
        const liar = players[Math.floor(Math.random() * players.length)].userID;

        // --------- 랜덤 카테고리 선택 ---------
        const [[cate]] = await pool.query(`
            SELECT heritageCategory 
            FROM heritage_tbl 
            ORDER BY RAND() LIMIT 1
        `);

        const category = cate.heritageCategory;

        // --------- 제시어 2개 뽑기 (같은 카테고리에서) ---------
        const [words] = await pool.query(
            `
            SELECT heritageID, heritageName 
            FROM heritage_tbl 
            WHERE heritageCategory = ?
            ORDER BY RAND() LIMIT 2
        `,
            [category]
        );

        if (words.length < 2) {
            return res.status(500).json({ message: "해당 카테고리에서 제시어를 2개 이상 찾을 수 없습니다." });
        }

        const normalWord = words[0];   // 시민 제시어
        const liarWord = words[1];     // 라이어 제시어

        // --------- 라운드 증가 / 방 정보 저장 ---------
        const nextRound = room.currentRound + 1;

        await pool.query(
            `
            UPDATE liar_game_room_tbl 
            SET liarID = ?, heritageID = ?, topic = ?, currentRound = ?, gameState = 'explaining', suspectID = NULL
            WHERE roomID = ?
        `,
            [liar, normalWord.heritageID, category, nextRound, roomID]
        );

        res.json({
            liarID: liar,
            category,
            normalWord,
            liarWord,
            currentRound: nextRound,
            maxRounds: room.maxRounds
        });
    } catch (err) {
        console.error("게임 시작/라운드 시작 오류:", err);
        res.status(500).json({ message: "게임 시작 실패" });
    }
};

// -----------------------
// 제시어 받기
// -----------------------
exports.getRoundInfo = async (req, res) => {
    const { roomID, userID } = req.params;

    try {
        const [[room]] = await pool.query(
            `
            SELECT liarID, heritageID, topic, currentRound, maxRounds, gameState
            FROM liar_game_room_tbl 
            WHERE roomID = ?
        `,
            [roomID]
        );

        if (!room) {
            return res.status(404).json({ message: "방이 존재하지 않습니다." });
        }

        // 아직 라운드가 시작되지 않은 경우
        if (!room.heritageID || room.currentRound === 0) {
            return res.status(400).json({ message: "아직 라운드가 시작되지 않았습니다." });
        }

        const [[normalWord]] = await pool.query(
            `
            SELECT heritageName 
            FROM heritage_tbl 
            WHERE heritageID = ?
        `,
            [room.heritageID]
        );

        let finalWord = normalWord.heritageName;
        const isLiar = Number(room.liarID) === Number(userID);

        if (isLiar) {
            // 라이어 제시어: 같은 카테고리에서 다른 제시어
            const [[fake]] = await pool.query(
                `
                SELECT heritageName 
                FROM heritage_tbl 
                WHERE heritageCategory = ?
                AND heritageID != ?
                ORDER BY RAND() LIMIT 1
            `,
                [room.topic, room.heritageID]
            );

            finalWord = fake.heritageName;
        }

        res.json({
            isLiar,
            topic: room.topic,
            word: finalWord,
            currentRound: room.currentRound,
            maxRounds: room.maxRounds,
            gameState: room.gameState
        });
    } catch (err) {
        console.error("제시어 오류:", err);
        res.status(500).json({ message: "제시어 불러오기 실패" });
    }
};

// -----------------------
// 1차 투표 저장
// -----------------------
exports.castVote = async (req, res) => {
    const { roomID, userID, targetID } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT currentRound FROM liar_game_room_tbl WHERE roomID = ?`,
            [roomID]
        );

        if (!room || room.currentRound === 0) {
            return res.status(400).json({ message: "진행 중인 라운드가 없습니다." });
        }

        const roundNum = room.currentRound;

        // 개발 단계에서는 자기 자신에게 투표도 허용 (실서비스에서는 막기)
        // if (Number(userID) === Number(targetID)) {
        //     return res.status(400).json({ message: "자기 자신에게는 투표할 수 없습니다." });
        // }

        // 같은 라운드에 같은 사람이 여러 번 투표하면 마지막 것만 남기기
        await pool.query(
            `DELETE FROM liar_vote_tbl
             WHERE roomID = ? AND roundNum = ? AND voterID = ?`,
            [roomID, roundNum, userID]
        );

        await pool.query(
            `INSERT INTO liar_vote_tbl (roomID, roundNum, voterID, targetID)
             VALUES (?, ?, ?, ?)`,
            [roomID, roundNum, userID, targetID]
        );

        res.json({ message: "투표 완료", roundNum });
    } catch (err) {
        console.error("투표 저장 오류:", err);
        res.status(500).json({ message: "투표 저장 실패" });
    }
};

// -----------------------
// 1차 투표 결과 → 용의자 선정
// -----------------------
exports.getVoteResult = async (req, res) => {
    const { roomID } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT currentRound, liarID FROM liar_game_room_tbl WHERE roomID = ?`,
            [roomID]
        );

        if (!room || room.currentRound === 0) {
            return res.status(400).json({ message: "진행 중인 라운드가 없습니다." });
        }

        const roundNum = room.currentRound;
        const liarID = room.liarID;

        const [rows] = await pool.query(
            `
            SELECT targetID, COUNT(*) AS voteCount
            FROM liar_vote_tbl
            WHERE roomID = ? AND roundNum = ?
            GROUP BY targetID
            ORDER BY voteCount DESC, targetID ASC
        `,
            [roomID, roundNum]
        );

        // ✅ 아무도 투표 안 한 경우 → 라이어가 이 라운드를 승리
        if (rows.length === 0) {
            let liarName = null;

            if (liarID) {
                // 라이어에게 라운드 승리 점수 +10 (기존 liarEscaped와 동일하게 맞춰도 됨)
                await pool.query(
                    `INSERT INTO liar_score_log (roomID, userID, roundNum, scoreChange, reason)
                     VALUES (?, ?, ?, ?, ?)`,
                    [roomID, liarID, roundNum, 10, "noFirstVoteLiarWin"]
                );

                const [[liarRow]] = await pool.query(
                    `SELECT username FROM user_tbl WHERE userID = ?`,
                    [liarID]
                );
                liarName = liarRow ? liarRow.username : null;
            }

            // 방 상태는 결과 단계로
            await pool.query(
                `UPDATE liar_game_room_tbl
                 SET gameState = 'result'
                 WHERE roomID = ?`,
                [roomID]
            );

            return res.json({
                roundNum,
                outcome: "noFirstVoteLiarWin",
                liarID,
                liarName
            });
        }

        // ✅ 투표가 있는 일반적인 경우 (기존 로직 유지)
        const suspectID = rows[0].targetID;
        const votes = rows[0].voteCount;

        await pool.query(
            `UPDATE liar_game_room_tbl 
             SET suspectID = ?, gameState = 'defense'
             WHERE roomID = ?`,
            [suspectID, roomID]
        );

        const [[userRow]] = await pool.query(
            `SELECT username FROM user_tbl WHERE userID = ?`,
            [suspectID]
        );

        const suspectName = userRow ? userRow.username : null;

        res.json({
            suspectID,
            suspectName,
            votes,
            roundNum
        });
    } catch (err) {
        console.error("투표 결과 조회 오류:", err);
        res.status(500).json({ message: "투표 결과 조회 실패" });
    }
};



// -----------------------
// 최종(2지선다) 투표 저장
// -----------------------
exports.castFinalVote = async (req, res) => {
    const { roomID, userID, choice } = req.body; // choice: 1=라이어다, 0=아니다

    try {
        const [[room]] = await pool.query(
            `SELECT currentRound, liarID, suspectID 
             FROM liar_game_room_tbl 
             WHERE roomID = ?`,
            [roomID]
        );

        if (!room || room.currentRound === 0 || !room.suspectID) {
            return res.status(400).json({ message: "최종 투표를 진행할 수 있는 상태가 아닙니다." });
        }

        const roundNum = room.currentRound;
        const suspectID = room.suspectID;
        const normalizedChoice = Number(choice) === 1 ? 1 : 0;

        // 같은 라운드에 같은 사람의 최종 투표는 한 번만 (마지막 것 유지)
        await pool.query(
            `DELETE FROM liar_final_vote_tbl
             WHERE roomID = ? AND roundNum = ? AND voterID = ?`,
            [roomID, roundNum, userID]
        );

        await pool.query(
            `INSERT INTO liar_final_vote_tbl (roomID, roundNum, voterID, suspectID, choice)
             VALUES (?, ?, ?, ?, ?)`,
            [roomID, roundNum, userID, suspectID, normalizedChoice]
        );

        // 상태는 finalVote로
        await pool.query(
            `UPDATE liar_game_room_tbl 
             SET gameState = 'finalVote'
             WHERE roomID = ?`,
            [roomID]
        );

        res.json({ message: "최종 투표 완료", roundNum });
    } catch (err) {
        console.error("최종 투표 저장 오류:", err);
        res.status(500).json({ message: "최종 투표 저장 실패" });
    }
};

// -----------------------
// 최종(2지선다) 투표 결과 + 점수 계산 + (마지막 라운드면 랭킹 반영)
// -----------------------
exports.getFinalVoteResult = async (req, res) => {
    const { roomID } = req.body;

    try {
        // 방 정보 + 라운드/라이어/용의자 정보 먼저 로드
        const [[room]] = await pool.query(
            `
            SELECT currentRound, maxRounds, liarID, suspectID
            FROM liar_game_room_tbl
            WHERE roomID = ?
        `,
            [roomID]
        );

        if (!room || room.currentRound === 0) {
            return res.status(400).json({ message: "진행 중인 라운드가 없습니다." });
        }
        if (!room.suspectID) {
            return res.status(400).json({ message: "용의자가 지정되지 않았습니다." });
        }

        const roundNum = room.currentRound;
        const suspectID = room.suspectID;
        const liarID = room.liarID;

        // 최종 투표 집계
        const [rows] = await pool.query(
            `
            SELECT 
                SUM(choice = 1) AS liarVoteCount,
                SUM(choice = 0) AS notLiarVoteCount,
                COUNT(*) AS totalVotes
            FROM liar_final_vote_tbl
            WHERE roomID = ? AND roundNum = ?
        `,
            [roomID, roundNum]
        );

        const liarVoteCount = Number(rows[0]?.liarVoteCount) || 0;
        const notLiarVoteCount = Number(rows[0]?.notLiarVoteCount) || 0;
        const totalVotes = liarVoteCount + notLiarVoteCount;

        const isLiar = Number(suspectID) === Number(liarID);

        let majorityChoice = null; // 1=라이어다, 0=아니다
        let outcome = null;
        let winnerInfo = null;

        // 🔹 아무도 최종 투표 안 한 경우 → 라이어 자동 승리
        if (totalVotes === 0) {
            outcome = "noFinalVoteLiarWin";

            if (liarID) {
                await pool.query(
                    `INSERT INTO liar_score_log (roomID, userID, roundNum, scoreChange, reason)
                     VALUES (?, ?, ?, ?, ?)`,
                    [roomID, liarID, roundNum, 10, "noFinalVoteLiarWin"]
                );
            }

            await pool.query(
                `UPDATE liar_game_room_tbl 
                 SET gameState = 'result'
                 WHERE roomID = ?`,
                [roomID]
            );
        } else {
            // 🔹 투표는 있는 경우 → 다수결
            if (liarVoteCount > notLiarVoteCount) {
                majorityChoice = 1;
            } else if (liarVoteCount < notLiarVoteCount) {
                majorityChoice = 0;
            } else {
                majorityChoice = 0; // 동점 → 아니다
            }

            if (majorityChoice === 1) {
                // 라이어다 (라고 판단)
                if (isLiar) {
                    outcome = "liarCaught";

                    // 라이어 맞춤 → 라이어 제외 전원 +5점
                    const [players] = await pool.query(
                        `SELECT userID FROM user_tbl WHERE currentRoom = ?`,
                        [roomID]
                    );
                    for (const p of players) {
                        if (Number(p.userID) === Number(liarID)) continue;
                        await pool.query(
                            `INSERT INTO liar_score_log (roomID, userID, roundNum, scoreChange, reason)
                             VALUES (?, ?, ?, ?, ?)`,
                            [roomID, p.userID, roundNum, 5, "liarCaught"]
                        );
                    }
                } else {
                    // 시민 오판 → 라이어 +10점
                    outcome = "liarEscaped";
                    if (liarID) {
                        await pool.query(
                            `INSERT INTO liar_score_log (roomID, userID, roundNum, scoreChange, reason)
                             VALUES (?, ?, ?, ?, ?)`,
                            [roomID, liarID, roundNum, 10, "liarEscaped"]
                        );
                    }
                }

                await pool.query(
                    `UPDATE liar_game_room_tbl 
                     SET gameState = 'result'
                     WHERE roomID = ?`,
                    [roomID]
                );
            } else {
                // "라이어가 아니다"가 우세 → 재토론
                outcome = "redoDiscussion";
                await pool.query(
                    `UPDATE liar_game_room_tbl 
                     SET gameState = 'discussion'
                     WHERE roomID = ?`,
                    [roomID]
                );
            }
        }

        // 🔹 마지막 라운드라면 우승자/랭킹 처리
        if (outcome !== "redoDiscussion" && roundNum >= room.maxRounds) {
            const [scoreRows] = await pool.query(
                `
                SELECT userID, SUM(scoreChange) AS totalScore
                FROM liar_score_log
                WHERE roomID = ?
                GROUP BY userID
                ORDER BY totalScore DESC
                LIMIT 1
            `,
                [roomID]
            );

            if (scoreRows.length > 0) {
                const winnerID = scoreRows[0].userID;
                const totalScore = Number(scoreRows[0].totalScore) || 0;

                await pool.query(
                    `UPDATE user_tbl 
                     SET score = score + ?
                     WHERE userID = ?`,
                    [totalScore, winnerID]
                );

                await pool.query(
                    `INSERT INTO ranking_tbl (userID, score)
                     VALUES (?, ?)`,
                    [winnerID, totalScore]
                );

                const [[winnerUser]] = await pool.query(
                    `SELECT username FROM user_tbl WHERE userID = ?`,
                    [winnerID]
                );

                winnerInfo = {
                    winnerID,
                    winnerName: winnerUser ? winnerUser.username : null,
                    totalScore
                };
            }

            await pool.query(
                `UPDATE liar_game_room_tbl
                 SET gameState = 'finished'
                     isActive = 0
                 WHERE roomID = ?`,
                [roomID]
            );
            await pool.query(
                `DELETE FROM liar_game_room_tbl WHERE roomID = ?`,
                [roomID]
            );
        }

        const [[suspectRow]] = await pool.query(
            `SELECT username FROM user_tbl WHERE userID = ?`,
            [suspectID]
        );
        const suspectName = suspectRow ? suspectRow.username : null;

        return res.json({
            roundNum,
            suspectID,
            suspectName,
            liarID,
            isLiar,
            liarVoteCount,
            notLiarVoteCount,
            majorityChoice,
            outcome,
            winnerInfo
        });
    } catch (err) {
        console.error("최종 투표 결과 조회 오류:", err);
        res.status(500).json({ message: "최종 투표 결과 조회 실패" });
    }
};


// -----------------------
// 누적 점수 기반 랭킹
// -----------------------
exports.getRanking = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT u.userID, u.username, u.score
            FROM user_tbl u
            ORDER BY u.score DESC, u.userID ASC
            LIMIT 50
        `
        );

        res.json({ ranking: rows });
    } catch (err) {
        console.error("랭킹 조회 오류:", err);
        res.status(500).json({ message: "랭킹 조회 실패" });
    }
};

// -----------------------
// 방별 라운드 점수 조회
// -----------------------
exports.getRoomScores = async (req, res) => {
    const { roomID } = req.params;

    try {
        // 현재 방에 있는 플레이어 목록 (점수 로그가 없어도 0점으로 보이게 하기 위함)
        const [playerRows] = await pool.query(
            `SELECT userID, username 
             FROM user_tbl 
             WHERE currentRoom = ?`,
            [roomID]
        );

        // 라운드별 점수 로그
        const [logRows] = await pool.query(
            `SELECT userID, roundNum, scoreChange
             FROM liar_score_log
             WHERE roomID = ?
             ORDER BY roundNum ASC, userID ASC`,
            [roomID]
        );

        const scoresByUser = {};
        let maxRound = 0;

        // 플레이어 기본 구조 세팅 (모두 0점으로 시작)
        for (const p of playerRows) {
            scoresByUser[p.userID] = {
                userID: p.userID,
                username: p.username,
                perRound: {},   // { 1: +10, 2: -5, ... }
                total: 0
            };
        }

        // 로그를 돌면서 라운드별/총합 점수 누적
        for (const row of logRows) {
            const { userID, roundNum, scoreChange } = row;

            if (!scoresByUser[userID]) {
                // 혹시 currentRoom에는 없지만 로그에만 있는 유저가 있을 경우 대비
                scoresByUser[userID] = {
                    userID,
                    username: `유저${userID}`,
                    perRound: {},
                    total: 0
                };
            }

            const userObj = scoresByUser[userID];
            userObj.perRound[roundNum] = (userObj.perRound[roundNum] || 0) + scoreChange;
            userObj.total += scoreChange;

            if (roundNum > maxRound) maxRound = roundNum;
        }

        const players = Object.values(scoresByUser);

        res.json({
            maxRound,
            players,
        });
    } catch (err) {
        console.error("라운드 점수 조회 오류:", err);
        res.status(500).json({ message: "라운드 점수 조회 실패" });
    }
};
