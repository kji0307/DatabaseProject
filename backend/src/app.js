require('dotenv').config();
require('./models/db');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const heritageRoutes = require('./routes/heritageRoutes');
const gameRoutes = require('./routes/gameRoutes');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// 라우터
app.use('/api/auth', authRoutes);
app.use('/api/heritage', heritageRoutes);
app.use('/api/game', gameRoutes);

// 기본 라우트
app.get('/', (req, res) => {
  res.send('🎭 Gyeongju Liar Game API — running');
});

// 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
