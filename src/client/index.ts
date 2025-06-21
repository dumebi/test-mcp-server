// Anthropic SDK
import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// MCP Client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { google } from 'googleapis';


// Express
import express from "express";
import type { RequestHandler } from "express";
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

// class MCPClient {
//     private lauraMcp: Client;
//     private notionMcp: Client;
//     private githubMcp: Client;
//     private llm: Anthropic;
//     private lauraTransport: StdioClientTransport | null = null;
//     private notionTransport: StdioClientTransport | null = null;
//     private githubTransport: StdioClientTransport | null = null;
//     public tools: Tool[] = [];

//     constructor() {
//         this.llm = new Anthropic({
//             apiKey: ANTHROPIC_API_KEY,
//         });
//         this.lauraMcp = new Client({
//             name: "laura-google", version: "1.0.0"
//         }, {
//             capabilities: {
//                 tools: {}
//             }
//         })
//         this.notionMcp = new Client({
//             name: "laura-notion", version: "1.0.0"
//         }, {
//             capabilities: {
//                 tools: {}
//             }
//         })
//         this.githubMcp = new Client({
//             name: "laura-github", version: "1.0.0"
//         }, {
//             capabilities: {
//                 tools: {}
//             }
//         })

//     }
//     async connectToServer(serverScriptPath: string) {
//         try {
//             const isJs = serverScriptPath.endsWith(".js");
//             const isPy = serverScriptPath.endsWith(".py");
//             if (!isJs && !isPy) {
//                 throw new Error("Server script must be a .js or .py file");
//             }
//             const command = isPy
//                 ? process.platform === "win32"
//                     ? "python"
//                     : "python3"
//                 : process.execPath;

//             this.lauraTransport = new StdioClientTransport({
//                 command,
//                 args: [serverScriptPath],
//                 env: {
//                     ...process.env,
//                     "GOOGLE_CLIENT_ID": process.env.GOOGLE_CLIENT_ID || "",
//                     "GOOGLE_CLIENT_SECRET": process.env.GOOGLE_CLIENT_SECRET || "",
//                     "GOOGLE_REFRESH_TOKEN": process.env.GOOGLE_REFRESH_TOKEN || ""
//                 }
//             });

//             this.notionTransport = new StdioClientTransport({
//                 command: "npx",
//                 args: ["-y", "@notionhq/notion-mcp-server"],
//                 env: {
//                     ...process.env, // Include all existing environment variables
//                     "OPENAPI_MCP_HEADERS": process.env.OPENAPI_MCP_HEADERS || "",
//                 },
//             }); 
            
//             this.githubTransport = new StdioClientTransport({
//                 command: "npx",
//                 args: ["-y", "@notionhq/server-github"],
//                 env: {
//                     ...process.env, // Include all existing environment variables
//                     "GITHUB_PERSONAL_ACCESS_TOKEN": process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
//                 },
//             }); 
            
//             await this.notionMcp.connect(this.notionTransport);
//             await this.lauraMcp.connect(this.lauraTransport);
//             await this.githubMcp.connect(this.githubTransport);

//             const [notionMcpToolsResult, lauraMcpToolsResult, githubMcpToolsResult] = await Promise.all([
//                 this.notionMcp.listTools(),
//                 this.lauraMcp.listTools(),
//                 this.githubMcp.listTools()
//             ]);
//             // console.log({notionMcpToolsResult, lauraMcpToolsResult});
//             [...notionMcpToolsResult.tools, ...lauraMcpToolsResult.tools, ...githubMcpToolsResult.tools].map((tool) => {
//                 this.tools.push({
//                     name: tool.name,
//                     description: tool.description,
//                     input_schema: tool.inputSchema,
//                 });
//             });
//             console.log(
//                 "Connected to server with tools:",
//                 this.tools.map(({ name }) => name)
//             );
//         } catch (e) {
//             console.log("Failed to connect to MCP server: ", e);
//             throw e;
//         }
//     }


//     async processQuery(query: string) {
//         /**
//          * Process a query using Claude and available tools
//          * @param {string} query - The user query to process
//          * @returns {Promise<string>} - The final response text
//          */
        
//         let messages: MessageParam[] = [
//             {
//                 role: "user",
//                 content: query
//             }
//         ];

//         const finalText: string[] = [];
        
//         // Continue processing until we get a final text response without tool calls
//         while (true) {
//             console.log("Sending messages to Claude:", messages);
            
//             // Get response from Claude
//             let response = await this.llm.messages.create({
//                 model: "claude-sonnet-4-20250514",
//                 max_tokens: 2048,
//                 messages: messages,
//                 system: "You are a seasoned executive assistant for fortune 500 CEOs. Perform tasks with efficiency, if you do not know the answer to a question, ask for clarity. use system time for any date query",
//                 tools: this.tools
//             });

//             console.log("Claude response:", response);

//             // Build assistant message content for the conversation history
//             const assistantContent = [];
//             let hasToolCalls = false;

//             // Process each content block in the response
//             for (const content of response.content) {
//                 assistantContent.push(content);
                
//                 if (content.type === 'text') {
//                     console.log("Text content:", content.text);
//                     finalText.push(content.text);
//                 } else if (content.type === 'tool_use') {
//                     hasToolCalls = true;
//                     const toolName = content.name;
//                     const toolArgs = content.input as { [x: string]: unknown };

//                     console.log(`Executing tool: ${toolName} with args:`, toolArgs);

//                     try {
//                         // Execute tool call
//                         const result = await this.lauraMcp.callTool({
//                             name: toolName,
//                             arguments: toolArgs
//                         });

//                         console.log("Tool result:", result);

//                         // Add assistant message to conversation history
//                         messages.push({
//                             role: "assistant",
//                             content: assistantContent
//                         });

//                         // Add tool result to conversation history
//                         messages.push({
//                             role: "user",
//                             content: [
//                                 {
//                                     type: "tool_result",
//                                     tool_use_id: content.id,
//                                     content: result.content as string
//                                 }
//                             ]
//                         });

//                     } catch (error) {
//                         console.error("Tool execution error:", error);
                        
//                         // Add assistant message to conversation history
//                         messages.push({
//                             role: "assistant", 
//                             content: assistantContent
//                         });

//                         // Add error result to conversation history
//                         messages.push({
//                             role: "user",
//                             content: [
//                                 {
//                                     type: "tool_result",
//                                     tool_use_id: content.id,
//                                     content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
//                                     is_error: true
//                                 }
//                             ]
//                         });
//                     }
//                     break; // Process one tool call at a time
//                 }
//             }

//             // If no tool calls were made, we're done
//             if (!hasToolCalls) {
//                 // Add the final assistant message to history
//                 messages.push({
//                     role: "assistant",
//                     content: assistantContent
//                 });
//                 break;
//             }
//         }

//         return finalText.join("\n");
//     }

//     async cleanup() {
//         await this.lauraMcp.close();
//         await this.notionMcp.close();
//     }
// }



interface MCPServerConfig {
    name: string;
    client: Client;
    transport: StdioClientTransport | null;
    connection: {
        command: string;
        args: string[];
        env?: Record<string, string>;
    };
    toolPrefix?: string; // Optional prefix to identify tools from this server
    isConnected: boolean;
}

class MCPClient {
    private llm: Anthropic;
    private servers: Map<string, MCPServerConfig> = new Map();
    private toolToServerMap: Map<string, string> = new Map(); // Maps tool name to server name
    public tools: Tool[] = [];

    constructor() {
        this.llm = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
        
        // Initialize server configurations
        this.initializeServers();
    }

    private initializeServers() {
        // Laura Google MCP Server
        this.servers.set('laura-google', {
            name: 'laura-google',
            client: new Client({
                name: "laura-google", 
                version: "1.0.0"
            }, {
                capabilities: { tools: {} }
            }),
            transport: null,
            connection: {
                command: "", // Will be set dynamically in connectToServer
                args: [],
                env: {
                    "GOOGLE_CLIENT_ID": process.env.GOOGLE_CLIENT_ID || "",
                    "GOOGLE_CLIENT_SECRET": process.env.GOOGLE_CLIENT_SECRET || "",
                    "GOOGLE_REFRESH_TOKEN": process.env.GOOGLE_REFRESH_TOKEN || ""
                }
            },
            toolPrefix: 'laura-mcp:', // Tools from this server start with this prefix
            isConnected: false
        });

        // Notion MCP Server
        this.servers.set('notion', {
            name: 'notion',
            client: new Client({
                name: "laura-notion", 
                version: "1.0.0"
            }, {
                capabilities: { tools: {} }
            }),
            transport: null,
            connection: {
                command: "npx",
                args: ["-y", "@notionhq/notion-mcp-server"],
                env: {
                    "OPENAPI_MCP_HEADERS": process.env.OPENAPI_MCP_HEADERS || "",
                }
            },
            toolPrefix: 'notionApi:',
            isConnected: false
        });

        // GitHub MCP Server
        this.servers.set('github', {
            name: 'github',
            client: new Client({
                name: "laura-github", 
                version: "1.0.0"
            }, {
                capabilities: { tools: {} }
            }),
            transport: null,
            connection: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"],
                env: {
                    "GITHUB_PERSONAL_ACCESS_TOKEN": process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "",
                }
            },
            toolPrefix: 'github:',
            isConnected: false
        });
    }

    // Method to easily add new servers
    addServer(serverName: string, config: Omit<MCPServerConfig, 'name' | 'transport' | 'isConnected'>) {
        this.servers.set(serverName, {
            ...config,
            name: serverName,
            transport: null,
            isConnected: false
        });
    }

    async connectToServer(serverScriptPath?: string) {
        try {
            // Set up Laura Google server connection if script path provided
            if (serverScriptPath) {
                const isJs = serverScriptPath.endsWith(".js");
                const isPy = serverScriptPath.endsWith(".py");
                if (!isJs && !isPy) {
                    throw new Error("Server script must be a .js or .py file");
                }
                
                const command = isPy
                    ? process.platform === "win32" ? "python" : "python3"
                    : process.execPath;

                const lauraServer = this.servers.get('laura-google')!;
                lauraServer.connection.command = command;
                lauraServer.connection.args = [serverScriptPath];
            }

            // Connect to all servers
            const connectionPromises = Array.from(this.servers.entries()).map(
                async ([serverName, config]) => {
                    try {
                        // Skip laura-google if no script path provided
                        if (serverName === 'laura-google' && !serverScriptPath) {
                            console.log(`Skipping ${serverName} - no script path provided`);
                            return;
                        }

                        console.log(`Connecting to ${serverName}...`);
                        
                        // Create transport
                        config.transport = new StdioClientTransport({
                            command: config.connection.command,
                            args: config.connection.args,
                            env: Object.fromEntries(
                                Object.entries({
                                    ...process.env,
                                    ...config.connection.env
                                }).filter(([_, v]) => typeof v === "string" && v !== undefined)
                            ) as Record<string, string>
                        });

                        // Connect client
                        await config.client.connect(config.transport);
                        config.isConnected = true;

                        // Get tools from this server
                        const toolsResult = await config.client.listTools();
                        
                        // Map tools to this server and add to global tools list
                        toolsResult.tools.forEach(tool => {
                            this.toolToServerMap.set(tool.name, serverName);
                            this.tools.push({
                                name: tool.name,
                                description: tool.description,
                                input_schema: tool.inputSchema,
                            });
                        });

                        console.log(`✅ Connected to ${serverName} with ${toolsResult.tools.length} tools`);
                        
                    } catch (error) {
                        console.error(`❌ Failed to connect to ${serverName}:`, error);
                        config.isConnected = false;
                        // Continue with other servers even if one fails
                    }
                }
            );

            await Promise.allSettled(connectionPromises);

            // console.log(
            //     "🚀 MCP Client initialized with tools:",
            //     this.tools.map(({ name }) => name)
            // );
            
            console.log(
                "📊 Connected servers:",
                Array.from(this.servers.entries())
                    .filter(([_, config]) => config.isConnected)
                    .map(([name]) => name)
            );

        } catch (e) {
            console.log("Failed to connect to MCP servers: ", e);
            throw e;
        }
    }

    // Method to get the appropriate client for a tool
    private getClientForTool(toolName: string): Client {
        const serverName = this.toolToServerMap.get(toolName);
        
        if (!serverName) {
            // Fallback: try to match by prefix
            for (const [name, config] of this.servers.entries()) {
                if (config.toolPrefix && toolName.startsWith(config.toolPrefix)) {
                    return config.client;
                }
            }
            throw new Error(`No server found for tool: ${toolName}`);
        }

        const server = this.servers.get(serverName);
        if (!server || !server.isConnected) {
            throw new Error(`Server ${serverName} is not connected for tool: ${toolName}`);
        }

        return server.client;
    }

    async processQuery(query: string) {
        let messages: MessageParam[] = [
            {
                role: "user",
                content: query
            }
        ];

        const finalText: string[] = [];
        
        while (true) {
            console.log("Sending messages to Claude:", messages);
            
            let response = await this.llm.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                stream: false,
                messages: messages,
                system: "You are a seasoned executive assistant for fortune 500 CEOs. Perform tasks with efficiency, if you do not know the answer to a question, ask for clarity. use system time for any date query",
                tools: this.tools
            });

            console.log("Claude response:", response);

            const assistantContent = [];
            let hasToolCalls = false;

            for (const content of response.content) {
                assistantContent.push(content);
                
                if (content.type === 'text') {
                    console.log("Text content:", content.text);
                    finalText.push(content.text);
                } else if (content.type === 'tool_use') {
                    hasToolCalls = true;
                    const toolName = content.name;
                    const toolArgs = content.input as { [x: string]: unknown };

                    console.log(`Executing tool: ${toolName} with args:`, toolArgs);

                    try {
                        // Get the appropriate client for this tool
                        const client = this.getClientForTool(toolName);
                        
                        // Execute tool call on the correct client
                        const result = await client.callTool({
                            name: toolName,
                            arguments: toolArgs
                        });

                        console.log("Tool result:", result);

                        messages.push({
                            role: "assistant",
                            content: assistantContent
                        });

                        messages.push({
                            role: "user",
                            content: [
                                {
                                    type: "tool_result",
                                    tool_use_id: content.id,
                                    content: result.content as string
                                }
                            ]
                        });

                    } catch (error) {
                        console.error("Tool execution error:", error);
                        
                        messages.push({
                            role: "assistant", 
                            content: assistantContent
                        });

                        messages.push({
                            role: "user",
                            content: [
                                {
                                    type: "tool_result",
                                    tool_use_id: content.id,
                                    content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
                                    is_error: true
                                }
                            ]
                        });
                    }
                    break;
                }
            }

            if (!hasToolCalls) {
                messages.push({
                    role: "assistant",
                    content: assistantContent
                });
                break;
            }
        }

        return finalText.join("\n");
    }

    // Method to check server status
    getServerStatus() {
        const status: Record<string, boolean> = {};
        this.servers.forEach((config, name) => {
            status[name] = config.isConnected;
        });
        return status;
    }

    // Method to get tools by server
    getToolsByServer() {
        const toolsByServer: Record<string, string[]> = {};
        this.toolToServerMap.forEach((serverName, toolName) => {
            if (!toolsByServer[serverName]) {
                toolsByServer[serverName] = [];
            }
            toolsByServer[serverName].push(toolName);
        });
        return toolsByServer;
    }

    async cleanup() {
        const cleanupPromises = Array.from(this.servers.values()).map(async (config) => {
            if (config.isConnected) {
                try {
                    await config.client.close();
                    config.isConnected = false;
                } catch (error) {
                    console.error(`Error closing ${config.name}:`, error);
                }
            }
        });

        await Promise.allSettled(cleanupPromises);
        console.log("🧹 All MCP clients cleaned up");
    }
}

const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

const googleProviderScopes = {
    contacts: [
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts",],
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
}

function getAuthUrl(): string {
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

function showAuthUrl(): string {
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

// async function example() {
//     const mcpClient = new MCPClient();
    
//     // You can easily add new servers
//     mcpClient.addServer('slack', {
//         client: new Client({ name: "slack-mcp", version: "1.0.0" }, { capabilities: { tools: {} } }),
//         connection: {
//             command: "npx",
//             args: ["-y", "@slack/mcp-server"],
//             env: {
//                 "SLACK_BOT_TOKEN": process.env.SLACK_BOT_TOKEN || "",
//             }
//         },
//         toolPrefix: 'slack-mcp:'
//     });

//     // Connect to servers
//     await mcpClient.connectToServer("path/to/laura-server.js");
    
//     // Check status
//     console.log("Server status:", mcpClient.getServerStatus());
//     console.log("Tools by server:", mcpClient.getToolsByServer());
    
//     // Process queries
//     const response = await mcpClient.processQuery("List my events for today");
    
//     // Cleanup
//     await mcpClient.cleanup();
// }

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
        // console.log("MCP Client connected to server");
        // console.log("Available tools:", mcpClient.tools.map(t => t.name).join(", "));
        console.log("Server status:", mcpClient.getServerStatus());
        // console.log("Tools by server:", mcpClient.getToolsByServer());
        // Health check endpoint
        const healthCheck: RequestHandler = (req, res) => {
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
                    console.log({installOptions})
                    return await `state-${now}-${Math.random().toString(36).substring(2, 15)}`;
                },
                async verifyStateParam(now, state) {
                    console.log({state})
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
                    console.log({installation});
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
                deleteInstallation: async (installQuery) => {},
            },
            logLevel: LogLevel.DEBUG,
        });
        
        app.get('/health', healthCheck);
        
        app.get('/auth/google/callback', async (req, res) => {
            const {code} = req.query;
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: 'Authorization code is required' });
                return;
            }
            console.log('Authorization code received:', code);
            const { tokens } = await auth.getToken(code);
            console.log({refresh: tokens.refresh_token});
            // Update .env file with the refresh token
            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
            // Replace existing refresh token
            envContent = envContent.replace(
                /GOOGLE_REFRESH_TOKEN=.*(\r?\n|$)/,
                `GOOGLE_REFRESH_TOKEN='${tokens.refresh_token}'$1`
            );
            } else {
            // Add refresh token
            envContent += `\nGOOGLE_REFRESH_TOKEN='${tokens.refresh_token}'\n`;
            }
            
            // Write updated content back to .env file
            fs.writeFileSync(envPath, envContent);
            res.status(200).json({ message: 'Authorization successful. Refresh token saved.' });
        });

        app.get('/auth/slack/callback', async (req, res) => {
            await installer.handleCallback(req, res);
            const result = await installer.authorize({teamId: 'my-team-ID', isEnterpriseInstall: false, userId: 'my-user-ID', enterpriseId: 'my-enterprise-ID'});
            console.log({result})
        });

        app.get('/auth/notion/callback', async (req, res) => {
            const {code} = req.query;
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
                } else {
                    console.log('Notion token received:', data);
                    // Update .env file with the access token
                    const envPath = path.resolve(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    
                    if (envContent.includes('NOTION_ACCESS_TOKEN=')) {
                        // Replace existing access token
                        envContent = envContent.replace(
                            /NOTION_ACCESS_TOKEN=.*(\r?\n|$)/,
                            `NOTION_ACCESS_TOKEN='${data.access_token}'$1`
                        );
                    } else {
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
            const {code} = req.query;
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
                } else {
                    console.log('Github token received:', data);
                    // Update .env file with the access token
                    const envPath = path.resolve(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    
                    if (envContent.includes('GITHUB_ACCESS_TOKEN=')) {
                        // Replace existing access token
                        envContent = envContent.replace(
                            /NOTION_ACCESS_TOKEN=.*(\r?\n|$)/,
                            `GITHUB_ACCESS_TOKEN='${data.access_token}'$1`
                        );
                    } else {
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
            await installer.handleInstallPath(req, res, {},
                {
                    scopes,
                    userScopes,
                },
            );
        });

        app.get('/auth/github', async (req, res) => {
            res.json({ url: `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&scope=user` });
        });

        // LLM interaction endpoint
        const chatHandler: RequestHandler = async (req, res) => {
            try {
                const { query } = req.body;
                if (!query) {
                    res.status(400).json({ error: 'Query is required' });
                    return;
                }

                const response = await mcpClient.processQuery(query);
                res.json({ response });
            } catch (error) {
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

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();