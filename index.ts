import { $ } from "bun";
import fs from "fs";
import { join } from "path";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export class ClientResponse extends Response {
  constructor(body?: any, init?: any) {
    super(body, init);
    this.headers.set("Access-Control-Allow-Origin", "*");
    this.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET");
    this.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
}

try {
  await fs.promises.mkdir("saved_recordings");
} catch (e) {}
try {
  await fs.promises.mkdir("outputs");
} catch (e) {}

const server = Bun.serve({
  development: true,

  // `routes` requires Bun v1.2.3+
  routes: {
    "/api/process-recording": {
      POST: async (req) => {
        const body: { events: any[]; name: string } = (await req.json()) as any;

        const UUID = crypto.randomUUID();

        const pathForJson = join("saved_recordings", UUID + ".json");

        await fs.promises.writeFile(
          pathForJson,
          JSON.stringify(body.events, null, 2)
        );

        await $`rrvideo --input ${pathForJson} --output ./outputs/${UUID}.mp4`.env(
          {
            PUPPETEER_ARGS:
              "--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage",
            CHROME_ARGS: "--no-sandbox --disable-setuid-sandbox",
            PUPPETEER_EXECUTABLE_PATH: "google-chrome-stable",
          }
        );

        const chat1 = await ai.models.generateContent({
          contents: [
            {
              inlineData: {
                mimeType: "video/mp4",
                data: await fs.promises.readFile("./outputs/" + UUID + ".mp4", {
                  encoding: "base64",
                }),
              },
            },
            "Provide 3 suggestions of what you think went wrong. There may not be 3, if there aren't just give as many as you can think of. The bug will be very obvious and you will see it",
          ],
          model: "gemini-2.5-pro-preview-05-06",
          config: {
            maxOutputTokens: 2000,
            temperature: 1,
            topP: 1,
            seed: 0,
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.OFF,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.OFF,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.OFF,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.OFF,
              },
            ],
            systemInstruction: {
              parts: [
                {
                  text: `You are a debugging assistant and your job is to find anything that may have gone wrong.`,
                },
              ],
            },
          },
        });

        fs.promises.rm(pathForJson);
        fs.promises.rm(join("outputs", UUID + ".mp4"));

        return new ClientResponse(chat1.text);
      },
    },
  },

  // (optional) fallback for unmatched routes:
  // Required if Bun's version < 1.2.3
  fetch(req) {
    const res = new ClientResponse("hello world");
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    // add Access-Control-Allow-Headers if needed
    return res;
  },
});

console.log(
  `Server is running \n\non ${server.url} \n\nas of ${new Date(Date.now())}\n`
);
