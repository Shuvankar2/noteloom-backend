const Tesseract = require('tesseract.js'); 
const os = require('os');

const extractTextFromImage = async (buffer) => {
  try {
    // Tell Tesseract to use Vercel's temp folder for downloading/caching language data
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: m => {}, // Silence progress logs to keep console clean
      // This single line prevents the EROFS crash on Vercel
      cachePath: os.tmpdir() 
    });
    return text;
  } catch (err) {
    console.error("OCR Service Error:", err);
    return "";
  }
};

module.exports = extractTextFromImage;
