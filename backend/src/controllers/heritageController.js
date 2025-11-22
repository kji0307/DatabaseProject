// backend/src/controllers/heritageController.js
const pool = require('../models/db');

// 전체 문화재 목록
exports.getAllHeritage = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM heritage_tbl');
    res.json(rows);
  } catch (err) {
    console.error('문화재 조회 오류:', err);
    res.status(500).json({ message: '문화재 조회 실패' });
  }
};

// 특정 ID로 문화재 한 건 조회
exports.getHeritageById = async (req, res) => {
  const { id } = req.params;

  try {
    const [[row]] = await pool.query(
      'SELECT * FROM heritage_tbl WHERE heritageID = ?',
      [id]
    );

    if (!row) {
      return res.status(404).json({ message: '해당 문화재를 찾을 수 없습니다.' });
    }

    res.json(row);
  } catch (err) {
    console.error('문화재 상세 조회 오류:', err);
    res.status(500).json({ message: '문화재 상세 조회 실패' });
  }
};
