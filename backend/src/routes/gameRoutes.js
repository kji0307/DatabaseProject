const express = require('express');
const router = express.Router();
const { createRoom, joinRoom, startGame } = require('../controllers/gameController');

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.post('/start', startGame);

module.exports = router;
