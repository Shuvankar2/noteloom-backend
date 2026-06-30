const express = require('express');
const router = express.Router();
const multer = require('multer');
const aiController = require('../controllers/aiController');

// Multer Memory Storage Configuration for Summarization File Uploads
const aiStorage = multer.memoryStorage();
const aiUpload = multer({ 
  storage: aiStorage, 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

router.post('/chat', aiController.chat);
router.post('/summarize-file', aiUpload.single('file'), aiController.summarizeFile);
router.post('/transcribe-video', aiController.transcribeVideo);

module.exports = router;