-- --------------------------------------------------------
-- 호스트:                          127.0.0.1
-- 서버 버전:                        11.4.8-MariaDB - mariadb.org binary distribution
-- 서버 OS:                        Win64
-- HeidiSQL 버전:                  12.11.0.7065
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- heritagedb 데이터베이스 구조 내보내기
CREATE DATABASE IF NOT EXISTS `heritagedb` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `heritagedb`;

-- 테이블 heritagedb.chat_log_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `chat_log_tbl` (
  `chatID` bigint(20) NOT NULL AUTO_INCREMENT,
  `roomID` bigint(20) NOT NULL,
  `userID` bigint(20) NOT NULL,
  `message` varchar(500) NOT NULL,
  `createdAT` datetime NOT NULL,
  PRIMARY KEY (`chatID`),
  KEY `FK_chat_log_tbl_liar_game_room_tbl` (`roomID`),
  KEY `FK_chat_log_tbl_user_tbl` (`userID`),
  CONSTRAINT `FK_chat_log_tbl_liar_game_room_tbl` FOREIGN KEY (`roomID`) REFERENCES `liar_game_room_tbl` (`roomID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_chat_log_tbl_user_tbl` FOREIGN KEY (`userID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.heritage_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `heritage_tbl` (
  `heritageID` bigint(20) NOT NULL AUTO_INCREMENT,
  `heritageName` varchar(100) NOT NULL,
  `heritageCategory` varchar(50) NOT NULL,
  `heritageDesc` text DEFAULT NULL,
  PRIMARY KEY (`heritageID`),
  UNIQUE KEY `heritageName` (`heritageName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.liar_game_result_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `liar_game_result_tbl` (
  `resultID` bigint(20) NOT NULL AUTO_INCREMENT,
  `roomID` bigint(20) NOT NULL,
  `winnerID` bigint(20) DEFAULT NULL,
  `roundsWon` tinyint(4) NOT NULL,
  `totalRounds` tinyint(4) NOT NULL,
  `isLiarWin` tinyint(1) NOT NULL DEFAULT 1,
  `endTime` datetime NOT NULL,
  PRIMARY KEY (`resultID`),
  KEY `FK_liar_game_result_tbl_liar_game_room_tbl` (`roomID`),
  KEY `FK_liar_game_result_tbl_user_tbl` (`winnerID`),
  CONSTRAINT `FK_liar_game_result_tbl_liar_game_room_tbl` FOREIGN KEY (`roomID`) REFERENCES `liar_game_room_tbl` (`roomID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_liar_game_result_tbl_user_tbl` FOREIGN KEY (`winnerID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.liar_game_room_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `liar_game_room_tbl` (
  `roomID` bigint(20) NOT NULL AUTO_INCREMENT,
  `hostID` bigint(20) NOT NULL,
  `liarID` bigint(20) DEFAULT NULL,
  `heritageID` bigint(20) NOT NULL,
  `playerCount` tinyint(3) unsigned zerofill NOT NULL DEFAULT 000,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAT` datetime NOT NULL,
  PRIMARY KEY (`roomID`),
  KEY `FK_liar_game_room_tbl_user_tbl` (`hostID`),
  KEY `FK_liar_game_room_tbl_user_tbl_2` (`liarID`),
  KEY `FK_liar_game_room_tbl_heritage_tbl` (`heritageID`),
  CONSTRAINT `FK_liar_game_room_tbl_heritage_tbl` FOREIGN KEY (`heritageID`) REFERENCES `heritage_tbl` (`heritageID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_liar_game_room_tbl_user_tbl` FOREIGN KEY (`hostID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_liar_game_room_tbl_user_tbl_2` FOREIGN KEY (`liarID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.liar_vote_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `liar_vote_tbl` (
  `voteID` bigint(20) NOT NULL AUTO_INCREMENT,
  `roomID` bigint(20) NOT NULL,
  `voterID` bigint(20) NOT NULL,
  `targetID` bigint(20) NOT NULL,
  `voteTime` datetime NOT NULL,
  PRIMARY KEY (`voteID`),
  UNIQUE KEY `UX_room_voter` (`roomID`,`voterID`),
  KEY `FK_liar_vote_tbl_user_tbl` (`voterID`),
  KEY `FK_liar_vote_tbl_user_tbl_2` (`targetID`),
  CONSTRAINT `FK_liar_vote_tbl_liar_game_room_tbl` FOREIGN KEY (`roomID`) REFERENCES `liar_game_room_tbl` (`roomID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_liar_vote_tbl_user_tbl` FOREIGN KEY (`voterID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_liar_vote_tbl_user_tbl_2` FOREIGN KEY (`targetID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.ranking_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `ranking_tbl` (
  `rankingID` bigint(20) NOT NULL AUTO_INCREMENT,
  `userID` bigint(20) NOT NULL,
  `totalScore` int(11) unsigned zerofill NOT NULL DEFAULT 00000000000,
  `lastPlay` datetime DEFAULT NULL,
  PRIMARY KEY (`rankingID`),
  KEY `FK_rankingtbl_usertbl_2` (`totalScore`),
  KEY `userID` (`userID`),
  CONSTRAINT `FK_ranking_tbl_user_tbl` FOREIGN KEY (`userID`) REFERENCES `user_tbl` (`userID`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_rankingtbl_usertbl_2` FOREIGN KEY (`totalScore`) REFERENCES `user_tbl` (`totalScore`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

-- 테이블 heritagedb.user_tbl 구조 내보내기
CREATE TABLE IF NOT EXISTS `user_tbl` (
  `userID` bigint(20) NOT NULL AUTO_INCREMENT,
  `userName` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `totalScore` int(11) unsigned zerofill NOT NULL DEFAULT 00000000000,
  `currentRoom` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`userID`),
  UNIQUE KEY `userName` (`userName`),
  KEY `totalScore` (`totalScore`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 내보낼 데이터가 선택되어 있지 않습니다.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
