import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { join } from "path";
import { GoogleGenAI } from "@google/genai";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { Sessions, streamableHttp } from "fastify-mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as T from "@rrweb/types";
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"


dotenv.config();

const execAsync = promisify(exec);

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';


const ai = new GoogleGenAI({
  vertexai: true,
  project: GOOGLE_CLOUD_PROJECT,
  location: GOOGLE_CLOUD_LOCATION,
});

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

    // TODO: Process the recording
    // const result = await generateText({
    //   model: openai("gpt-4o-mini"),
    //   prompt: `
    //   You are a bug finder.
    //   You are given a recording of a user interacting with an application.
    //   You are to find the bugs in the recording.
    //   You are to return the bugs.
    //   `,
    //   messages: [
    //     { content: "Hello, how are you?", role: "user" }
    //   ]
    // });
    // console.log(result);

    // Clean up files
    //await fs.promises.rm(pathForJson);

    // if (resolvePromise) {
    //   fastify.log.info(`Returning to the mcp!`);
    //   resolvePromise({
    //     content: [{
    //       type: "text",
    //       text: `I found 3 possible bugs:\n${JSON.stringify(JSON.parse(txt), null, 2)}. Prompt the user about whether to fix problem a, b, or c, and then once told, fix the problem.`
    //     }]
    //   });
    //   resolvePromise = null;
    // }

    return reply.send("OK");
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
