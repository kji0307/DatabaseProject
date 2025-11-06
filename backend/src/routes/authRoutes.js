const express = require('express');
const router = express.Router();
const { signup, login } = require('../controllers/authController');


// 회원가입
router.post('/signup', signup);


// 로그인
router.post('/login', login);

module.exports = router;
