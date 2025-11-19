
const express = require('express');
const router = express.Router();
const { getAllHeritage } = require('../controllers/heritageController');

router.get('/', getAllHeritage);
module.exports = router;
