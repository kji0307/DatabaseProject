
const pool = require('../models/db');

exports.getAllHeritage = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM heritage_tbl');
    res.json(rows);
  } catch (err) {
    console.error('문화재 조회 오류:', err);
    res.status(500).json({ message: '문화재 조회 실패' });
  }
};
