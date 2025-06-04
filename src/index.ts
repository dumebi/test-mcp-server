#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config(); // 로컬 개발 시 .env 파일을 읽습니다.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GmailProvider } from './providers/gmailProvider.js';
import { GoogleCalendarProvider } from './providers/googleCalendarProvider.js';
import { GoogleContactsProvider } from './providers/gContactsProvider.js';

// 디버그 로그
function debugLog(...args: unknown[]) {
  console.error('DEBUG:', new Date().toISOString(), ...args);
}

// Server implementation
const server = new Server({
  name: "laura-mcp",
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

const gmailProvider = new GmailProvider();
await gmailProvider.initialize();

const calendarProvider = new GoogleCalendarProvider();
await calendarProvider.initialize();

const contactsProvider = new GoogleContactsProvider();
await contactsProvider.initialize();

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  debugLog('List tools request received');
  return { tools: [
    ...gmailProvider.getToolDefinitions(), 
    ...calendarProvider.getToolDefinitions(),
    ...contactsProvider.getToolDefinitions(),
  ] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  debugLog('Call tool request received:', JSON.stringify(request, null, 2));

  try {
    const { name, arguments: args } = request.params;
    const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
    if (!args) {
      throw new Error("No arguments provided");
    }
    let result;
    switch (name) {
      case 'gmail_sendEmail':
        result = await gmailProvider.sendEmail(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'gmail_draftEmail':
        result = await gmailProvider.draftEmail(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'gmail_listEmails':
        result = await gmailProvider.listEmails(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'gmail_getEmail':
        result = await gmailProvider.getEmail(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'gmail_deleteEmail':
        result = await gmailProvider.deleteEmail(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'gmail_modifyLabels':
        result = await gmailProvider.modifyLabels(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'list_calendars':
        result = await calendarProvider.listCalendars(GOOGLE_REFRESH_TOKEN);
        break;
      case 'list_events':
        result = await calendarProvider.listEvents(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'create_event':
        result = await calendarProvider.createEvent(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'get_event':
        result = await calendarProvider.getEvent(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'update_event':
        result = await calendarProvider.updateEvent(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'delete_event':
        result = await calendarProvider.deleteEvent(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'find_available_slots':
        result = await calendarProvider.findAvailableSlots(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'get_upcoming_meetings':
        result = await calendarProvider.getUpcomingMeetings(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'contacts_listContacts':
        result = await contactsProvider.listContacts(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'contacts_searchContacts':
        result = await contactsProvider.searchContacts(args, GOOGLE_REFRESH_TOKEN);
        break;
      case 'contacts_getContact':
        result = await contactsProvider.getContact(args, GOOGLE_REFRESH_TOKEN);
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
  console.error("Laura MCP Server running on stdio");
}

// Start the server
runServer().catch((error) => {
  debugLog('Fatal server error:', error);
  console.error("Fatal error running server:", error);
  process.exit(1);
});