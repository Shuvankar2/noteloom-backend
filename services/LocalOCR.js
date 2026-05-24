// backend/LocalOCR.js
const Tesseract = require('tesseract.js'); 
const os = require('os');

/**
 * Local Optical Character Recognition (OCR) Module
 * * This module uses Tesseract.js to extract text from images locally.
 * It is used as a fallback mechanism when the main cloud AI (Gemini) 
 * fails to process an image.
 */

const extractTextFromImage = async (buffer) => {
  try {
    // 🟢 NEW: Tell Tesseract to use Vercel's temp folder for downloading/caching language data
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: m => {}, // Silence progress logs to keep console clean
      // This single line prevents the EROFS crash on Vercel
      cachePath: os.tmpdir() 
    });
    return text;
  } catch (err) {
    console.error("LocalOCR Error:", err);
    return "";
  }
};

module.exports = extractTextFromImage;