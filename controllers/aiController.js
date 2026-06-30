const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Explicitly set ffmpeg path for Windows compatibility
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const SAFE_TEMP_DIR = os.tmpdir();

// Services
const {
  extractTextFromDocx,
  extractTextFromExcel,
  extractTextFromPptx,
  extractTextFromPdf,
  extractTextFromScannedPdf,
  extractTextFromScannedDocx
} = require('../services/fileParserService');

const { fileManager, generateWithRetry } = require('../services/geminiService');
const { runCloudflare, runCloudflareAudio } = require('../services/cloudflareService');
const extractTextFromImage = require('../services/ocrService');

// Clean Mermaid Code helper
const cleanMermaidCode = (rawCode) => {
  if (!rawCode) return "";
  let clean = rawCode;
  clean = clean.replace(/```mermaid/g, '').replace(/```/g, '');
  clean = clean.replace(/\|>/g, '|');
  clean = clean.replace(/\| >/g, '|');
  if (!clean.includes('graph ') && !clean.includes('flowchart ')) {
    clean = 'graph TD\n' + clean;
  }
  return clean.trim();
};

// Audio Extractor helper
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

// 1. CHAT ENDPOINT
exports.chat = async (req, res) => {
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
    const prompt = `${systemInstruction}\n\nUser Message: "${message}"`;
    const result = await generateWithRetry(prompt);
    finalReply = result.response.text();

  } catch (error) {
    console.warn("⚠️ Gemini Error/Busy. Switching to Cloudflare Fallback...");
    try {
      const input = {
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message }
        ]
      };
      
      const cfResult = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
      finalReply = cfResult.result || cfResult;
    } catch (cfError) {
      console.error(cfError);
      return res.status(500).json({ reply: "I'm having trouble connecting to my brain right now." });
    }
  }

  if (mode === 'mindmap' && finalReply) {
      let cleanCode = cleanMermaidCode(finalReply);
      finalReply = `:::MERMAID_Start:::${cleanCode}:::MERMAID_End:::`;
  }

  res.json({ reply: finalReply });
};

// 2. SUMMARIZE FILE
exports.summarizeFile = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  
  let tempFilePath = null;
  
  try {
    const mime = req.file.mimetype;
    const name = req.file.originalname;
    const buffer = req.file.buffer;
    const taskType = req.body.taskType || 'summarize'; 
    
    console.log(`📄 Processing: ${name} (${mime}) - Mode: ${taskType}`);

    let systemInstruction = "";
    if (taskType === 'solve') {
      systemInstruction = `You are a Math/Physics Tutor. Solve the problem in this file step-by-step. Show formulas and calculations clearly.`;
    } else {
      systemInstruction = `Explain this file (${name}) simply with bullet points.`;
    }

    // Try Gemini first
    try {
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
      } else {
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
      
      // Cloudflare Fallback
      const promptText = taskType === 'solve' ? "Solve this problem step by step." : "Summarize this.";

      if (mime.startsWith('image/')) {
         try {
           console.log("👁️ Processing Image...");
           const resizedBuffer = await sharp(buffer)
             .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
             .toFormat('jpeg', { quality: 80 })
             .toBuffer();

           const input = {
             image: [...resizedBuffer], 
             prompt: promptText
           };
           
           const summary = await runCloudflare("@cf/meta/llama-3.2-11b-vision-instruct", input);
           return res.json({ summary });

         } catch (visionError) {
           console.warn(`⚠️ Vision AI Failed (${visionError.message}). Switching to OCR...`);
           const extractedText = await extractTextFromImage(buffer);
           
           if (!extractedText || extractedText.trim().length < 5) {
              return res.json({ summary: "I tried to read the image, but the AI was busy and the text wasn't clear enough for manual reading." });
           }

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

      let textContent = "";
      
      if (mime === 'application/pdf') {
        const { text: standardText, numpages } = await extractTextFromPdf(buffer);
        if (numpages > 25) {
          return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for PDF documents right now." });
        }

        if (standardText && standardText.length >= 2000) {
           textContent = standardText;
        } else {
           const ocrText = await extractTextFromScannedPdf(buffer);
           if (ocrText === "LIMIT_EXCEEDED") {
              return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for scanned documents right now." });
           }
           textContent = `--- [Source: Digital Parse] ---\n${standardText}\n\n--- [Source: Visual OCR] ---\n${ocrText}`;
        }
      } else if (name.endsWith('.docx')) {
         const standardText = await mammoth.extractRawText({ buffer: buffer }).then(r => r.value).catch(() => "");
         if (standardText && standardText.length >= 2000) {
            textContent = standardText;
         } else {
            const ocrText = await extractTextFromScannedDocx(buffer);
            if (ocrText === "LIMIT_EXCEEDED") {
              return res.json({ summary: "I switched to my backup system, but I can only summarize up to 25 pages for scanned documents right now." });
            }
            textContent = `--- [Source: Digital Parse] ---\n${standardText}\n\n--- [Source: Visual OCR] ---\n${ocrText}`;
         }
      } else if (name.endsWith('.xlsx')) {
           textContent = await extractTextFromExcel(buffer);
      } else if (name.endsWith('.pptx')) {
           textContent = await extractTextFromPptx(buffer, name);
      } else {
           textContent = buffer.toString('utf-8'); 
      }

      if (!textContent || textContent.length < 5) {
        if (mime.startsWith('video/') || mime.startsWith('audio/')) {
           return res.json({ summary: "I reached my daily limit for Video/Audio processing. Please try a text file or image instead." });
        }
        return res.json({ summary: "I switched to backup AI, but couldn't read the text from this file." });
      }

      const safeText = textContent.substring(0, 12000);
      const input = {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: `${promptText}\n\nFile Content:\n${safeText}` }
        ]
      };
      
      const summary = await runCloudflare("@cf/meta/llama-3-8b-instruct", input);
      return res.json({ summary });
    }

  } catch (error) {
    console.error("File processing failed:", error);
    return res.status(500).json({ error: "Failed to summarize file." });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
  }
};

// 3. TRANSCRIBE VIDEO
exports.transcribeVideo = async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.json({ reply: "I couldn't identify the video URL." });

  console.log(`🎥 Downloading video from Cloudinary: ${videoUrl}`);
  
  const tempVideoPath = path.join(SAFE_TEMP_DIR, `dl-video-${Date.now()}.mp4`);
  let tempAudioPath = null;

  try {
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

      try {
        console.log("🛠️ Extracting audio track...");
        tempAudioPath = path.join(SAFE_TEMP_DIR, `temp-audio-${Date.now()}.wav`);
        
        try {
          await convertVideoToAudio(tempVideoPath, tempAudioPath);
        } catch (conversionError) {
          console.warn("Audio extraction failed (likely silent video):", conversionError.message);
          return res.json({ reply: "I switched to my backup system, but I couldn't transcribe this video because it appears to be silent (no audio track found)." });
        }

        const audioBuffer = fs.readFileSync(tempAudioPath);
        
        console.log("🎤 Checking for speech...");
        const transcript = await runCloudflareAudio("@cf/openai/whisper", audioBuffer);

        if (!transcript || transcript.trim().length < 5) {
          return res.json({ reply: "I listened to the video using my backup tool, but I couldn't detect any spoken words. It appears to be a silent video." });
        }

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
    if (fs.existsSync(tempVideoPath)) try { fs.unlinkSync(tempVideoPath); } catch (e) {}
    if (tempAudioPath && fs.existsSync(tempAudioPath)) try { fs.unlinkSync(tempAudioPath); } catch (e) {}
  }
};
