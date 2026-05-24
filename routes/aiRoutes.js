// backend/aiRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios'); // 🟢 NEW: Added for downloading Cloudinary videos

const fs = require('fs');       // For temp files
const path = require('path');   // For file paths
const os = require('os');       // To find temp folder

const sharp = require('sharp'); // 🟢 NEW: Image Resizer

// ✅ SAFE TEMP DIR (Vercel Fix)
// Vercel only allows writing to the OS temp directory
const SAFE_TEMP_DIR = os.tmpdir();


// --- FILE PARSERS ---
const mammoth = require('mammoth');           // For Word Docs
const AdmZip = require('adm-zip');               // For ZIP handling
const ExcelJS = require('exceljs');           // For Excel
const officeParser = require('officeparser'); // For PowerPoint

// const pdfPoppler = require('pdf-poppler'); 
// 🟢 NEW: Import the LocalOCR module
const extractTextFromImage = require('../services/LocalOCR');

// ✅ FIX: Robust PDF Loader (Prevents "pdfParse is not a function" & "not defined" errors)
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn("⚠️ pdf-parse library not found. PDF fallback will be limited.");
}

// 🟢 NEW: Add these for Audio Extraction local video to audio
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
// Explicitly set the path for Windows compatibility
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// --- AI & MEDIA LIBRARIES ---
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
require('dotenv').config(); 

// --- CONFIGURATION ---

// 1. Google Gemini Setup
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) console.error("❌ GEMINI_API_KEY is missing in .env!");

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// ✅ USER SETTING: Keeping 2.5 Flash Lite
const MODEL_NAME = "gemini-2.5-flash-lite"; 
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// 2. Cloudflare AI Setup (Fallback)
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// 3. Local Video Path
const VIDEO_DIRECTORY = path.join(__dirname, '../../webdata/uploads/classrooms');

// 4. Memory Storage for Uploads
const aiStorage = multer.memoryStorage();
const aiUpload = multer({ 
  storage: aiStorage, 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// --- HELPER: AUDIO EXTRACTOR (Fixed for Windows) ---
const convertVideoToAudio = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(path.resolve(inputPath))
      .outputOptions([
        '-vn',
        '-acodec pcm_s16le',
        '-ar 16000',
        '-ac 1'
      ])
      .format('wav')
      .on('end', resolve)
      .on('error', (err) => {
        console.error("FFmpeg Error details:", err);
        reject(err);
      })
      .save(path.resolve(outputPath));
  });
};



// --- HELPER: CLOUDFLARE AUDIO (Binary Upload) ---
const runCloudflareAudio = async (modelName, buffer) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("Cloudflare credentials missing.");
  
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelName}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/octet-stream",
      },
      body: buffer
    }
  );
  const result = await response.json();
  if (!result.success) throw new Error("Cloudflare Audio Failed: " + JSON.stringify(result.errors));
  return result.result.text;
};

// --- HELPER: RETRY LOGIC (GEMINI) ---
const generateWithRetry = async (promptParts, retries = 3) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await model.generateContent(promptParts);
    } catch (error) {
      if (error.status === 429 || error.status === 503) {
        attempt++;
        console.warn(`⚠️ API Busy. Retrying (${attempt}/${retries})...`);
        // ✅ USER SETTING: Keeping 4s delay
        await new Promise(res => setTimeout(res, 4000));
      } else {
        throw error; 
      }
    }
  }
  throw new Error("Rate limit exceeded.");
};

// --- HELPER: CLOUDFLARE RUNNER (FALLBACK) ---
const runCloudflare = async (modelName, input) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error("Cloudflare credentials missing.");
  
  console.log(`⚡ Switching to Alternative AI (Cloudflare: ${modelName})...`);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelName}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  const result = await response.json();
  if (!result.success) throw new Error("Alternative AI Failed: " + JSON.stringify(result.errors));
  return result.result.response;
};

// --- HELPER: FILE EXTRACTORS ---

// 🟢 NEW: Sanitize Mermaid Code (Fixes common AI syntax errors)
const cleanMermaidCode = (rawCode) => {
  if (!rawCode) return "";

  let clean = rawCode;

  // 1. Remove Markdown code blocks (if AI wraps it in ```mermaid ... ```)
  clean = clean.replace(/```mermaid/g, '').replace(/```/g, '');

  // 2. Fix Invalid Arrow Labels (The specific error you are seeing)
  // Replaces "-->|Text|>" with "-->|Text|"
  clean = clean.replace(/\|>/g, '|');

  // 3. Fix potential "filled" arrow ends that break labels
  // Sometimes AI writes "--> |Text| >"
  clean = clean.replace(/\| >/g, '|');

  // 4. Ensure graph direction is valid (Standardize to TD or LR)
  if (!clean.includes('graph ') && !clean.includes('flowchart ')) {
    clean = 'graph TD\n' + clean;
  }

  return clean.trim();
};

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

// ✅ FIX: Robust PDF Extraction (Returns Text + Page Count)
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

// 🟢 NEW: Helper to OCR Scanned PDFs (Checks 25 Page Limit)
// const extractTextFromScannedPdf = async (buffer) => {
//   let tempPdfPath = null;
//   try {
//     console.log("🔍 Converting PDF pages to images for OCR...");
//     tempPdfPath = path.join(SAFE_TEMP_DIR, `temp-ocr-${Date.now()}.pdf`);
//     fs.writeFileSync(tempPdfPath, buffer);

//     const isWindows = os.platform() === 'win32';
//     const opts = {
//       format: 'png',
//       out_dir: SAFE_TEMP_DIR,
//       out_prefix: `ocr-page-${Date.now()}`,
//       page: null, 
//       bin_path: isWindows ? path.join(__dirname, 'poppler-bin') : undefined
//     };

//     await pdfPoppler.convert(tempPdfPath, opts);

//     const allFiles = fs.readdirSync(SAFE_TEMP_DIR);
//     const generatedImages = allFiles
//       .filter(f => f.startsWith(opts.out_prefix) && f.endsWith('.png'))
//       .map(f => path.join(SAFE_TEMP_DIR, f))
//       .sort();

//     // 🛑 LIMIT CHECK: If more than 25 pages, stop immediately
//     if (generatedImages.length > 25) {
//       // Cleanup and return special flag
//       generatedImages.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
//       return "LIMIT_EXCEEDED"; 
//     }

//     console.log(`🔍 OCR Processing ${generatedImages.length} pages...`);
//     let fullText = "";

//     for (let i = 0; i < generatedImages.length; i++) {
//       const imgBuffer = fs.readFileSync(generatedImages[i]);
//       const text = await extractTextFromImage(imgBuffer);
//       fullText += `\n--- Page ${i + 1} ---\n${text}`;
//     }

//     generatedImages.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
//     return fullText;

//   } catch (err) {
//     console.error("PDF OCR Error:", err);
//     return "";
//   } finally {
//     if (tempPdfPath && fs.existsSync(tempPdfPath)) try { fs.unlinkSync(tempPdfPath); } catch (e) {}
//   }
// };

// 🟢 UPDATED: Temporarily disabled for Vercel to prevent Linux crashes
const extractTextFromScannedPdf = async (buffer) => {
  console.log("⚠️ Scanned PDF OCR is disabled in serverless mode.");
  
  // Returning an empty string safely triggers your existing fallback message
  // so the frontend knows the text couldn't be read.
  return ""; 
};

// 🟢 NEW: Helper to OCR Scanned Word Docs (Checks 25 Image Limit)
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

    // 🛑 LIMIT CHECK
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


// --- ROUTES ---

// ==========================================
// 1. Chat Endpoint (Updated for Frontend Rendering)
// ==========================================
router.post('/chat', async (req, res) => {
  const { message, context, mode } = req.body; 
  const userName = context?.userName || 'Buddy'; 
  const currentClass = context?.classroomName || 'Dashboard';

  let systemInstruction = "";

  if (mode === 'tutor') {
    systemInstruction = `
      You are a Socratic Tutor. User: ${userName}. Context: ${currentClass}.
      Rules: 1. DO NOT give the answer directly. 2. Ask guiding questions. 3. Be patient.
    `;
  } else if (mode === 'mindmap') {
    systemInstruction = `
      You are a Mind Map Generator. Topic: "${message}".
      Rules: 
      1. Create a Mermaid.js flowchart (graph TD).
      2. Return ONLY the code inside a markdown block.
      3. No conversational text.
      4. Ensure arrows are simple: A -->|Label| B
      Example:
      \`\`\`mermaid
      graph TD
        A["Topic"] -->|Label| B["Subtopic"]
      \`\`\`
    `;
  } else {
    systemInstruction = `You are Noteloom Ai, a friendly study buddy. User: ${userName}.`;
  }

  let finalReply = "";

  try {
    // --- STRATEGY A: GEMINI ---
    const prompt = `${systemInstruction}\n\nUser Message: "${message}"`;
    const result = await generateWithRetry(prompt);
    finalReply = result.response.text();

  } catch (error) {
    console.warn("⚠️ Gemini Error/Busy. Switching to Cloudflare Fallback...");
    
    // --- STRATEGY B: CLOUDFLARE ---
    try {
      // 🟢 Fix: 'input' is defined specifically for this fallback scope
      const input = {
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message }
        ]
      };
      
      // We get the raw result from Cloudflare
      const cfResult = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
      
      // Handle different Cloudflare response structures just in case
      finalReply = cfResult.result || cfResult;

    } catch (cfError) {
      console.error(cfError);
      return res.status(500).json({ reply: "I'm having trouble connecting to my brain right now." });
    }
  }

  // --- POST-PROCESSING (Mindmap Cleanup) ---
  if (mode === 'mindmap' && finalReply) {
      // 1. Run your sanitizer helper (defined at top of file)
      // This fixes the arrow syntax errors automatically
      let cleanCode = cleanMermaidCode(finalReply);

      // 2. Send it with the special tag so Frontend knows to render <MermaidDiagram />
      finalReply = `:::MERMAID_Start:::${cleanCode}:::MERMAID_End:::`;
  }

  // Return the final consistent response
  res.json({ reply: finalReply });
});


// ==========================================
// 2. Summarize & Solve (Hybrid)
// ==========================================
router.post('/summarize-file', (req, res) => {
  const upload = aiUpload.single('file');
  
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ error: "Upload failed." });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    let tempFilePath = null;
    
    try {
      const mime = req.file.mimetype;
      const name = req.file.originalname;
      const buffer = req.file.buffer;
      const taskType = req.body.taskType || 'summarize'; 
      
      console.log(`📄 Processing: ${name} (${mime}) - Mode: ${taskType}`);

      // Prompt Construction
      let systemInstruction = "";
      if (taskType === 'solve') {
        systemInstruction = `You are a Math/Physics Tutor. Solve the problem in this file step-by-step. Show formulas and calculations clearly.`;
      } else {
        systemInstruction = `Explain this file (${name}) simply with bullet points.`;
      }

      // ---------------------------------------------------------
      // ATTEMPT 1: GEMINI (Native File Handling)
      // ---------------------------------------------------------
      try {
        // Handle Media Files (PDF, Image, Audio, Video)
        if (mime === 'application/pdf' || mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) {
          
          tempFilePath = path.join(os.tmpdir(), `upload-${Date.now()}-${name}`);
          fs.writeFileSync(tempFilePath, buffer);

          const uploadResponse = await fileManager.uploadFile(tempFilePath, { mimeType: mime, displayName: name });
          
          let fileState = await fileManager.getFile(uploadResponse.file.name);
          while (fileState.state === "PROCESSING") {
            await new Promise(res => setTimeout(res, 1500));
            fileState = await fileManager.getFile(uploadResponse.file.name);
          }

          if (fileState.state === "FAILED") throw new Error("Gemini failed to process file.");

          const result = await generateWithRetry([
            { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
            { text: systemInstruction }
          ]);

          return res.json({ summary: result.response.text() });
        } 
        
        // Handle Text Files (DOCX, EXCEL, PPTX) - Gemini needs text string
        else {
          let fileText = '';
          if (name.endsWith('.docx') || mime.includes('word')) fileText = await extractTextFromDocx(buffer);
          else if (name.endsWith('.xlsx') || mime.includes('spreadsheet')) fileText = await extractTextFromExcel(buffer);
          else if (name.endsWith('.pptx') || mime.includes('presentation')) fileText = await extractTextFromPptx(buffer, name);
          else fileText = buffer.toString('utf-8');

          if (!fileText.trim()) throw new Error("Empty text extracted");

          const prompt = `${systemInstruction}\n\nExtracted Content:\n${fileText.substring(0, 30000)}`;
          const result = await generateWithRetry(prompt);
          return res.json({ summary: result.response.text() });
        }

      } catch (geminiError) {
        console.error("❌ Gemini Failed/Limit Hit. Switching to Cloudflare...", geminiError.message);
        throw geminiError; // Throw to catch block below for fallback
      }

    } catch (error) {
      // ---------------------------------------------------------
      // ATTEMPT 2: CLOUDFLARE FALLBACK
      // ---------------------------------------------------------
      const mime = req.file.mimetype;
      const buffer = req.file.buffer;
      const name = req.file.originalname;
      const promptText = req.body.taskType === 'solve' ? "Solve this problem step by step." : "Summarize this.";

      try {
        // CASE A: IMAGES (Snap & Solve - Resize -> Vision -> OCR Fallback)
        if (mime.startsWith('image/')) {
           
           try {
             console.log("👁️ Processing Image...");

             // 🟢 STEP 1: Resize Image (Fixes Error 4002)
             // Large images crash Cloudflare. We resize to max width 1024px.
             const resizedBuffer = await sharp(buffer)
               .resize(1024, 1024, { 
                 fit: 'inside',      // Maintain aspect ratio
                 withoutEnlargement: true // Don't scale up small images
               })
               .toFormat('jpeg', { quality: 80 }) // Compress slightly
               .toBuffer();

             console.log(`📉 Resized image from ${buffer.length} bytes to ${resizedBuffer.length} bytes.`);

             // 🟢 STEP 2: Send Resized Image to Vision AI
             const input = {
               image: [...resizedBuffer], 
               prompt: promptText
             };
             
             const summary = await runCloudflare("@cf/meta/llama-3.2-11b-vision-instruct", input);
             return res.json({ summary });

           } catch (visionError) {
             console.warn(`⚠️ Vision AI Failed (${visionError.message}). Switching to OCR...`);
             
             // --- FALLBACK: Local OCR ---
             const extractedText = await extractTextFromImage(buffer); // Use original buffer for OCR (better detail)
             
             if (!extractedText || extractedText.trim().length < 5) {
                return res.json({ summary: "I tried to read the image, but the AI was busy and the text wasn't clear enough for manual reading." });
             }

             console.log("📝 Solving using extracted OCR text...");
             const input = {
               messages: [
                 { role: "system", content: "You are a helpful tutor. Solve the problem found in this text." },
                 { role: "user", content: `${promptText}\n\n(Note: Visual scan failed, solving based on text):\n${extractedText.substring(0, 12000)}` }
               ]
             };
             
             const summary = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
             return res.json({ summary });
           }
        }

// CASE B: DOCUMENTS (Cloudflare Fallback with Strict Limits)
        let textContent = "";
        
        // --- 1. HANDLE PDF ---
        if (mime === 'application/pdf') {
          console.log("📄 PDF Detected (Backup Mode).");
          
          // Get Text AND Page Count
          const { text: standardText, numpages } = await extractTextFromPdf(buffer);
          console.log(`🔍 Standard Parser found ${standardText?.length || 0} chars on ${numpages} pages.`);

          // 🛑 LIMIT CHECK 1: Standard PDF Page Count
          if (numpages > 25) {
            return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for PDF documents right now." });
          }

          // ✅ CHECK: If text is sufficient (> 2000), skip OCR
          if (standardText && standardText.length >= 2000) {
             console.log("✅ Sufficient text found. Skipping OCR.");
             textContent = standardText;
          } else {
             // Run OCR
             console.log("⚠️ Text < 2000 chars. Running OCR...");
             const ocrText = await extractTextFromScannedPdf(buffer);

             // 🛑 LIMIT CHECK 2: Scanned Page Count
             if (ocrText === "LIMIT_EXCEEDED") {
                return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for scanned documents right now." });
             }

             textContent = `--- [Source: Digital Parse] ---\n${standardText}\n\n--- [Source: Visual OCR] ---\n${ocrText}`;
          }
        }
        
        // --- 2. HANDLE WORD (DOCX) ---
        else if (name.endsWith('.docx')) {
           console.log("📄 DOCX Detected (Backup Mode).");
           // Extract Standard Text
           const standardText = await mammoth.extractRawText({ buffer: buffer }).then(r => r.value).catch(() => "");
           console.log(`🔍 Standard Parser found ${standardText?.length || 0} chars.`);

           // ✅ CHECK: If text is sufficient (> 2000), skip OCR
           if (standardText && standardText.length >= 2000) {
              textContent = standardText;
           } else {
              console.log("⚠️ Text < 2000 chars. Running OCR...");
              const ocrText = await extractTextFromScannedDocx(buffer);

              // 🛑 LIMIT CHECK 3: Scanned Image Count
              if (ocrText === "LIMIT_EXCEEDED") {
                return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for scanned documents right now." });
              }

              textContent = `--- [Source: Digital Parse] ---\n${standardText}\n\n--- [Source: Visual OCR] ---\n${ocrText}`;
           }
        }

        // --- 3. OTHER FORMATS ---
        else if (name.endsWith('.xlsx')) {
             textContent = await extractTextFromExcel(buffer);
        }
        else if (name.endsWith('.pptx')) {
             textContent = await extractTextFromPptx(buffer, name);
        }
        else {
             textContent = buffer.toString('utf-8'); 
        }

        // Final Validation
        if (!textContent || textContent.length < 5) {
          if (mime.startsWith('video/') || mime.startsWith('audio/')) {
             return res.json({ summary: "I reached my daily limit for Video/Audio processing. Please try a text file or image instead." });
          }
          return res.json({ summary: "I switched to backup AI, but couldn't read the text from this file." });
        }

        // Send Text to Llama 3
        const safeText = textContent.substring(0, 12000); // Limit context window
        const input = {
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: `${promptText}\n\nFile Content:\n${safeText}` }
          ]
        };
        
        const summary = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
        return res.json({ summary });

      } catch (cfError) {
        console.error("Fallback Failed:", cfError);
        return res.json({ summary: "Both AI services are currently busy. Please try again later." });
      }
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });
});


// ==========================================
// 3. Transcribe CLOUDINARY Video 
// ==========================================
router.post('/transcribe-video', async (req, res) => {
  // 🟢 NEW: Accept a Cloudinary URL instead of a local filename
  const { videoUrl } = req.body;
  if (!videoUrl) return res.json({ reply: "I couldn't identify the video URL." });

  console.log(`🎥 Downloading video from Cloudinary: ${videoUrl}`);
  
  // Create paths for our temporary files in Vercel's safe temp folder
  const tempVideoPath = path.join(SAFE_TEMP_DIR, `dl-video-${Date.now()}.mp4`);
  let tempAudioPath = null;

  try {
    // 🟢 NEW: Download the video from Cloudinary to a temporary file
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempVideoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log("✅ Video downloaded successfully to temp storage.");

    const systemInstruction = `
      You are a teaching assistant. The student is watching this lecture video.
      1. Summarize the lecture content.
      2. Provide detailed bullet points of the educational takeaways.
    `;

    // ---------------------------------------------------------
    // STRATEGY A: GEMINI (Native Video Watching)
    // ---------------------------------------------------------
    try {
      console.log("☁️ Attempting Gemini Video Analysis...");
      const uploadResponse = await fileManager.uploadFile(tempVideoPath, {
        mimeType: "video/mp4",
        displayName: "Cloudinary_Video_Temp",
      });

      let fileState = await fileManager.getFile(uploadResponse.file.name);
      while (fileState.state === "PROCESSING") {
        await new Promise(res => setTimeout(res, 2000));
        fileState = await fileManager.getFile(uploadResponse.file.name);
      }

      if (fileState.state === "FAILED") throw new Error("Gemini processing failed.");

      const result = await generateWithRetry([
        { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
        { text: systemInstruction }
      ]);

      return res.json({ reply: result.response.text() });

    } catch (geminiError) {
      console.warn("⚠️ Gemini Video Failed. Checking if video is silent...", geminiError.message);

      // ---------------------------------------------------------
      // STRATEGY B: FALLBACK (Check Silence -> Transcribe)
      // ---------------------------------------------------------
      try {
        console.log("🛠️ Extracting audio track...");
        tempAudioPath = path.join(SAFE_TEMP_DIR, `temp-audio-${Date.now()}.wav`);
        
        // 1. ATTEMPT AUDIO CONVERSION
        try {
          await convertVideoToAudio(tempVideoPath, tempAudioPath);
        } catch (conversionError) {
          console.warn("Audio extraction failed (likely silent video):", conversionError.message);
          return res.json({ reply: "I switched to my backup system, but I couldn't transcribe this video because it appears to be silent (no audio track found)." });
        }

        const audioBuffer = fs.readFileSync(tempAudioPath);
        
        // 2. TRANSCRIBE (Listen)
        console.log("🎤 Checking for speech...");
        const transcript = await runCloudflareAudio("@cf/openai/whisper", audioBuffer);

        // 3. CHECK SILENCE (Empty Transcript)
        if (!transcript || transcript.trim().length < 5) {
          return res.json({ reply: "I listened to the video using my backup tool, but I couldn't detect any spoken words. It appears to be a silent video." });
        }

        // 4. NOT SILENT? -> SUMMARIZE
        console.log("📝 Speech detected. Summarizing...");
        const input = {
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Here is the lecture transcript:\n\n${transcript.substring(0, 15000)}` }
          ]
        };
        
        const summary = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
        return res.json({ reply: summary });

      } catch (cfError) {
        console.error("❌ Backup Strategy Failed:", cfError.message);
        return res.status(500).json({ 
          reply: "I tried to analyze the video, but Gemini was busy and the backup system encountered an error." 
        });
      }
    }
  } catch (downloadError) {
    console.error("❌ Failed to download Cloudinary video:", downloadError.message);
    return res.status(500).json({ reply: "I couldn't access the video from the cloud storage." });
  } finally {
    // 🟢 NEW: Crucial Vercel Cleanup - delete both the temp video and temp audio
    if (fs.existsSync(tempVideoPath)) try { fs.unlinkSync(tempVideoPath); } catch (e) {}
    if (tempAudioPath && fs.existsSync(tempAudioPath)) try { fs.unlinkSync(tempAudioPath); } catch (e) {}
  }
});

module.exports = router;