const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

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
  return result.result.response || result.result; // Handle differences in result structures
};

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

module.exports = {
  runCloudflare,
  runCloudflareAudio
};
