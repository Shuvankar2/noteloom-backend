// backend/LocalOCR.js
const Tesseract = require('tesseract.js'); 

/**
 * Local Optical Character Recognition (OCR) Module
 * * This module uses Tesseract.js to extract text from images locally.
 * It is used as a fallback mechanism when the main cloud AI (Gemini) 
 * fails to process an image.
 */

const extractTextFromImage = async (buffer) => {
  try {
    // Tesseract.recognize accepts a buffer directly in Node.js
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: m => {} // Silence progress logs to keep console clean
    });
    return text;
  } catch (err) {
    console.error("LocalOCR Error:", err);
    return "";
  }
};

module.exports = extractTextFromImage;