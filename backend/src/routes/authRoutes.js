const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// 회원가입
router.post('/register', register);

// 로그인
router.post('/login', login);

module.exports = router;
