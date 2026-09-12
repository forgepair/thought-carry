#!/usr/bin/env node
// Live round-trip verification against the real Gemini API. Requires
// GEMINI_API_KEY, either already in the environment or in a gitignored
// .env file at the repo root (KEY=value, one per line). Never logs the
// key itself.
//
//   node scripts/live-verify-gemini.mjs [model]
//
// Confirms, against the real live API, not a simulated payload:
//   1. A real functionCall response carries a real thoughtSignature.
//   2. thought-carry's extractThoughtSignature() pulls it correctly.
//   3. thought-carry's attachThoughtSignature() reinserts it in a shape
//      the API actually accepts on the next turn (no 400).
//   4. The tool result data genuinely reaches the model's final answer.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as gemini from "../dist/providers/gemini.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");

let API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY && existsSync(envPath)) {
  const match = readFileSync(envPath, "utf8").match(/GEMINI_API_KEY\s*=\s*(.+)/);
  API_KEY = match?.[1]?.trim();
}
if (!API_KEY) {
  console.error("GEMINI_API_KEY not found in the environment or .env -- see README.");
  process.exit(2);
}

const MODEL = process.argv[2] || "gemini-3.5-flash";
const BASE = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          type: "OBJECT",
          properties: { city: { type: "STRING" } },
          required: ["city"],
        },
      },
    ],
  },
];

async function call(body) {
  const res = await fetch(`${BASE}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

console.log(`--- Turn 1: asking ${MODEL} about weather (tool defined) ---`);
const turn1 = await call({
  contents: [{ role: "user", parts: [{ text: "What's the weather in Paris? Use the tool." }] }],
  tools,
});
console.log("HTTP status:", turn1.status);
if (turn1.status !== 200) {
  console.log("FULL ERROR BODY:", JSON.stringify(turn1.json, null, 2));
  process.exitCode = 1;
} else {
  const fnCallPart = turn1.json.candidates?.[0]?.content?.parts?.find((p) => p.functionCall);
  if (!fnCallPart) {
    console.log("No functionCall part returned -- model answered directly this run.");
  } else {
    console.log("\n--- Extracting thought signature with thought-carry's own code ---");
    const sig = gemini.extractThoughtSignature(fnCallPart);
    console.log("Signature present:", sig !== undefined, "| length:", sig?.length ?? 0);

    if (sig !== undefined) {
      console.log("\n--- Turn 2: sending the tool result back, signature reattached via thought-carry ---");
      const rebuiltPart = gemini.attachThoughtSignature(fnCallPart.functionCall, sig, "3");
      const turn2 = await call({
        contents: [
          { role: "user", parts: [{ text: "What's the weather in Paris? Use the tool." }] },
          { role: "model", parts: [rebuiltPart] },
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "get_weather",
                  response: { temperature: "62F", condition: "cloudy" },
                },
              },
            ],
          },
        ],
        tools,
      });
      console.log("HTTP status:", turn2.status);
      if (turn2.status !== 200) {
        console.log("FULL ERROR BODY:", JSON.stringify(turn2.json, null, 2));
        process.exitCode = 1;
      } else {
        console.log("SUCCESS -- turn 2 accepted the reattached signature, no 400.");
        console.log(
          "Final model text:",
          turn2.json.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text,
        );
      }
    }
  }
}
