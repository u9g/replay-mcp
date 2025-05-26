import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { join } from "path";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { Sessions, streamableHttp } from "fastify-mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

dotenv.config();

const execAsync = promisify(exec);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Create Fastify instance
const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

let resolvePromise: ((value: any) => void) | null = null;

function createServer() {
  const mcpServer = new McpServer({
    name: "replay-recording-mcp",
    version: "1.0.0",
  });

  mcpServer.tool(
    "find-bugs",
    {},
    () => new Promise((resolve, reject) => {
      console.log('the mcp was called!')
      resolvePromise = resolve;
    })
  );

  return mcpServer.server;
}

// Register CORS plugin
await fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

fastify.register(streamableHttp, {
  // Set to `true` if you want a stateful server
  stateful: false,
  mcpEndpoint: "/mcp",
  sessions: new Sessions<StreamableHTTPServerTransport>(),
  createServer,
});

// Create directories
try {
  await fs.promises.mkdir("saved_recordings");
} catch (e) { }
try {
  await fs.promises.mkdir("outputs");
} catch (e) { }

// Define the POST route for processing recordings
fastify.post(
  "/api/process-recording",
  async (request: FastifyRequest, reply: FastifyReply) => {
    const body: { events: any[]; name: string } = JSON.parse(
      request.body as string
    ) as any;

    const UUID = crypto.randomUUID();

    const pathForJson = join("saved_recordings", UUID + ".json");

    await fs.promises.writeFile(
      pathForJson,
      JSON.stringify(body.events, null, 2)
    );

    // Convert Bun's $ command to exec
    const command = `rrvideo --input ${pathForJson} --output ./outputs/${UUID}.mp4`;
    try {
      fastify.log.info(`Executing command: ${command}`);

      const result = await execAsync(command);
      fastify.log.info(`Command stdout: ${result.stdout}`);
      fastify.log.info(`Command stderr: ${result.stderr}`);
    } catch (error: any) {
      fastify.log.error("Error executing rrvideo command:");
      fastify.log.error(`Error message: ${error?.message || "Unknown error"}`);
      fastify.log.error(`Error code: ${error?.code || "No code"}`);
      fastify.log.error(`Error signal: ${error?.signal || "No signal"}`);
      if (error?.stdout) fastify.log.error(`Error stdout: ${error.stdout}`);
      if (error?.stderr) fastify.log.error(`Error stderr: ${error.stderr}`);
      fastify.log.error(`Full error object: ${JSON.stringify(error, null, 2)}`);

      return reply.status(500).send({
        error: "Failed to process recording",
        details: {
          message: error?.message || "Unknown error",
          code: error?.code,
          signal: error?.signal,
          stdout: error?.stdout,
          stderr: error?.stderr,
        },
      });
    }

    const chat1 = await ai.models.generateContent({
      contents: [
        {
          text: "Provide 3 suggestions of what you think went wrong. There may not be 3, if there aren't just give as many as you can think of. The bug will be very obvious and you will see it",
        },
        {
          inlineData: {
            data: await fs.promises.readFile(
              "./outputs/" + UUID + ".mp4",
              "base64"
            ),
            mimeType: "video/mp4",
          },
        },
      ],
      model: "gemini-2.0-flash",
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
        responseMimeType: "application/json",
        responseSchema: {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "type": "object",
          "properties": {
            "choice1": {
              "type": "string"
            },
            "choice2": {
              "type": "string"
            },
            "choice3": {
              "type": "string"
            }
          },
          "required": [
            "choice1",
            "choice2",
            "choice3"
          ],
          "additionalProperties": false
        }
      },
    });

    // Clean up files
    await fs.promises.rm(pathForJson);
    await fs.promises.rm(join("outputs", UUID + ".mp4"));

    const txt = chat1.text

    if (!txt) {
      return reply.send("No text");
    }


    if (resolvePromise) {
      fastify.log.info(`Returning to the mcp!`);
      resolvePromise(`I found 3 possible bugs:\n${JSON.stringify(JSON.parse(txt), null, 2)}`);
      resolvePromise = null;
    }

    return reply.send(txt);
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
