require('dotenv').config();

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function unlockModel(modelName) {
  console.log(`🔓 Unlocking model: ${modelName}...`);
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelName}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: "agree" }) // THIS IS THE KEY
      }
    );

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Success! ${modelName} is now ready to use.`);
    } else {
      console.error(`❌ Failed:`, JSON.stringify(result.errors, null, 2));
    }
  } catch (error) {
    console.error("Network Error:", error);
  }
}

// Unlock the Vision model (causing your error)
unlockModel("@cf/meta/llama-3.2-11b-vision-instruct");

// Unlock the Text model (just in case)
unlockModel("@cf/meta/llama-3-8b-instruct");