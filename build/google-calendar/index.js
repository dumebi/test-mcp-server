#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config(); // 로컬 개발 시 .env 파일을 읽습니다.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { GoogleCalendarProvider } from './googleCalendarProvider.js';
// 디버그 로그
function debugLog(...args) {
    console.error('DEBUG:', new Date().toISOString(), ...args);
}
// Define the create_event tool
const CREATE_EVENT_TOOL = {
    name: "create_event",
    description: "Create a calendar event with specified details",
    inputSchema: {
        type: "object",
        properties: {
            summary: {
                type: "string",
                description: "Event title"
            },
            start_time: {
                type: "string",
                description: "Start time (ISO format)"
            },
            end_time: {
                type: "string",
                description: "End time (ISO format)"
            },
            description: {
                type: "string",
                description: "Event description"
            },
            location: {
                type: "string",
                description: "Event location"
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "List of attendee emails"
            },
            reminders: {
                type: "object",
                properties: {
                    useDefault: {
                        type: "boolean",
                        description: "Whether to use default reminders"
                    },
                    overrides: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                method: {
                                    type: "string",
                                    description: "Reminder method (e.g., popup, email)"
                                },
                                minutes: {
                                    type: "number",
                                    description: "Minutes before event start for the reminder"
                                }
                            },
                            required: ["method", "minutes"]
                        },
                        description: "List of custom reminder settings"
                    }
                },
                description: "Reminder settings for the event"
            }
        },
        required: ["summary", "start_time", "end_time"]
    }
};
// Server implementation
const server = new Server({
    name: "mcp_google_calendar",
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
const provider = new GoogleCalendarProvider();
await provider.initialize();
// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    debugLog('List tools request received');
    return { tools: provider.getToolDefinitions() };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    debugLog('Call tool request received:', JSON.stringify(request, null, 2));
    try {
        const { name, arguments: args } = request.params;
        if (!args) {
            throw new Error("No arguments provided");
        }
        console.log({ name, args });
        let result;
        switch (name) {
            case 'list_calendars':
                result = await provider.listCalendars();
                break;
            case 'list_events':
                result = await provider.listEvents(args);
                break;
            case 'create_event':
                result = await provider.createEvent(args);
                break;
            case 'get_event':
                result = await provider.getEvent(args);
                break;
            case 'update_event':
                result = await provider.updateEvent(args);
                break;
            case 'delete_event':
                result = await provider.deleteEvent(args);
                break;
            case 'find_available_slots':
                result = await provider.findAvailableSlots(args);
                break;
            case 'get_upcoming_meetings':
                result = await provider.getUpcomingMeetings(args);
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
    }
    catch (error) {
        console.error(`Error handling request for tool ${request.params.name}:`, error);
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
    console.error("Calendar MCP Server running on stdio");
}
// Start the server
runServer().catch((error) => {
    debugLog('Fatal server error:', error);
    console.error("Fatal error running server:", error);
    process.exit(1);
});
