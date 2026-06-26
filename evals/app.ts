import { initLogger } from "braintrust";
import { GoogleGenAI } from "@google/genai";

initLogger({ projectName: "My Project", apiKey: process.env.BRAINTRUST_API_KEY });

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

async function main() {
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "What is the capital of France?",
    config: {
      maxOutputTokens: 100,
    },
  });
  console.log(response);
}

main();
