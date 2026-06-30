const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing in .env!");
}

const genAI = new GoogleGenerativeAI(apiKey || 'dummy_key');
const fileManager = new GoogleAIFileManager(apiKey || 'dummy_key');

const MODEL_NAME = "gemini-2.5-flash-lite"; 
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

/**
 * Helper to generate content from Gemini with retry logic on 429/503.
 */
const generateWithRetry = async (promptParts, retries = 3) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await model.generateContent(promptParts);
    } catch (error) {
      if (error.status === 429 || error.status === 503) {
        attempt++;
        console.warn(`⚠️ API Busy. Retrying (${attempt}/${retries})...`);
        // Keeping 4s delay
        await new Promise(res => setTimeout(res, 4000));
      } else {
        throw error; 
      }
    }
  }
  throw new Error("Rate limit exceeded.");
};

module.exports = {
  genAI,
  fileManager,
  model,
  generateWithRetry
};
