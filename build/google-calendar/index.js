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
    return { tools: [
            {
                name: 'list_calendars',
                description: 'List all available calendars',
                inputSchema: {
                    type: "object",
                    properties: {
                        limit: {
                            type: "number",
                            description: "Maximum number of channels to return (default 100, max 200)",
                            default: 100,
                        },
                        cursor: {
                            type: "string",
                            description: "Pagination cursor for next page of results",
                        },
                    },
                },
            },
            {
                name: 'list_events',
                description: 'List events in a calendar',
                inputSchema: {
                    type: "object",
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        timeMin: {
                            type: 'string',
                            description: 'Start time in ISO format (default: now)',
                        },
                        timeMax: {
                            type: 'string',
                            description: 'End time in ISO format',
                        },
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (default: 10)',
                        },
                        q: {
                            type: 'string',
                            description: 'Search query for event titles or descriptions',
                        },
                    },
                    required: [],
                },
            },
            {
                name: 'create_event',
                description: 'Create a new event in a calendar',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        summary: {
                            type: 'string',
                            description: 'Event title',
                        },
                        description: {
                            type: 'string',
                            description: 'Event description',
                        },
                        location: {
                            type: 'string',
                            description: 'Event location',
                        },
                        start: {
                            type: 'string',
                            description: 'Start time in ISO format',
                        },
                        end: {
                            type: 'string',
                            description: 'End time in ISO format',
                        },
                        attendees: {
                            type: 'array',
                            description: 'List of email addresses of attendees',
                            items: {
                                type: 'string',
                            },
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
                        },
                    },
                    required: ['summary', 'start', 'end'],
                },
            },
            {
                name: 'get_event',
                description: 'Get details for a specific event',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        eventId: {
                            type: 'string',
                            description: 'Event ID',
                        },
                    },
                    required: ['eventId'],
                },
            },
            {
                name: 'update_event',
                description: 'Update an existing event in a calendar',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        eventId: {
                            type: 'string',
                            description: 'Event ID',
                        },
                        summary: {
                            type: 'string',
                            description: 'Event title',
                        },
                        description: {
                            type: 'string',
                            description: 'Event description',
                        },
                        location: {
                            type: 'string',
                            description: 'Event location',
                        },
                        start: {
                            type: 'string',
                            description: 'Start time in ISO format',
                        },
                        end: {
                            type: 'string',
                            description: 'End time in ISO format',
                        },
                        attendees: {
                            type: 'array',
                            description: 'List of email addresses of attendees',
                            items: {
                                type: 'string',
                            },
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
                        },
                    },
                    required: ['eventId'],
                },
            },
            {
                name: 'delete_event',
                description: 'Delete an event from a calendar',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        eventId: {
                            type: 'string',
                            description: 'Event ID',
                        },
                    },
                    required: ['eventId'],
                },
            },
            {
                name: 'find_available_slots',
                description: 'Find available time slots in a calendar',
                inputSchema: {
                    type: 'object',
                    properties: {
                        calendarId: {
                            type: 'string',
                            description: 'Calendar ID (default: primary)',
                        },
                        timeMin: {
                            type: 'string',
                            description: 'Start time in ISO format (default: now)',
                        },
                        timeMax: {
                            type: 'string',
                            description: 'End time in ISO format (default: 7 days from now)',
                        },
                        duration: {
                            type: 'number',
                            description: 'Duration of the slot in minutes (default: 30)',
                        },
                        workingHoursStart: {
                            type: 'string',
                            description: 'Working hours start time (default: 09:00)',
                        },
                        workingHoursEnd: {
                            type: 'string',
                            description: 'Working hours end time (default: 17:00)',
                        },
                    },
                    required: [],
                },
            },
        ] };
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
        console.log({ result });
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
