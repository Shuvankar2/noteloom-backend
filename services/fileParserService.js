const fs = require('fs');
const path = require('path');
const os = require('os');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const officeParser = require('officeparser');
const extractTextFromImage = require('./ocrService');

// Safe PDF loader
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn("⚠️ pdf-parse library not found. PDF fallback will be limited.");
}

const extractTextFromDocx = async (buffer) => {
  try {
    // 1. Try Standard Text Extraction (Mammoth) - Fast
    const result = await mammoth.extractRawText({ buffer: buffer });
    let text = result.value;

    // 2. If text is empty or too short, try OCR (Scanned Doc Mode)
    if (!text || text.trim().length < 50) {
      console.warn("⚠️ DOCX text empty/short. Switching to Image OCR...");
      const ocrText = await extractTextFromScannedDocx(buffer);
      
      // If we found OCR text, use it. Otherwise, keep the original (even if short).
      if (ocrText && ocrText.length > text.length) {
        text = ocrText;
      }
    }
    
    return text;
  } catch (e) {
    console.warn("Standard DOCX parse failed, trying OCR fallback...");
    return await extractTextFromScannedDocx(buffer);
  }
};

const extractTextFromExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0]; 
  let rows = [];
  worksheet.eachRow((row) => {
    const rowText = row.values.filter(val => val).join(', ');
    rows.push(rowText);
  });
  return rows.join('\n');
};

const extractTextFromPptx = async (buffer, originalName) => {
  const tempPath = path.join(os.tmpdir(), `temp-pptx-${Date.now()}-${originalName}`);
  fs.writeFileSync(tempPath, buffer);
  return new Promise((resolve) => {
    officeParser.parseOffice(tempPath, (data, err) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (err) return resolve("Could not extract text from this PowerPoint.");
      resolve(data);
    });
  });
};

const extractTextFromPdf = async (buffer) => {
  try {
    if (!pdfParse) return { text: "PDF parsing library not found.", numpages: 0 };

    const parseFunc = (typeof pdfParse === 'function') ? pdfParse : pdfParse.default;
    const data = await parseFunc(buffer);
    
    // Return object with text AND page count
    return { text: data.text, numpages: data.numpages || 0 };
  } catch (err) {
    console.error("PDF Parse Error:", err.message);
    return { text: "", numpages: 0 };
  }
};

const extractTextFromScannedPdf = async (buffer) => {
  console.log("⚠️ Scanned PDF OCR is disabled in serverless mode.");
  return ""; 
};

const extractTextFromScannedDocx = async (buffer) => {
  try {
    console.log("🔍 Inspecting DOCX for images...");
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    
    const imageEntries = zipEntries.filter(entry => 
      entry.entryName.startsWith('word/media/') &&
      (entry.entryName.endsWith('.png') || entry.entryName.endsWith('.jpeg') || entry.entryName.endsWith('.jpg'))
    );

    if (imageEntries.length === 0) return "";

    // LIMIT CHECK
    if (imageEntries.length > 25) {
       return "LIMIT_EXCEEDED";
    }

    // Sort images
    imageEntries.sort((a, b) => {
      const numA = parseInt(a.entryName.match(/\d+/)) || 0;
      const numB = parseInt(b.entryName.match(/\d+/)) || 0;
      return numA - numB;
    });

    console.log(`🔍 Found ${imageEntries.length} images. Processing...`);
    let fullText = "";

    for (let i = 0; i < imageEntries.length; i++) {
      const imgBuffer = imageEntries[i].getData();
      const text = await extractTextFromImage(imgBuffer);
      if (text.trim().length > 0) {
        fullText += `\n[Page/Image ${i + 1}]:\n${text}`;
      }
    }
    return fullText;

  } catch (err) {
    console.error("DOCX OCR Error:", err);
    return "";
  }
};

module.exports = {
  extractTextFromDocx,
  extractTextFromExcel,
  extractTextFromPptx,
  extractTextFromPdf,
  extractTextFromScannedPdf,
  extractTextFromScannedDocx
};
