import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import * as z from "zod";

const apiKey = process.env.IDEOGRAM_API_KEY;
if (!apiKey) {
  console.error("IDEOGRAM_API_KEY is not set");
  process.exit(1);
}

const endpoint = "https://api.ideogram.ai/v2/image/generate/ideogram-4-5";

function createServer() {
  const server = new McpServer({
    name: "ideogram",
    version: "1.0.0",
  });

  server.registerTool(
    "generate_image",
    {
      description:
        "Generate one image with the Ideogram API from a text prompt. Returns the image URL.",
      inputSchema: {
        prompt: z.string().min(1).max(10000).describe("The image prompt"),
      },
    },
    async ({ prompt }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, num_images: 1 }),
        signal: AbortSignal.timeout(90000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body?.error || body?.message || response.statusText;
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Ideogram request failed (${response.status}): ${message}`,
            },
          ],
        };
      }
      const image = body?.data?.[0];
      const url = image?.url;
      if (!url) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Ideogram did not return an image URL.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Image URL: ${url}`,
          },
        ],
      };
    },
  );

  return server;
}

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request failed");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Ideogram MCP listening on ${port}`);
});
