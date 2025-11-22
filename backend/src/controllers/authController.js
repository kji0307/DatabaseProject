// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../models/db");

// ✅ 회원가입 (register → signup)
exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "아이디와 비밀번호를 모두 입력해주세요." });
    }

    // 중복 검사 (DB 컬럼: username)
    const [existing] = await pool.query(
      "SELECT * FROM user_tbl WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res
        .status(400)
        .json({ message: "이미 존재하는 사용자입니다." });
    }

    // 비밀번호 암호화 후 DB 삽입 (컬럼: username, password)
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO user_tbl (username, password) VALUES (?, ?)",
      [username, hashed]
    );

    res.status(201).json({
      message: "회원가입 성공",
      user: { username },
    });
  } catch (err) {
    console.error("회원가입 오류:", err);
    res.status(500).json({ message: "회원가입 중 오류 발생" });
  }
};

// ✅ 로그인
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "아이디와 비밀번호를 모두 입력해주세요." });
    }

    // DB 컬럼: username
    const [rows] = await pool.query(
      "SELECT * FROM user_tbl WHERE username = ?",
      [username]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "존재하지 않는 사용자입니다." });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "비밀번호가 일치하지 않습니다." });
    }

    // 토큰 payload에도 username 넣기
    const token = jwt.sign(
      { id: user.userID, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 프론트에서 data.user.username 으로 쓰고 있으므로 이 구조 유지
    res.json({
      message: "로그인 성공",
      token,
      user: {
        id: user.userID,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("로그인 오류:", err);
    res.status(500).json({ message: "로그인 중 오류 발생" });
  }
};
