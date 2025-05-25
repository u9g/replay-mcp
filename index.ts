import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { join } from "path";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";

const execAsync = promisify(exec);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Create Fastify instance
const fastify = Fastify({
  logger: true,
});

// Register CORS plugin
await fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

// Create directories
try {
  await fs.promises.mkdir("saved_recordings");
} catch (e) {}
try {
  await fs.promises.mkdir("outputs");
} catch (e) {}

// Define the POST route for processing recordings
fastify.post(
  "/api/process-recording",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body: { events: any[]; name: string } = request.body as any;

    const UUID = crypto.randomUUID();

    const pathForJson = join("saved_recordings", UUID + ".json");

    await fs.promises.writeFile(
      pathForJson,
      JSON.stringify(body.events, null, 2)
    );

    // Convert Bun's $ command to exec
    const command = `rrvideo --input ${pathForJson} --output ./outputs/${UUID}.mp4`;
    const env = {
      ...process.env,
      PUPPETEER_ARGS:
        "--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage",
      CHROME_ARGS: "--no-sandbox --disable-setuid-sandbox",
      PUPPETEER_EXECUTABLE_PATH: "google-chrome-stable",
    };

    try {
      await execAsync(command, { env });
    } catch (error) {
      fastify.log.error("Error executing rrvideo command:", error);
      return reply.status(500).send({ error: "Failed to process recording" });
    }

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

    // Clean up files
    fs.promises.rm(pathForJson);
    fs.promises.rm(join("outputs", UUID + ".mp4"));

    return reply.send(chat1.text);
  }
);

// Fallback route for unmatched routes
fastify.get("*", async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.send("hello world");
});

// Start the server
const start = async () => {
  try {
    const address = await fastify.listen({
      port: 3000,
      host: "0.0.0.0",
    });
    console.log(
      `Server is running \n\non ${address} \n\nas of ${new Date(Date.now())}\n`
    );
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
