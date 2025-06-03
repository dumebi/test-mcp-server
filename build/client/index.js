// Anthropic SDK
import { Anthropic } from "@anthropic-ai/sdk";
// MCP Client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { google } from 'googleapis';
// Express
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}
class MCPClient {
    mcp;
    llm;
    transport = null;
    tools = [];
    constructor() {
        this.llm = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
        this.mcp = new Client({
            name: "mcp-client-cli", version: "1.0.0"
        }, {
            capabilities: {
                tools: {}
            }
        });
    }
    async connectToServer(serverScriptPath) {
        try {
            const isJs = serverScriptPath.endsWith(".js");
            const isPy = serverScriptPath.endsWith(".py");
            if (!isJs && !isPy) {
                throw new Error("Server script must be a .js or .py file");
            }
            const command = isPy
                ? process.platform === "win32"
                    ? "python"
                    : "python3"
                : process.execPath;
            this.transport = new StdioClientTransport({
                command,
                args: [serverScriptPath],
            });
            await this.mcp.connect(this.transport);
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });
            console.log("Connected to server with tools:", this.tools.map(({ name }) => name));
        }
        catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }
    async processQuery(query) {
        const messages = [
            {
                role: "user",
                content: query,
            },
        ];
        const response = await this.llm.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages,
            tools: this.tools,
        });
        const finalText = [];
        const toolResults = [];
        for (const content of response.content) {
            if (content.type === "text") {
                finalText.push(content.text);
            }
            else if (content.type === "tool_use") {
                const toolName = content.name;
                const toolArgs = content.input;
                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });
                toolResults.push(result);
                finalText.push(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);
                messages.push({
                    role: "user",
                    content: result.content,
                });
                const response = await this.llm.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1000,
                    messages,
                });
                finalText.push(response.content[0].type === "text" ? response.content[0].text : "");
            }
        }
        return finalText.join("\n");
    }
    async cleanup() {
        await this.mcp.close();
    }
}
const googleProviderScopes = {
    contacts: [
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts",
    ],
    calendar: [
        "https://www.googleapis.com/auth/calendar"
    ],
    gmail: [
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
    ],
    drive: [
        "https://www.googleapis.com/auth/drive",
    ],
};
function getAuthUrl() {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    return auth.generateAuthUrl({
        access_type: 'offline',
        scope: [
            "profile", // Basic profile info
            "email", // User email address
            "https://www.googleapis.com/auth/gmail.modify", // Modify Gmail data
            "https://www.googleapis.com/auth/gmail.readonly", // Read Gmail data
            "https://www.googleapis.com/auth/drive", // Access Google Drive
            "https://www.googleapis.com/auth/calendar", // Access Google Calendar
            "https://www.googleapis.com/auth/tasks", // Access Google Tasks
            "https://www.googleapis.com/auth/youtube.readonly", // Read YouTube data
            "https://www.googleapis.com/auth/contacts.readonly", // Read Google Contacts
            "https://www.googleapis.com/auth/contacts", // Manage Google Contacts
        ],
        prompt: 'consent', // Always show consent screen to ensure we get a refresh token
        include_granted_scopes: true
    });
}
function showAuthUrl() {
    const authUrl = getAuthUrl();
    console.error('\n🔑 Authorization Required');
    console.error('-------------------');
    console.error('1. Visit this URL to authorize the application:');
    console.error(authUrl);
    console.error('\n2. After approval, you will be redirected to a URL. Copy the "code" parameter from that URL.');
    console.error('\n3. Use the set_auth_code tool or run this command:');
    console.error(`   npx ts-node src/auth-helper.js "PASTE_AUTH_CODE_HERE"\n`);
    return authUrl;
}
async function main() {
    const app = express();
    const port = process.env.PORT || 3000;
    // Middleware
    app.use(cors());
    app.use(express.json());
    const mcpClient = new MCPClient();
    try {
        await mcpClient.connectToServer("./build/index.js");
        console.log("MCP Client connected to server");
        console.log("Available tools:", mcpClient.tools.map(t => t.name).join(", "));
        // Health check endpoint
        const healthCheck = (req, res) => {
            res.json({ status: 'ok', tools: mcpClient.tools.map(t => t.name) });
        };
        app.get('/health', healthCheck);
        app.get('/authurl', (req, res) => {
            const authUrl = showAuthUrl();
            res.json({ authUrl });
        });
        app.get('/auth/callback', (req, res) => {
            console.log('Authorization callback received', req);
        });
        // LLM interaction endpoint
        const chatHandler = async (req, res) => {
            try {
                const { query } = req.body;
                if (!query) {
                    res.status(400).json({ error: 'Query is required' });
                    return;
                }
                const response = await mcpClient.processQuery(query);
                res.json({ response });
            }
            catch (error) {
                console.error('Error processing query:', error);
                res.status(500).json({ error: 'Failed to process query' });
            }
        };
        app.post('/chat', chatHandler);
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            console.log(`Health check: http://localhost:${port}/health`);
            console.log(`Chat endpoint: http://localhost:${port}/chat`);
        });
        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            await mcpClient.cleanup();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
main();
