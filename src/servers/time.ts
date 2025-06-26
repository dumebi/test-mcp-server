#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config(); // 로컬 개발 시 .env 파일을 읽습니다.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TimeProvider } from '../providers/timeProvider.js';

// 디버그 로그
function debugLog(...args: unknown[]) {
  console.error('DEBUG:', new Date().toISOString(), ...args);
}

// Server implementation
const server = new Server({
  name: "laura-time-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

debugLog('Server initialized');

// 환경 변수 확인: MCP 클라이언트 설정이나 .env 파일을 통해 전달받은 값이 여기에
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required");
  process.exit(1);
}


const timeProvider = new TimeProvider();

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debugLog('List tools request received');
  return { tools: [
    ...timeProvider.getToolDefinitions()
  ] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  debugLog('Call tool request received:', JSON.stringify(request, null, 2));

  try {
    const { name, arguments: args } = request.params;
    if (!args) {
      throw new Error("No arguments provided");
    }
    let result;
    switch (name) {
      case 'get_current_time':
        result = await timeProvider.get_current_time(args);
        break;
      case 'convert_time':
        result = await timeProvider.convert_time(args);
        break;
      default:
        return {
          content: [{ type: "text", text: JSON.stringify(`Unknown tool: ${name}`) }],
          isError: true
        };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }],
      isError: true
    };
  }
});

// Server startup function
async function runServer() {
  debugLog('Starting server');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog('Server connected to transport');
  console.error("Laura Time MCP Server running on stdio");
}

// Start the server
runServer().catch((error) => {
  debugLog('Fatal server error:', error);
  console.error("Fatal error running server:", error);
  process.exit(1);
});