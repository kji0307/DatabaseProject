// backend/src/controllers/gameController.js
// 라이어 게임 백엔드 로직 (DB + 점수 + 랭킹)

const pool = require("../models/db");

// -----------------------
// 방 목록 조회
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
// 방 상세 정보 조회
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

        if (!room) return res.status(404).json({ message: "방이 존재하지 않습니다." });

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
        console.error("방 상세 오류:", err);
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
        const [[user]] = await pool.query(
            `SELECT currentRoom FROM user_tbl WHERE userID = ?`,
            [userID]
        );
        if (!user) return res.status(404).json({ message: "유저가 없습니다." });

        const prevRoom = user.currentRoom;

        if (prevRoom && Number(prevRoom) === Number(roomID)) {
            return res.json({ message: "이미 해당 방에 참여 중입니다." });
        }

        if (prevRoom && Number(prevRoom) !== Number(roomID)) {
            await pool.query(
                `UPDATE liar_game_room_tbl
                 SET playerCount = GREATEST(playerCount - 1, 0)
                 WHERE roomID = ?`,
                [prevRoom]
            );
        }

        await pool.query(
            `UPDATE user_tbl SET currentRoom = ? WHERE userID = ?`,
            [roomID, userID]
        );

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
// 방 나가기 + 호스트 방 삭제
// -----------------------
exports.leaveRoom = async (req, res) => {
    const { roomID, userID } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT hostID FROM liar_game_room_tbl WHERE roomID = ?`,
            [roomID]
        );

        if (!room) {
            return res.status(404).json({ message: "방이 존재하지 않습니다." });
        }

        const isHost = Number(room.hostID) === Number(userID);

        await pool.query(
            `UPDATE user_tbl SET currentRoom = NULL WHERE userID = ?`,
            [userID]
        );

        if (isHost) {
            await pool.query(`UPDATE user_tbl SET currentRoom = NULL WHERE currentRoom = ?`, [roomID]);
            await pool.query(`DELETE FROM liar_score_log WHERE roomID = ?`, [roomID]);
            await pool.query(`DELETE FROM liar_final_vote_tbl WHERE roomID = ?`, [roomID]);
            await pool.query(`DELETE FROM liar_vote_tbl WHERE roomID = ?`, [roomID]);
            await pool.query(`DELETE FROM liar_game_room_tbl WHERE roomID = ?`, [roomID]);

            return res.json({ message: "호스트가 방을 떠나 방이 삭제되었습니다.", roomDeleted: true });
        }

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
// 게임 시작 / 라운드 시작
// -----------------------
exports.startGame = async (req, res) => {
    const { roomID, userID } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT hostID, currentRound, maxRounds 
             FROM liar_game_room_tbl 
             WHERE roomID = ?`,
            [roomID]
        );

        if (!room) return res.status(404).json({ message: "방이 존재하지 않습니다." });

        if (Number(room.hostID) !== Number(userID)) {
            return res.status(403).json({ message: "호스트만 시작할 수 있습니다." });
        }

        if (room.currentRound >= room.maxRounds) {
            return res.status(400).json({ message: "모든 라운드를 이미 진행했습니다." });
        }

        const [players] = await pool.query(
            `SELECT userID FROM user_tbl WHERE currentRoom = ?`,
            [roomID]
        );
        if (players.length < 1) {
            return res.status(400).json({ message: "플레이어가 없습니다." });
        }

        const liar = players[Math.floor(Math.random() * players.length)].userID;

        const [[cate]] = await pool.query(`
            SELECT heritageCategory 
            FROM heritage_tbl 
            ORDER BY RAND() LIMIT 1
        `);
        const category = cate.heritageCategory;

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
            return res.status(500).json({ message: "해당 카테고리에 제시어 부족" });
        }

        const normalWord = words[0];
        const liarWord = words[1];

        const nextRound = room.currentRound + 1;

        await pool.query(
            `
            UPDATE liar_game_room_tbl 
            SET liarID = ?, heritageID = ?, topic = ?, currentRound = ?, 
                gameState = 'explaining', suspectID = NULL
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
        console.error("게임 시작 오류:", err);
        res.status(500).json({ message: "게임 시작 실패" });
    }
};

// -----------------------
// 제시어 조회
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

        if (!room) return res.status(404).json({ message: "방이 존재하지 않습니다." });
        if (!room.heritageID || room.currentRound === 0) {
            return res.status(400).json({ message: "아직 라운드가 시작되지 않았습니다." });
        }

        const [[normalWord]] = await pool.query(
            `SELECT heritageName FROM heritage_tbl WHERE heritageID = ?`,
            [room.heritageID]
        );

        let finalWord = normalWord.heritageName;
        const isLiar = Number(room.liarID) === Number(userID);

        if (isLiar) {
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
            return res.status(400).json({ message: "라운드가 진행 중이 아닙니다." });
        }

        const roundNum = room.currentRound;

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
            return res.status(400).json({ message: "라운드가 진행 중이 아닙니다." });
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

        if (rows.length === 0) {
            let liarName = null;

            if (liarID) {
                await pool.query(
                    `INSERT INTO liar_score_log 
                     (roomID, userID, roundNum, scoreChange, reason)
                     VALUES (?, ?, ?, ?, ?)`,
                    [roomID, liarID, roundNum, 10, "noFirstVoteLiarWin"]
                );

                const [[liarRow]] = await pool.query(
                    `SELECT username FROM user_tbl WHERE userID = ?`,
                    [liarID]
                );
                liarName = liarRow ? liarRow.username : null;
            }

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

        res.json({
            suspectID,
            suspectName: userRow.username,
            votes,
            roundNum
        });
    } catch (err) {
        console.error("1차 투표 결과 오류:", err);
        res.status(500).json({ message: "투표 결과 조회 실패" });
    }
};

// -----------------------
// 최종(2지선다) 투표 저장
// -----------------------
exports.castFinalVote = async (req, res) => {
    const { roomID, userID, choice } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT currentRound, liarID, suspectID 
             FROM liar_game_room_tbl 
             WHERE roomID = ?`,
            [roomID]
        );

        if (!room || room.currentRound === 0 || !room.suspectID) {
            return res.status(400).json({ message: "최종 투표를 진행할 수 없습니다." });
        }

        const roundNum = room.currentRound;
        const suspectID = room.suspectID;
        const normalizedChoice = Number(choice) === 1 ? 1 : 0;

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
// 최종 투표 결과 + 점수 계산
// (요청 반영: 동점이면 모두 우승)
// -----------------------
exports.getFinalVoteResult = async (req, res) => {
    const { roomID } = req.body;

    try {
        const [[room]] = await pool.query(
            `SELECT currentRound, maxRounds, liarID, suspectID
             FROM liar_game_room_tbl
             WHERE roomID = ?`,
            [roomID]
        );

        if (!room || room.currentRound === 0) {
            return res.status(400).json({ message: "라운드가 진행 중이 아닙니다." });
        }
        if (!room.suspectID) {
            return res.status(400).json({ message: "용의자가 지정되지 않았습니다." });
        }

        const roundNum = room.currentRound;
        const suspectID = room.suspectID;
        const liarID = room.liarID;

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

        let majorityChoice = 0;
        if (totalVotes > 0 && liarVoteCount > notLiarVoteCount) {
            majorityChoice = 1;
        }

        const isLiar = Number(suspectID) === Number(liarID);
        let outcome = null;

        if (majorityChoice === 1) {
            if (isLiar) {
                outcome = "liarCaught";

                const [players] = await pool.query(
                    `SELECT userID FROM user_tbl WHERE currentRoom = ?`,
                    [roomID]
                );
                for (const p of players) {
                    if (Number(p.userID) === Number(liarID)) continue;
                    await pool.query(
                        `INSERT INTO liar_score_log 
                         (roomID, userID, roundNum, scoreChange, reason)
                         VALUES (?, ?, ?, ?, ?)`,
                        [roomID, p.userID, roundNum, 5, "liarCaught"]
                    );
                }
            } else {
                outcome = "liarWronglyAccused";

                await pool.query(
                    `INSERT INTO liar_score_log 
                     (roomID, userID, roundNum, scoreChange, reason)
                     VALUES (?, ?, ?, ?, ?)`,
                    [roomID, liarID, roundNum, 10, "liarEscaped"]
                );
            }

            await pool.query(
                `UPDATE liar_game_room_tbl 
                 SET gameState = 'result'
                 WHERE roomID = ?`,
                [roomID]
            );
        } else {
            outcome = "redoDiscussion";

            await pool.query(
                `UPDATE liar_game_room_tbl 
                 SET gameState = 'discussion'
                 WHERE roomID = ?`,
                [roomID]
            );

            return res.json({
                roundNum,
                suspectID,
                liarID,
                isLiar,
                liarVoteCount,
                notLiarVoteCount,
                majorityChoice,
                outcome
            });
        }

        // -----------------------
        // 마지막 라운드 → 우승자 계산 (동점이면 모두 우승)
        // -----------------------
        let winnerInfo = [];

        if (roundNum >= room.maxRounds) {
            const [scoreRows] = await pool.query(
                `
                SELECT userID, SUM(scoreChange) AS totalScore
                FROM liar_score_log
                WHERE roomID = ?
                GROUP BY userID
                ORDER BY totalScore DESC
            `,
                [roomID]
            );

            if (scoreRows.length > 0) {
                const highestScore = scoreRows[0].totalScore;

                const winners = scoreRows.filter(
                    (r) => Number(r.totalScore) === Number(highestScore)
                );

                for (const w of winners) {
                    await pool.query(
                        `UPDATE user_tbl SET score = score + ? WHERE userID = ?`,
                        [w.totalScore, w.userID]
                    );

                    await pool.query(
                        `INSERT INTO ranking_tbl (userID, score)
                         VALUES (?, ?)`,
                        [w.userID, w.totalScore]
                    );

                    winnerInfo.push({
                        winnerID: w.userID,
                        totalScore: w.totalScore
                    });
                }
            }

            await pool.query(
                `UPDATE liar_game_room_tbl
                 SET isActive = 0, gameState = 'finished'
                 WHERE roomID = ?`,
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
        console.error("최종 투표 결과 오류:", err);
        return res.status(500).json({ message: "최종 투표 결과 조회 실패" });
    }
};

// -----------------------
// 누적 점수 랭킹
// -----------------------
exports.getRanking = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT userID, username, score
            FROM user_tbl
            ORDER BY score DESC, userID ASC
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
// 라운드별 점수 조회
// -----------------------
exports.getRoomScores = async (req, res) => {
    const { roomID } = req.params;

    try {
        const [playerRows] = await pool.query(
            `SELECT userID, username FROM user_tbl WHERE currentRoom = ?`,
            [roomID]
        );

        const [logRows] = await pool.query(
            `
            SELECT userID, roundNum, scoreChange
            FROM liar_score_log
            WHERE roomID = ?
            ORDER BY roundNum ASC, userID ASC
        `,
            [roomID]
        );

        const scoresByUser = {};
        let maxRound = 0;

        for (const p of playerRows) {
            scoresByUser[p.userID] = {
                userID: p.userID,
                username: p.username,
                perRound: {},
                total: 0
            };
        }

        for (const row of logRows) {
            const { userID, roundNum, scoreChange } = row;

            if (!scoresByUser[userID]) {
                scoresByUser[userID] = {
                    userID,
                    username: `유저${userID}`,
                    perRound: {},
                    total: 0
                };
            }

            const obj = scoresByUser[userID];
            obj.perRound[roundNum] = (obj.perRound[roundNum] || 0) + scoreChange;
            obj.total += scoreChange;

            if (roundNum > maxRound) maxRound = roundNum;
        }

        const players = Object.values(scoresByUser);

        res.json({ maxRound, players });
    } catch (err) {
        console.error("라운드 점수 조회 오류:", err);
        res.status(500).json({ message: "라운드 점수 조회 실패" });
    }
};
