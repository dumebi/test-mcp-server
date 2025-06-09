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
import * as fs from 'fs';
import * as path from 'path';
import pkg from '@slack/oauth';
import { createEventAdapter } from '@slack/events-api';
import axios from "axios";
const { InstallProvider, LogLevel, FileInstallationStore } = pkg;
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
            name: "laura-ai", version: "1.0.0"
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
            model: "claude-sonnet-4-20250514",
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
const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
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
    if (!auth) {
        throw new Error('Auth client not initialized');
    }
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
    // app.use('/slack/events', slackEvents.requestListener());
    const mcpClient = new MCPClient();
    try {
        await mcpClient.connectToServer("./build/index.js");
        console.log("MCP Client connected to server");
        console.log("Available tools:", mcpClient.tools.map(t => t.name).join(", "));
        // Health check endpoint
        const healthCheck = (req, res) => {
            res.json({ status: 'ok', tools: mcpClient.tools.map(t => t.name) });
        };
        const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
        if (!slackSigningSecret) {
            throw new Error("SLACK_SIGNING_SECRET is not set");
        }
        const slackEvents = createEventAdapter(slackSigningSecret, {
            includeBody: true,
        });
        const scopes = [
            'app_mentions:read',
            'channels:read',
            'groups:read',
            'channels:manage',
            'chat:write',
            'incoming-webhook',
        ];
        const userScopes = ['chat:write'];
        const slackClientId = process.env.SLACK_CLIENT_ID;
        const slackClientSecret = process.env.SLACK_CLIENT_SECRET;
        const slackStateSecret = process.env.SLACK_STATE_SECRET;
        if (!slackClientId) {
            throw new Error("SLACK_CLIENT_ID is not set");
        }
        if (!slackClientSecret) {
            throw new Error("SLACK_CLIENT_SECRET is not set");
        }
        if (!slackStateSecret) {
            throw new Error("SLACK_STATE_SECRET is not set");
        }
        const installer = new InstallProvider({
            clientId: slackClientId,
            clientSecret: slackClientSecret,
            authVersion: 'v2',
            stateSecret: "slackStateSecret",
            stateStore: {
                async generateStateParam(installOptions, now) {
                    console.log({ installOptions });
                    return await `state-${now}-${Math.random().toString(36).substring(2, 15)}`;
                },
                async verifyStateParam(now, state) {
                    console.log({ state });
                    const parts = state.split('-');
                    if (parts.length < 3 || parts[0] !== 'state') {
                        throw new Error('Invalid state parameter');
                    }
                    const timestamp = parseInt(parts[1], 10);
                    if (isNaN(timestamp) || now.getTime() - timestamp > 10 * 60 * 1000) { // 10 minutes
                        throw new Error('State parameter expired');
                    }
                    return {
                        scopes,
                        userScopes,
                        redirectUri: '/auth/slack/callback',
                        isEnterpriseInstall: false,
                        // Optionally add teamId, metadata, etc. if needed
                    };
                },
            },
            installationStore: {
                storeInstallation: async (installation) => {
                    console.log({ installation });
                },
                fetchInstallation: async (installQuery, logger) => {
                    return {
                        team: {
                            id: "dummy-team-id",
                            name: "Dummy Team"
                        },
                        enterprise: installQuery.isEnterpriseInstall
                            ? {
                                id: "dummy-enterprise-id",
                                name: "Dummy Enterprise"
                            }
                            : undefined,
                        isEnterpriseInstall: false,
                        user: {
                            id: "dummy-user-id",
                            token: "dummy-user-token",
                            refreshToken: "dummy-refresh-token",
                            expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
                            scopes: ["chat:write"],
                        },
                        tokenType: "bot",
                        appId: "dummy-app-id",
                        authVersion: "v2",
                        bot: {
                            scopes: ["chat:write"],
                            token: "dummy-bot-token",
                            refreshToken: "dummy-bot-refresh-token",
                            expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
                            id: "dummy-bot-id",
                            userId: "dummy-bot-user-id"
                        }
                    };
                },
                deleteInstallation: async (installQuery) => { },
            },
            logLevel: LogLevel.DEBUG,
        });
        app.get('/health', healthCheck);
        app.get('/auth/google/callback', async (req, res) => {
            const { code } = req.query;
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: 'Authorization code is required' });
                return;
            }
            console.log('Authorization code received:', code);
            const { tokens } = await auth.getToken(code);
            console.log({ refresh: tokens.refresh_token });
            // Update .env file with the refresh token
            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                // Replace existing refresh token
                envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*(\r?\n|$)/, `GOOGLE_REFRESH_TOKEN='${tokens.refresh_token}'$1`);
            }
            else {
                // Add refresh token
                envContent += `\nGOOGLE_REFRESH_TOKEN='${tokens.refresh_token}'\n`;
            }
            // Write updated content back to .env file
            fs.writeFileSync(envPath, envContent);
            res.status(200).json({ message: 'Authorization successful. Refresh token saved.' });
        });
        app.get('/auth/slack/callback', async (req, res) => {
            await installer.handleCallback(req, res);
            const result = await installer.authorize({ teamId: 'my-team-ID', isEnterpriseInstall: false, userId: 'my-user-ID', enterpriseId: 'my-enterprise-ID' });
            console.log({ result });
        });
        app.get('/auth/notion/callback', async (req, res) => {
            const { code } = req.query;
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: 'Authorization code is required' });
                return;
            }
            console.log('Authorization code received:', code);
            const encoded = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
            console.log('Encoded credentials:', encoded);
            // Fetch Notion access token
            if (!process.env.NOTION_CLIENT_ID || !process.env.NOTION_CLIENT_SECRET) {
                res.status(500).json({ error: 'Notion client ID and secret are not set' });
                return;
            }
            fetch('https://api.notion.com/v1/oauth/token', {
                method: 'POST',
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    'Authorization': `Basic ${encoded}`,
                },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: process.env.NOTION_REDIRECT_URI,
                }),
            })
                .then(response => response.json())
                .then(data => {
                if (data.error) {
                    console.error('Error fetching Notion token:', data.error);
                    res.status(500).json({ error: 'Failed to fetch Notion token' });
                }
                else {
                    console.log('Notion token received:', data);
                    // Update .env file with the access token
                    const envPath = path.resolve(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    if (envContent.includes('NOTION_ACCESS_TOKEN=')) {
                        // Replace existing access token
                        envContent = envContent.replace(/NOTION_ACCESS_TOKEN=.*(\r?\n|$)/, `NOTION_ACCESS_TOKEN='${data.access_token}'$1`);
                    }
                    else {
                        // Add access token
                        envContent += `\nNOTION_ACCESS_TOKEN=${data.access_token}\n`;
                    }
                    // Write updated content back to .env file
                    fs.writeFileSync(envPath, envContent);
                    res.status(200).json({ message: 'Authorization successful. Access token saved.' });
                }
            })
                .catch(error => {
                console.error('Error during Notion token fetch:', error);
                res.status(500).json({ error: 'Failed to fetch Notion token' });
            });
        });
        app.get('/auth/github/callback', async (req, res) => {
            const { code } = req.query;
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: 'Authorization code is required' });
                return;
            }
            console.log('Authorization code received:', code);
            // Fetch Github access token
            if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
                res.status(500).json({ error: 'Notion client ID and secret are not set' });
                return;
            }
            axios.post('https://github.com/login/oauth/access_token', null, {
                params: {
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code,
                    redirect_uri: process.env.GITHUB_REDIRECT_URI,
                },
                headers: {
                    Accept: 'application/json',
                },
            })
                .then(response => response.data)
                .then(data => {
                if (data.error) {
                    console.error('Error fetching Github token:', data.error);
                    res.status(500).json({ error: 'Failed to fetch Github token' });
                }
                else {
                    console.log('Github token received:', data);
                    // Update .env file with the access token
                    const envPath = path.resolve(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    if (envContent.includes('GITHUB_ACCESS_TOKEN=')) {
                        // Replace existing access token
                        envContent = envContent.replace(/NOTION_ACCESS_TOKEN=.*(\r?\n|$)/, `GITHUB_ACCESS_TOKEN='${data.access_token}'$1`);
                    }
                    else {
                        // Add access token
                        envContent += `\nGITHUB_ACCESS_TOKEN=${data.access_token}\n`;
                    }
                    // Write updated content back to .env file
                    fs.writeFileSync(envPath, envContent);
                    res.status(200).json({ message: 'Authorization successful. Access token saved.' });
                }
            })
                .catch(error => {
                console.error('Error during Github token fetch:', error);
                res.status(500).json({ error: 'Failed to fetch Github token' });
            });
        });
        app.get('/auth/google', (req, res) => {
            const authUrl = showAuthUrl();
            res.json({ authUrl });
        });
        app.get('/auth/notion', (req, res) => {
            res.json({ url: `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${process.env.NOTION_REDIRECT_URI}` });
        });
        app.get('/auth/slack', async (req, res) => {
            await installer.handleInstallPath(req, res, {}, {
                scopes,
                userScopes,
            });
        });
        app.get('/auth/github', async (req, res) => {
            res.json({ url: `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&scope=user` });
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
