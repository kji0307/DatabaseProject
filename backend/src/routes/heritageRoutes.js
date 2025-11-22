const express = require('express');
const router = express.Router();
const {
  getAllHeritage,
  getHeritageById,
} = require('../controllers/heritageController');

// 목록
router.get('/', getAllHeritage);

// 상세
router.get('/:id', getHeritageById);

module.exports = router;
