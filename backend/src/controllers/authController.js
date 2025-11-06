const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 임시 메모리 DB (진짜 DB 붙기 전까지만 사용)
let users = [];

// 회원가입
exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 중복 사용자 확인
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ message: "이미 존재하는 사용자입니다." });
    }

    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: users.length + 1, username, password: hashedPassword };
    users.push(newUser);

    res.status(201).json({
      message: "회원가입 성공",
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (err) {
    res.status(500).json({ message: "회원가입 중 오류 발생", error: err.message });
  }
};

// 로그인
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);

    if (!user) return res.status(400).json({ message: "존재하지 않는 사용자입니다." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });

    // JWT 발급
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
    );

    // ✅ 수정된 응답 (프론트에서 user/token 둘 다 받도록)
    res.json({
      message: "로그인 성공",
      user: { id: user.id, username: user.username },
      token: token
    });
  } catch (err) {
    res.status(500).json({ message: "로그인 중 오류 발생", error: err.message });
  }
};
