const fs = require('fs');
const path = require('path');
const os = require('os');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const officeParser = require('officeparser');
const axios = require('axios');
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
  try {
    const base64Data = buffer.toString('base64');
    const base64Image = `data:application/pdf;base64,${base64Data}`;
    
    const params = new URLSearchParams();
    params.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    params.append('language', 'eng');
    params.append('filetype', 'PDF');
    params.append('base64image', base64Image);

    console.log("☁️ Attempting Cloud OCR Space PDF text extraction...");
    const response = await axios.post('https://api.ocr.space/parse/image', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.ParsedResults && Array.isArray(response.data.ParsedResults)) {
      const texts = response.data.ParsedResults.map(result => result.ParsedText).filter(Boolean);
      const fullText = texts.join('\n');
      console.log(`✅ Cloud OCR successfully parsed ${texts.length} PDF pages.`);
      return fullText;
    } else {
      console.warn("⚠️ OCR Space returned no parsed results:", response.data);
      return "";
    }
  } catch (err) {
    console.error("Cloud OCR Space PDF Error:", err.message);
    return "";
  }
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
