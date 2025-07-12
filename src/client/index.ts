// Extensible Multi-User MCP Client - Provider-agnostic design
// import { Anthropic } from "@anthropic-ai/sdk";
// import {
//     MessageParam,
//     Tool,
// } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
// import { v4 as uuidv4 } from 'uuid';
// import * as fs from 'fs';
// import * as path from 'path';
// import dotenv from "dotenv";

// dotenv.config();

import { Anthropic } from "@anthropic-ai/sdk";
import {
    MessageParam,
    Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// MCP Client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

import { TwitterService, TwitterOAuth2Scopes } from "../providers/twitterProvider.js";

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
const twitterService = new TwitterService();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}

// Extensible credential structure
interface ProviderCredentials {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    apiSecret?: string;
    username?: string;
    email?: string;
    teamId?: string;
    workspaceId?: string;
    displayName?: string;
    accountType?: 'personal' | 'work' | 'business' | 'other';
    expiresAt?: number;
    metadata?: Record<string, any>; // For any provider-specific data
    accountId?: string; // Unique identifier for this account (email, username, etc.)
}

interface UserCredentials {
    userId: string;
    providers: Record<string, Record<string, ProviderCredentials>>; // provider -> accountId -> credentials
}

interface SessionContext {
    sessionId: string;
    userId: string;
    activeProviders: Record<string, string>; // provider -> accountId
    messages: MessageParam[];
    lastActivity: Date;
}

interface MCPServerConfig {
    name: string;
    client: Client;
    transport: StdioClientTransport | SSEClientTransport | null;
    connection: {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        transport?: string; // Fixed typo from "transort"
        url?: string;
        serverScriptPath?: string;
    };
    toolPrefix?: string;
    isConnected: boolean;
    userId?: string;
    provider?: string; // Track which provider this server serves
}

interface SSEEvent {
    type: 'session_created' | 'thinking' | 'tool_call' | 'tool_result' | 'text_chunk' | 'complete' | 'error' | 'account_selection';
    data: any;
    sessionId?: string;
}

// Provider configuration interface
interface ProviderConfig {
    name: string;
    serverConfig: {
        serverScriptPath?: string;
        command?: string;
        args?: string[];
        transport?: string;
        url?: string;
    };
    toolPrefix: string;
    envMapping: (credentials: ProviderCredentials) => Record<string, string>;
    isShared?: boolean; // Whether this provider doesn't need user-specific credentials
}

class ExtensibleMCPClient {
    private llm: Anthropic;
    private userCredentials: Map<string, UserCredentials> = new Map();
    private serverPools: Map<string, Map<string, MCPServerConfig>> = new Map(); // provider -> accountKey -> config
    private sessions: Map<string, SessionContext> = new Map();
    private toolToServerMap: Map<string, { provider: string, accountKey?: string }> = new Map();
    private providerConfigs: Map<string, ProviderConfig> = new Map();
    public tools: Tool[] = [];
    
    private credentialsStore: string;
    private sessionsStore: string;
    private systemPrompt: string = '';

    constructor() {
        this.llm = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
        
        this.credentialsStore = path.join(process.cwd(), 'user-credentials.json');
        this.sessionsStore = path.join(process.cwd(), 'user-sessions.json');
        
        this.initializeStores();
        this.loadSystemPrompt();
        this.loadCredentials();
        this.loadSessions();
        this.initializeProviders();
        this.initializeServerPools();
    }

    // Initialize provider configurations - extensible like your original initializeServers
    private initializeProviders() {
        // Google provider
        this.providerConfigs.set('google', {
            name: 'google',
            serverConfig: {
                serverScriptPath: "./build/servers/google.js"
            },
            toolPrefix: 'laura-mcp:',
            envMapping: (creds) => ({
                "GOOGLE_CLIENT_ID": process.env.GOOGLE_CLIENT_ID || "",
                "GOOGLE_CLIENT_SECRET": process.env.GOOGLE_CLIENT_SECRET || "",
                "GOOGLE_REFRESH_TOKEN": creds.refreshToken || ""
            })
        });

        // Twitter provider
        this.providerConfigs.set('twitter', {
            name: 'twitter',
            serverConfig: {
                serverScriptPath: "./build/servers/twitter.js"
            },
            toolPrefix: 'laura-twitter:',
            envMapping: (creds) => ({
                "TWITTER_ACCESS_TOKEN": creds.accessToken || "",
                "TWITTER_API_KEY": process.env.TWITTER_API_KEY || "",
                "TWITTER_API_KEY_SECRET": process.env.TWITTER_API_KEY_SECRET || ""
            })
        });

        // Notion provider
        this.providerConfigs.set('notion', {
            name: 'notion',
            serverConfig: {
                command: "npx",
                args: ["-y", "@notionhq/notion-mcp-server"]
            },
            toolPrefix: 'notionApi:',
            envMapping: (creds) => ({
                "OPENAPI_MCP_HEADERS": JSON.stringify({
                    "Authorization": `Bearer ${creds.accessToken}`,
                    "Notion-Version": "2022-06-28"
                })
            })
        });

        // GitHub provider
        this.providerConfigs.set('github', {
            name: 'github',
            serverConfig: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"]
            },
            toolPrefix: 'github:',
            envMapping: (creds) => ({
                "GITHUB_PERSONAL_ACCESS_TOKEN": creds.accessToken || ""
            })
        });

        // Slack provider
        this.providerConfigs.set('slack', {
            name: 'slack',
            serverConfig: {
                serverScriptPath: "./build/servers/slack.js"
            },
            toolPrefix: 'slack-mcp:',
            envMapping: (creds) => ({
                "SLACK_BOT_TOKEN": creds.accessToken || "",
                "SLACK_TEAM_ID": creds.teamId || ""
            })
        });

        // Time provider (shared)
        this.providerConfigs.set('time', {
            name: 'time',
            serverConfig: {
                serverScriptPath: "./build/servers/time.js"
            },
            toolPrefix: 'laura-time:',
            envMapping: () => ({}),
            isShared: true
        });

        // Playwright provider (shared)
        // this.providerConfigs.set('playwright', {
        //     name: 'playwright',
        //     serverConfig: {
        //         command: "npx",
        //         args: ["@playwright/mcp@latest"]
        //     },
        //     toolPrefix: 'playwright:',
        //     envMapping: () => ({}),
        //     isShared: true
        // });

        // Brave Search provider (shared)
        // this.providerConfigs.set('brave-search', {
        //     name: 'brave-search',
        //     serverConfig: {
        //         serverScriptPath: "./build/servers/brave-search.js"
        //     },
        //     toolPrefix: 'brave-search:',
        //     envMapping: () => ({
        //         "BRAVE_API_KEY": process.env.BRAVE_API_KEY || ""
        //     }),
        //     isShared: true
        // });

        console.log(`🔧 Initialized ${this.providerConfigs.size} provider configurations`);
    }

    // Method to easily add new providers - just like your addServer method
    addProvider(providerName: string, config: ProviderConfig) {
        this.providerConfigs.set(providerName, config);
        this.serverPools.set(providerName, new Map());
        console.log(`➕ Added provider: ${providerName}`);
    }

    private async initializeStores() {
        [this.credentialsStore, this.sessionsStore].forEach(file => {
            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, '{}', 'utf8');
            }
        });
    }

    private loadSystemPrompt() {
        try {
            const promptPath = path.join(process.cwd(), 'system-prompt.txt');
            this.systemPrompt = fs.readFileSync(promptPath, 'utf8').trim();
            console.log('✅ System prompt loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load system prompt file:', error);
            this.systemPrompt = 'You are Laura, a professional executive assistant. Provide helpful, accurate, and professional assistance.';
        }
    }

    private async loadCredentials() {
        try {
            const data = fs.readFileSync(this.credentialsStore, 'utf8');
            const credentials = JSON.parse(data);
            Object.entries(credentials).forEach(([userId, creds]) => {
                this.userCredentials.set(userId, creds as UserCredentials);
            });
            console.log(`📋 Loaded credentials for ${this.userCredentials.size} users`);
        } catch (error) {
            console.log('📋 No existing credentials file found, starting fresh');
        }
    }

    private async saveCredentials() {
        const credentialsObj = Object.fromEntries(this.userCredentials);
        fs.writeFileSync(this.credentialsStore, JSON.stringify(credentialsObj, null, 2));
    }

    private async loadSessions() {
        try {
            const data = fs.readFileSync(this.sessionsStore, 'utf8');
            const sessions = JSON.parse(data);
            Object.values(sessions).forEach((session: any) => {
                session.lastActivity = new Date(session.lastActivity);
                this.sessions.set(session.sessionId, session as SessionContext);
            });
            console.log(`💬 Loaded ${this.sessions.size} active sessions`);
        } catch (error) {
            console.log('💬 No existing sessions file found, starting fresh');
        }
    }

    private async saveSessions() {
        const sessionsObj = Object.fromEntries(this.sessions);
        fs.writeFileSync(this.sessionsStore, JSON.stringify(sessionsObj, null, 2));
    }

    private initializeServerPools() {
        // Initialize empty pools for each provider
        this.providerConfigs.forEach((config, providerName) => {
            this.serverPools.set(providerName, new Map());
        });
    }

    // Smart account ID generation based on provider and credentials
    private generateAccountId(provider: string, credentials: ProviderCredentials): string {
        // Use email as primary identifier if available
        if (credentials.email) {
            return credentials.email.toLowerCase();
        }
        
        // Use username for platforms like Twitter, GitHub
        if (credentials.username) {
            return credentials.username.toLowerCase();
        }
        
        // Use teamId for team-based platforms like Slack
        if (credentials.teamId) {
            return credentials.teamId;
        }
        
        // Use workspaceId for workspace-based platforms like Notion
        if (credentials.workspaceId) {
            return credentials.workspaceId;
        }
        
        // Fallback to accountType + timestamp
        return `${credentials.accountType || 'account'}-${Date.now()}`;
    }

    // Smart account type detection based on email domain
    private detectAccountType(credentials: ProviderCredentials): 'personal' | 'work' | 'business' | 'other' {
        if (credentials.accountType) {
            return credentials.accountType;
        }
        
        if (credentials.email) {
            const domain = credentials.email.split('@')[1]?.toLowerCase();
            
            // Common personal email domains
            const personalDomains = [
                'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
                'icloud.com', 'me.com', 'aol.com', 'protonmail.com'
            ];
            
            if (personalDomains.includes(domain)) {
                return 'personal';
            }
            
            // Everything else is likely work/business
            return 'work';
        }
        
        return 'other';
    }

    // Generate display name for account
    private generateDisplayName(provider: string, credentials: ProviderCredentials): string {
        if (credentials.displayName) {
            return credentials.displayName;
        }
        
        const accountType = this.detectAccountType(credentials);
        const typeLabel = accountType === 'personal' ? 'Personal' : 
                         accountType === 'work' ? 'Work' : 
                         accountType === 'business' ? 'Business' : '';
        
        if (credentials.email) {
            return typeLabel ? `${typeLabel} (${credentials.email})` : credentials.email;
        }
        
        if (credentials.username) {
            return typeLabel ? `${typeLabel} @${credentials.username}` : `@${credentials.username}`;
        }
        
        return typeLabel ? `${typeLabel} ${provider}` : `${provider} account`;
    }

    // PUBLIC API: Set credentials for a user and provider (supports multiple accounts)
    async setUserCredentials(
        userId: string, 
        provider: string, 
        credentials: ProviderCredentials
    ): Promise<{ accountId: string; isNew: boolean }> {
        // Auto-detect account type and generate account ID
        credentials.accountType = this.detectAccountType(credentials);
        const accountId = this.generateAccountId(provider, credentials);
        credentials.accountId = accountId;
        credentials.displayName = this.generateDisplayName(provider, credentials);
        
        let userCreds = this.userCredentials.get(userId) || { 
            userId, 
            providers: {} 
        };
        
        // Initialize provider if it doesn't exist
        if (!userCreds.providers[provider]) {
            userCreds.providers[provider] = {};
        }
        
        // Check if this is an update or new account
        const isNew = !userCreds.providers[provider][accountId];
        
        // Store credentials
        userCreds.providers[provider][accountId] = credentials;
        this.userCredentials.set(userId, userCreds);
        await this.saveCredentials();
        
        console.log(`🔐 ${isNew ? 'Added' : 'Updated'} ${provider} account ${accountId} for user ${userId} (${credentials.accountType})`);
        
        // Create server connection for this user/provider/account
        await this.createUserServerConnection(userId, provider, accountId);
        
        return { accountId, isNew };
    }

    // PUBLIC API: Connect to all servers - like your original connectToServer
    async connectToServer() {
        console.log('🔄 Connecting to MCP servers...');
        
        // Connect shared providers first
        await this.connectSharedProviders();
        
        // Connect user-specific providers
        for (const [userId, userCreds] of this.userCredentials) {
            for (const [providerName, accounts] of Object.entries(userCreds.providers)) {
                for (const accountId of Object.keys(accounts)) {
                    await this.createUserServerConnection(userId, providerName, accountId);
                }
            }
        }

        await this.updateToolsList();
        console.log(`📊 Total tools available: ${this.tools.length}`);
        this.logServerStatus();
    }

    private async connectSharedProviders() {
        for (const [providerName, config] of this.providerConfigs) {
            if (config.isShared) {
                await this.createSharedServerConnection(providerName, config);
            }
        }
    }

    private async createSharedServerConnection(providerName: string, config: ProviderConfig) {
        const serverConfig: MCPServerConfig = {
            name: config.name,
            client: new Client({
                name: config.name,
                version: "1.0.0"
            }, { capabilities: { tools: {} } }),
            transport: null,
            connection: {
                command: config.serverConfig.command || (config.serverConfig.serverScriptPath ? process.execPath : "npx"),
                args: config.serverConfig.args || (config.serverConfig.serverScriptPath ? [config.serverConfig.serverScriptPath] : []),
                env: config.envMapping({}),
                transport: config.serverConfig.transport,
                url: config.serverConfig.url,
                serverScriptPath: config.serverConfig.serverScriptPath
            },
            toolPrefix: config.toolPrefix,
            isConnected: false,
            provider: providerName
        };

        try {
            if (serverConfig.connection.transport === "sse") {
                serverConfig.transport = new SSEClientTransport(
                    new URL(serverConfig.connection.url || ""), {}
                );
            } else {
                serverConfig.transport = new StdioClientTransport({
                    command: serverConfig.connection.command || "npx",
                    args: serverConfig.connection.args,
                    env: Object.fromEntries(
                        Object.entries({
                            ...process.env,
                            ...serverConfig.connection.env
                        }).filter(([_, v]) => typeof v === 'string' && v !== undefined)
                        .map(([k, v]) => [k, v as string])
                    )
                });
            }

            await serverConfig.client.connect(serverConfig.transport);
            serverConfig.isConnected = true;

            const providerPool = this.serverPools.get(providerName)!;
            providerPool.set('shared', serverConfig);

            console.log(`✅ Connected shared ${providerName} server`);
        } catch (error) {
            console.error(`❌ Failed to connect shared ${providerName} server:`, error);
        }
    }

    private async createUserServerConnection(userId: string, providerName: string, accountId: string) {
        const userCreds = this.userCredentials.get(userId);
        const providerConfig = this.providerConfigs.get(providerName);
        
        if (!userCreds?.providers[providerName]?.[accountId] || !providerConfig) return;

        const providerPool = this.serverPools.get(providerName);
        if (!providerPool) return;

        const credentials = userCreds.providers[providerName][accountId];
        const accountKey = `${userId}:${accountId}`; // Unique key for this user+account combo
        
        const serverConfig: MCPServerConfig = {
            name: `${providerName}-${userId}-${accountId}`,
            client: new Client({
                name: `${providerName}-${userId}-${accountId}`,
                version: "1.0.0"
            }, { capabilities: { tools: {} } }),
            transport: null,
            connection: {
                command: providerConfig.serverConfig.command || (providerConfig.serverConfig.serverScriptPath ? process.execPath : "npx"),
                args: providerConfig.serverConfig.args || (providerConfig.serverConfig.serverScriptPath ? [providerConfig.serverConfig.serverScriptPath] : []),
                env: providerConfig.envMapping(credentials),
                transport: providerConfig.serverConfig.transport,
                url: providerConfig.serverConfig.url,
                serverScriptPath: providerConfig.serverConfig.serverScriptPath
            },
            toolPrefix: providerConfig.toolPrefix,
            isConnected: false,
            userId,
            provider: providerName
        };

        try {
            if (serverConfig.connection.transport === "sse") {
                serverConfig.transport = new SSEClientTransport(
                    new URL(serverConfig.connection.url || ""), {}
                );
            } else {
                serverConfig.transport = new StdioClientTransport({
                    command: serverConfig.connection.command || "npx",
                    args: serverConfig.connection.args,
                    env: Object.fromEntries(
                        Object.entries({
                            ...process.env,
                            ...serverConfig.connection.env
                        })
                        .filter(([_, v]) => typeof v === 'string' && v !== undefined)
                        .map(([k, v]) => [k, v as string])
                    )
                });
            }

            await serverConfig.client.connect(serverConfig.transport);
            serverConfig.isConnected = true;
            providerPool.set(accountKey, serverConfig);

            console.log(`✅ Connected ${providerName}:${accountId} for user ${userId}`);
        } catch (error) {
            console.error(`❌ Failed to connect ${providerName}:${accountId} for user ${userId}:`, error);
        }
    }

    private async updateToolsList() {
        this.tools = [];
        this.toolToServerMap.clear();

        const toolPromises: Promise<void>[] = [];

        this.serverPools.forEach((providerPool, providerName) => {
            providerPool.forEach((serverConfig, accountKey) => {
                if (serverConfig.isConnected) {
                    const promise = this.getToolsFromServer(serverConfig).then(tools => {
                        tools.forEach(tool => {
                            this.toolToServerMap.set(tool.name, { 
                                provider: providerName, 
                                accountKey: accountKey === 'shared' ? undefined : accountKey 
                            });
                            this.tools.push(tool);
                        });
                    });
                    toolPromises.push(promise);
                }
            });
        });

        await Promise.allSettled(toolPromises);
    }

    private async getToolsFromServer(serverConfig: MCPServerConfig): Promise<Tool[]> {
        try {
            const toolsResult = await serverConfig.client.listTools();
            return toolsResult.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
            }));
        } catch (error) {
            console.error(`Error getting tools from ${serverConfig.name}:`, error);
            return [];
        }
    }

    // Enhanced system prompt with user context
    private getSystemPromptWithContext(sessionContext: SessionContext): string {
        const userCreds = this.userCredentials.get(sessionContext.userId);
        if (!userCreds || Object.keys(userCreds.providers).length === 0) {
            return this.systemPrompt + '\n\nNo authenticated accounts available.';
        }

        let accountContext = `\n\nConnected accounts for this user:`;

        Object.entries(userCreds.providers).forEach(([providerName, accounts]) => {
            accountContext += `\n${providerName}:`;
            Object.entries(accounts).forEach(([accountId, creds]) => {
                accountContext += `\n  - ${creds.displayName} (${creds.accountType})`;
            });
        });

        const activeProviders = Object.entries(sessionContext.activeProviders)
            .filter(([_, accountId]) => accountId)
            .map(([provider, accountId]) => `${provider}: ${accountId}`);

        if (activeProviders.length > 0) {
            accountContext += `\n\nCurrently active accounts: ${activeProviders.join(', ')}`;
        }

        accountContext += `\n\nWhen a user mentions account preferences (like "use my work email" or "personal Twitter"), automatically select the appropriate account based on email domain or account type. If unclear which account to use, ask for clarification.`;

        return this.systemPrompt + accountContext;
    }

    // Smart account selection with multiple account support
    private async selectAccountForProvider(
        userId: string, 
        provider: string, 
        context: { query?: string, sessionContext?: SessionContext }
    ): Promise<string | null> {
        const providerPool = this.serverPools.get(provider);
        if (!providerPool) return null;

        // Check if there's an active account already
        if (context.sessionContext?.activeProviders[provider]) {
            const activeAccountId = context.sessionContext.activeProviders[provider];
            const accountKey = `${userId}:${activeAccountId}`;
            if (providerPool.get(accountKey)?.isConnected) {
                return activeAccountId;
            }
        }

        // For shared providers, use 'shared'
        const providerConfig = this.providerConfigs.get(provider);
        if (providerConfig?.isShared) {
            const sharedServer = providerPool.get('shared');
            return sharedServer?.isConnected ? 'shared' : null;
        }

        // Get all user's accounts for this provider
        const userCreds = this.userCredentials.get(userId);
        const userAccounts = userCreds?.providers[provider];
        if (!userAccounts) return null;

        // If only one account, use it
        const accountIds = Object.keys(userAccounts);
        if (accountIds.length === 1) {
            const accountId = accountIds[0];
            const accountKey = `${userId}:${accountId}`;
            return providerPool.get(accountKey)?.isConnected ? accountId : null;
        }

        // Multiple accounts - use smart selection based on query
        if (context.query) {
            const query = context.query.toLowerCase();
            
            // Check for explicit account type mentions
            if (query.includes('work') || query.includes('business') || query.includes('office')) {
                const workAccount = accountIds.find(id => userAccounts[id].accountType === 'work');
                if (workAccount) {
                    const accountKey = `${userId}:${workAccount}`;
                    return providerPool.get(accountKey)?.isConnected ? workAccount : null;
                }
            }
            
            if (query.includes('personal') || query.includes('private')) {
                const personalAccount = accountIds.find(id => userAccounts[id].accountType === 'personal');
                if (personalAccount) {
                    const accountKey = `${userId}:${personalAccount}`;
                    return providerPool.get(accountKey)?.isConnected ? personalAccount : null;
                }
            }

            // Check for specific email mentions in query
            const emailMatch = query.match(/(\w+@[\w.-]+)/);
            if (emailMatch) {
                const mentionedEmail = emailMatch[1].toLowerCase();
                const emailAccount = accountIds.find(id => 
                    userAccounts[id].email?.toLowerCase() === mentionedEmail
                );
                if (emailAccount) {
                    const accountKey = `${userId}:${emailAccount}`;
                    return providerPool.get(accountKey)?.isConnected ? emailAccount : null;
                }
            }

            // Check for domain-based selection
            if (provider === 'google') {
                // Extract domain hints from query
                const domainMatches = query.match(/@([\w.-]+)/g);
                if (domainMatches) {
                    for (const domainMatch of domainMatches) {
                        const domain = domainMatch.substring(1).toLowerCase();
                        const domainAccount = accountIds.find(id => 
                            userAccounts[id].email?.toLowerCase().includes(domain)
                        );
                        if (domainAccount) {
                            const accountKey = `${userId}:${domainAccount}`;
                            return providerPool.get(accountKey)?.isConnected ? domainAccount : null;
                        }
                    }
                }
            }
        }

        // Default to first connected account
        for (const accountId of accountIds) {
            const accountKey = `${userId}:${accountId}`;
            if (providerPool.get(accountKey)?.isConnected) {
                return accountId;
            }
        }

        return null;
    }

    // Get client for tool with user context
    private async getClientForTool(toolName: string, sessionContext: SessionContext): Promise<Client> {
        const toolMapping = this.toolToServerMap.get(toolName);
        if (!toolMapping) {
            throw new Error(`No server mapping found for tool: ${toolName}`);
        }

        const { provider, accountKey } = toolMapping;
        const providerPool = this.serverPools.get(provider);

        if (!providerPool) {
            throw new Error(`No server pool found for provider: ${provider}`);
        }

        // For shared tools, use the shared server
        if (!accountKey) {
            const sharedServer = providerPool.get('shared');
            if (sharedServer?.isConnected) {
                return sharedServer.client;
            }
            throw new Error(`Shared ${provider} server not available`);
        }

        console.log("selectAccountForProvider")

        // For user-specific tools, select appropriate provider
        const selectedProvider = await this.selectAccountForProvider(
            sessionContext.userId,
            provider,
            {
                query: this.getLastUserMessage(sessionContext),
                sessionContext
            }
        );

        if (!selectedProvider) {
            throw new Error(`No ${provider} provider available for user ${sessionContext.userId}`);
        }

        const userServer = providerPool.get(`${sessionContext.userId}:${selectedProvider}`);
        if (!userServer?.isConnected) {
            throw new Error(`${provider} provider ${selectedProvider} not connected`);
        }

        // Update active provider
        if (selectedProvider !== 'shared') {
            sessionContext.activeProviders[provider] = selectedProvider;
        }

        return userServer.client;
    }

    private getLastUserMessage(sessionContext: SessionContext): string {
        const userMessages = sessionContext.messages.filter(m => m.role === 'user');
        const lastMessage = userMessages[userMessages.length - 1];
        return typeof lastMessage?.content === 'string' ? lastMessage.content : '';
    }

    // MAIN PUBLIC API: Process query with user context
    async processQueryWithUser(
        query: string,
        userId: string,
        sessionId?: string,
        sendEvent?: (event: SSEEvent) => void
    ): Promise<{ sessionId: string }> {
        
        if (!sessionId) {
            sessionId = uuidv4();
        }

        let sessionContext = this.sessions.get(sessionId);
        if (!sessionContext) {
            sessionContext = {
                sessionId,
                userId,
                activeProviders: {},
                messages: [],
                lastActivity: new Date()
            };
            this.sessions.set(sessionId, sessionContext);
            
            sendEvent?.({
                type: 'session_created',
                data: { sessionId, userId },
                sessionId
            });
        }

        sessionContext.lastActivity = new Date();
        sessionContext.messages.push({
            role: "user",
            content: query
        });

        const finalText: string[] = [];
        let iterationCount = 0;

        while (true) {
            iterationCount++;
            
            try {
                const response = await this.llm.messages.create({
                    model: "claude-3-7-sonnet-latest",
                    max_tokens: 1000,
                    stream: false,
                    messages: sessionContext.messages,
                    system: this.getSystemPromptWithContext(sessionContext),
                    tools: this.tools
                });

                const assistantContent = [];
                let hasToolCalls = false;

                for (const content of response.content) {
                    assistantContent.push(content);
                    
                    if (content.type === 'text') {
                        finalText.push(content.text);
                        
                        if (sendEvent) {
                            const sentences = content.text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
                            for (const sentence of sentences) {
                                sendEvent({
                                    type: 'text_chunk',
                                    data: { chunk: sentence + ' ' },
                                    sessionId
                                });
                                await new Promise(resolve => setTimeout(resolve, 80));
                            }
                        }
                        
                    } else if (content.type === 'tool_use') {
                        hasToolCalls = true;
                        
                        sendEvent?.({
                            type: 'tool_call',
                            data: { 
                                message: `Executing ${content.name}...`,
                                toolName: content.name,
                                toolArgs: content.input
                            },
                            sessionId
                        });

                        try {
                            const client = await this.getClientForTool(content.name, sessionContext);
                            
                            const result = await client.callTool({
                                name: content.name,
                                arguments: content.input as Record<string, unknown>
                            });

                            sendEvent?.({
                                type: 'tool_result',
                                data: { 
                                    message: `${content.name} completed successfully`,
                                    toolName: content.name,
                                    success: true
                                },
                                sessionId
                            });

                            sessionContext.messages.push({
                                role: "assistant",
                                content: assistantContent
                            });

                            sessionContext.messages.push({
                                role: "user",
                                content: [{
                                    type: "tool_result",
                                    tool_use_id: content.id,
                                    content: result.content as string
                                }]
                            });

                        } catch (error) {
                            console.error("Tool execution error:", error);
                            
                            sendEvent?.({
                                type: 'tool_result',
                                data: { 
                                    message: `Error executing ${content.name}: ${typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)}`,
                                    toolName: content.name,
                                    success: false,
                                    error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)
                                },
                                sessionId
                            });
                            
                            sessionContext.messages.push({
                                role: "assistant",
                                content: assistantContent
                            });

                            sessionContext.messages.push({
                                role: "user",
                                content: [{
                                    type: "tool_result",
                                    tool_use_id: content.id,
                                    content: `Error executing tool: ${typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)}`,
                                    is_error: true
                                }]
                            });
                        }
                        break;
                    }
                }

                if (!hasToolCalls) {
                    sessionContext.messages.push({
                        role: "assistant",
                        content: assistantContent
                    });
                    break;
                }

            } catch (error) {
                console.error('Error in iteration:', error);
                finalText.push('I apologize, but I encountered an error processing your request.');
                break;
            }
        }

        await this.saveSessions();

        sendEvent?.({
            type: 'complete',
            data: { 
                message: 'Response completed',
                finalResponse: finalText.join("\n"),
                iterations: iterationCount
            },
            sessionId
        });

        return { sessionId };
    }

    // BACKWARD COMPATIBILITY METHODS
    async processQuerySSE(query: string, sessionId: string | undefined, sendEvent: (event: SSEEvent) => void): Promise<{ sessionId: string }> {
        const defaultUserId = 'default';
        return this.processQueryWithUser(query, defaultUserId, sessionId, sendEvent);
    }

    async processQuery(query: string, sessionId?: string): Promise<{ response: string; sessionId: string }> {
        const defaultUserId = 'default';
        const result = await this.processQueryWithUser(query, defaultUserId, sessionId);
        
        const session = this.sessions.get(result.sessionId);
        const lastMessage = session?.messages[session.messages.length - 1];
        const response = lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content) 
            ? lastMessage.content.find(c => c.type === 'text')?.text || 'Response completed'
            : 'Response completed';

        return { response, sessionId: result.sessionId };
    }

    // Utility methods
    logServerStatus() {
        console.log('\n📊 Server Status:');
        this.serverPools.forEach((providerPool, providerName) => {
            const connectedCount = Array.from(providerPool.values()).filter(s => s.isConnected).length;
            console.log(`  ${providerName}: ${connectedCount} connections`);
            providerPool.forEach((server, accountKey) => {
                if (server.isConnected) {
                    if (accountKey === 'shared') {
                        console.log(`    ✅ shared`);
                    } else {
                        const [userId, accountId] = accountKey.split(':');
                        console.log(`    ✅ ${userId}:${accountId}`);
                    }
                }
            });
        });
    }

    getServerStatus() {
        const status: Record<string, any> = {};
        this.serverPools.forEach((providerPool, providerName) => {
            status[providerName] = {};
            providerPool.forEach((server, accountKey) => {
                status[providerName][accountKey] = server.isConnected;
            });
        });
        return status;
    }

    getUserProviders(userId: string) {
        const userCreds = this.userCredentials.get(userId);
        if (!userCreds) return {};

        const providers: Record<string, Record<string, any>> = {};
        Object.entries(userCreds.providers).forEach(([providerName, accounts]) => {
            providers[providerName] = {};
            Object.entries(accounts).forEach(([accountId, creds]) => {
                const accountKey = `${userId}:${accountId}`;
                providers[providerName][accountId] = {
                    displayName: creds.displayName,
                    accountType: creds.accountType,
                    email: creds.email,
                    username: creds.username,
                    connected: this.serverPools.get(providerName)?.get(accountKey)?.isConnected || false
                };
            });
        });
        return providers;
    }

    // Get a specific account for a user and provider
    getUserAccount(userId: string, provider: string, accountId: string) {
        const userCreds = this.userCredentials.get(userId);
        const account = userCreds?.providers[provider]?.[accountId];
        if (!account) return null;

        const accountKey = `${userId}:${accountId}`;
        return {
            ...account,
            connected: this.serverPools.get(provider)?.get(accountKey)?.isConnected || false
        };
    }

    // List all accounts for a specific provider across all users (for admin purposes)
    getProviderAccounts(provider: string) {
        const accounts: Array<{
            userId: string;
            accountId: string;
            displayName?: string;
            accountType?: string;
            email?: string;
            username?: string;
            connected: boolean;
        }> = [];
        this.userCredentials.forEach((userCreds, userId) => {
            const providerAccounts = userCreds.providers[provider];
            if (providerAccounts) {
                Object.entries(providerAccounts).forEach(([accountId, creds]) => {
                    const accountKey = `${userId}:${accountId}`;
                    accounts.push({
                        userId,
                        accountId,
                        displayName: creds.displayName,
                        accountType: creds.accountType,
                        email: creds.email,
                        username: creds.username,
                        connected: this.serverPools.get(provider)?.get(accountKey)?.isConnected || false
                    });
                });
            }
        });
        return accounts;
    }

    // Get all available providers (from config)
    getAvailableProviders() {
        const providers: { [key: string]: { name: string; toolPrefix: string; isShared: boolean } } = {};
        this.providerConfigs.forEach((config, name) => {
            providers[name] = {
                name: config.name,
                toolPrefix: config.toolPrefix,
                isShared: config.isShared || false
            };
        });
        return providers;
    }

    // Remove provider credentials for a user (specific account or all accounts)
    async removeUserProvider(userId: string, providerName: string, accountId?: string): Promise<boolean> {
        const userCreds = this.userCredentials.get(userId);
        if (!userCreds?.providers[providerName]) {
            return false;
        }

        const providerPool = this.serverPools.get(providerName);
        
        if (accountId) {
            // Remove specific account
            if (!userCreds.providers[providerName][accountId]) {
                return false;
            }

            // Disconnect server first
            const accountKey = `${userId}:${accountId}`;
            const userServer = providerPool?.get(accountKey);
            if (userServer?.isConnected) {
                try {
                    await userServer.client.close();
                    providerPool?.delete(accountKey);
                } catch (error) {
                    console.error(`Error disconnecting ${providerName}:${accountId} for user ${userId}:`, error);
                }
            }

            // Remove credentials
            delete userCreds.providers[providerName][accountId];
            
            // If no more accounts for this provider, remove provider entirely
            if (Object.keys(userCreds.providers[providerName]).length === 0) {
                delete userCreds.providers[providerName];
            }
            
            console.log(`🗑️ Removed ${providerName}:${accountId} for user ${userId}`);
        } else {
            // Remove all accounts for this provider
            const accounts = Object.keys(userCreds.providers[providerName]);
            
            // Disconnect all servers
            for (const account of accounts) {
                const accountKey = `${userId}:${account}`;
                const userServer = providerPool?.get(accountKey);
                if (userServer?.isConnected) {
                    try {
                        await userServer.client.close();
                        providerPool?.delete(accountKey);
                    } catch (error) {
                        console.error(`Error disconnecting ${providerName}:${account} for user ${userId}:`, error);
                    }
                }
            }

            // Remove all credentials
            delete userCreds.providers[providerName];
            console.log(`🗑️ Removed all ${providerName} accounts for user ${userId}`);
        }

        // Clean up user if no providers left
        if (Object.keys(userCreds.providers).length === 0) {
            this.userCredentials.delete(userId);
        } else {
            this.userCredentials.set(userId, userCreds);
        }
        
        await this.saveCredentials();
        await this.updateToolsList();
        
        return true;
    }

    // Clear all sessions for a user
    async clearUserSessions(userId: string): Promise<number> {
        let cleared = 0;
        for (const [sessionId, session] of this.sessions) {
            if (session.userId === userId) {
                this.sessions.delete(sessionId);
                cleared++;
            }
        }
        
        if (cleared > 0) {
            await this.saveSessions();
        }
        
        return cleared;
    }

    // Get sessions for a user
    getUserSessions(userId: string): SessionContext[] {
        const userSessions: SessionContext[] = [];
        this.sessions.forEach((session) => {
            if (session.userId === userId) {
                userSessions.push(session);
            }
        });
        return userSessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    }

    // Legacy methods for backward compatibility
    async getAllSessions(): Promise<Record<string, MessageParam[]>> {
        const allSessions: { [sessionId: string]: MessageParam[] } = {};
        this.sessions.forEach((session, sessionId) => {
            allSessions[sessionId] = session.messages;
        });
        return allSessions;
    }

    async getSession(sessionId: string): Promise<MessageParam[] | null> {
        const session = this.sessions.get(sessionId);
        return session ? session.messages : null;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        const deleted = this.sessions.delete(sessionId);
        if (deleted) {
            await this.saveSessions();
        }
        return deleted;
    }

    async clearAllSessions(): Promise<void> {
        this.sessions.clear();
        await this.saveSessions();
    }

    async getSessionsSummary(): Promise<Array<{ sessionId: string; messageCount: number; lastMessage?: string; timestamp?: string; userId?: string }>> {
        const summaries: Array<any> = [];
        this.sessions.forEach((session, sessionId) => {
            const lastUserMessage = session.messages
                .filter(m => m.role === 'user')
                .pop();
            
            summaries.push({
                sessionId,
                userId: session.userId,
                messageCount: session.messages.length,
                lastMessage: lastUserMessage 
                    ? (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : 'Complex message')
                    : undefined,
                timestamp: session.lastActivity.toISOString()
            });
        });
        
        return summaries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    getToolsByServer() {
        const toolsByProvider: Record<string, string[]> = {};
        this.toolToServerMap.forEach((mapping, toolName) => {
            const key = mapping.accountKey ? `${mapping.provider}:${mapping.accountKey}` : mapping.provider;
            if (!toolsByProvider[key]) {
                toolsByProvider[key] = [];
            }
            toolsByProvider[key].push(toolName);
        });
        return toolsByProvider;
    }

    async cleanup() {
        await this.saveSessions();
        
        const cleanupPromises: Promise<any>[] = [];
        this.serverPools.forEach((providerPool) => {
            providerPool.forEach((config) => {
                if (config.isConnected) {
                    cleanupPromises.push(
                        config.client.close().catch(error => 
                            console.error(`Error closing ${config.name}:`, error)
                        )
                    );
                }
            });
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

async function main() {
    const app = express();
    const port = process.env.PORT || 3000;

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Initialize extensible MCP client
    const mcpClient = new ExtensibleMCPClient();

    try {
        await mcpClient.connectToServer();
        console.log("Server status:", mcpClient.getServerStatus());
        
        // =============================================================================
        // HEALTH & STATUS ENDPOINTS
        // =============================================================================
        
        app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                tools: mcpClient.tools.length,
                serverStatus: mcpClient.getServerStatus(),
                availableProviders: mcpClient.getAvailableProviders()
            });
        });

        app.get('/providers', (req, res) => {
            res.json(mcpClient.getAvailableProviders());
        });

        // Get all accounts for a specific provider (admin endpoint)
        app.get('/providers/:provider/accounts', (req, res) => {
            const { provider } = req.params;
            const accounts = mcpClient.getProviderAccounts(provider);
            res.json({ provider, accounts });
        });

        // =============================================================================
        // USER MANAGEMENT ENDPOINTS
        // =============================================================================

        // Get user's connected providers
        app.get('/users/:userId/providers', (req, res) => {
            const { userId } = req.params;
            const providers = mcpClient.getUserProviders(userId);
            res.json({ userId, providers });
        });

        // Set credentials for a user and provider
        app.post('/users/:userId/providers/:provider', async (req, res) => {
            const { userId, provider } = req.params;
            const credentials = req.body;
            
            try {
                const result = await mcpClient.setUserCredentials(userId, provider, credentials);
                res.json({ 
                    success: true,
                    accountId: result.accountId,
                    isNew: result.isNew,
                    message: `${provider} account ${result.isNew ? 'added' : 'updated'} for user ${userId}`,
                    providers: mcpClient.getUserProviders(userId)
                });
            } catch (error) {
                res.status(500).json({ 
                    error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error),
                    provider,
                    userId
                });
            }
        });

        // Get specific account details
        app.get('/users/:userId/providers/:provider/:accountId', (req, res) => {
            const { userId, provider, accountId } = req.params;
            const account = mcpClient.getUserAccount(userId, provider, accountId);
            
            if (account) {
                res.json({ userId, provider, accountId, account });
            } else {
                res.status(404).json({ 
                    error: `Account ${accountId} not found for ${provider} provider and user ${userId}` 
                });
            }
        });

        // Remove specific account for a user and provider
        app.delete('/users/:userId/providers/:provider/:accountId', async (req, res) => {
            const { userId, provider, accountId } = req.params;
            
            try {
                const success = await mcpClient.removeUserProvider(userId, provider, accountId);
                if (success) {
                    res.json({ 
                        success: true, 
                        message: `${provider} account ${accountId} removed for user ${userId}`,
                        providers: mcpClient.getUserProviders(userId)
                    });
                } else {
                    res.status(404).json({ 
                        error: `${provider} account ${accountId} not found for user ${userId}` 
                    });
                }
            } catch (error) {
                res.status(500).json({ error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error) });
            }
        });

        // Remove all accounts for a provider for a user
        app.delete('/users/:userId/providers/:provider', async (req, res) => {
            const { userId, provider } = req.params;
            
            try {
                const success = await mcpClient.removeUserProvider(userId, provider);
                if (success) {
                    res.json({ 
                        success: true, 
                        message: `All ${provider} accounts removed for user ${userId}`,
                        providers: mcpClient.getUserProviders(userId)
                    });
                } else {
                    res.status(404).json({ 
                        error: `${provider} not found for user ${userId}` 
                    });
                }
            } catch (error) {
                res.status(500).json({ error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error) });
            }
        });

        // Get user's sessions
        app.get('/users/:userId/sessions', (req, res) => {
            const { userId } = req.params;
            const sessions = mcpClient.getUserSessions(userId);
            res.json({ userId, sessions });
        });

        // Clear all sessions for a user
        app.delete('/users/:userId/sessions', async (req, res) => {
            const { userId } = req.params;
            const cleared = await mcpClient.clearUserSessions(userId);
            res.json({ userId, sessionsCleared: cleared });
        });

        // =============================================================================
        // OAUTH CALLBACK ENDPOINTS - Now provider-agnostic!
        // =============================================================================

        // OAuth callback endpoints with separate routes for userId
        app.get('/auth/:provider/callback/', async (req, res) => {
            const { provider } = req.params;
            let { code, userId } = req.query;

            if( !userId || typeof userId !== 'string') {
                userId = 'default'; // Default userId if not provided
            }
            
            if (!code || typeof code !== 'string') {
                res.status(400).json({ error: 'Authorization code is required' });
                return;
            }

            console.log(`${provider} authorization code received for user ${userId}:`, code);

            try {
                let credentials: ProviderCredentials = {};
                let displayName = '';

                // Handle different provider token exchanges
                switch (provider) {
                    case 'google':
                        const { tokens } = await auth.getToken(code);
                        auth.setCredentials(tokens);
                        const oauth2 = google.oauth2({ version: 'v2', auth });
                        const profile = await oauth2.userinfo.get();
                        
                        credentials = {
                            refreshToken: tokens.refresh_token ?? undefined,
                            accessToken: tokens.access_token ?? undefined,
                            email: profile.data.email ?? undefined,
                            displayName: profile.data.name ?? undefined,
                            accountType: profile.data.email?.includes('@gmail.com') ? 'personal' : 'work',
                            expiresAt: tokens.expiry_date ?? undefined
                        };
                        displayName = profile.data.name || profile.data.email || 'Google Account';
                        break;

                    case 'twitter':
                        const twitterData = await twitterService.getToken(code);
                        credentials = {
                            accessToken: twitterData.access_token,
                            refreshToken: twitterData.refresh_token,
                            username: twitterData.username,
                            displayName: twitterData.username ? `@${twitterData.username}` : 'Twitter Account',
                            accountType: 'personal'
                        };
                        displayName = credentials.displayName ?? 'Twitter Account';
                        break;

                    case 'notion':
                        const encoded = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
                        const notionResponse = await fetch('https://api.notion.com/v1/oauth/token', {
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
                        });
                        const notionData = await notionResponse.json();
                        
                        if (notionData.error) {
                            throw new Error(notionData.error);
                        }
                        
                        credentials = {
                            accessToken: notionData.access_token,
                            workspaceId: notionData.workspace_id,
                            displayName: notionData.workspace_name || 'Notion Workspace'
                        };
                        displayName = credentials.displayName ?? 'Notion Workspace';
                        break;

                    case 'github':
                        const githubResponse = await axios.post('https://github.com/login/oauth/access_token', null, {
                            params: {
                                client_id: process.env.GITHUB_CLIENT_ID,
                                client_secret: process.env.GITHUB_CLIENT_SECRET,
                                code,
                                redirect_uri: process.env.GITHUB_REDIRECT_URI,
                            },
                            headers: { Accept: 'application/json' },
                        });
                        const githubData = githubResponse.data;
                        
                        if (githubData.error) {
                            throw new Error(githubData.error);
                        }
                        
                        credentials = {
                            accessToken: githubData.access_token,
                            displayName: 'GitHub Account'
                        };
                        displayName = credentials.displayName ?? 'GitHub Account';
                        break;

                    case 'slack':
                        // Handle Slack OAuth (if you implement it)
                        throw new Error('Slack OAuth not implemented in this example');

                    default:
                        throw new Error(`Unknown provider: ${provider}`);
                }

                // Store credentials using the extensible system
                const result = await mcpClient.setUserCredentials(userId, provider, credentials);
                
                res.status(200).json({ 
                    message: `${provider} authorization successful for user ${userId}`,
                    provider,
                    userId,
                    accountId: result.accountId,
                    isNew: result.isNew,
                    displayName,
                    providers: mcpClient.getUserProviders(userId)
                });
                
            } catch (error) {
                console.error(`Error during ${provider} token exchange:`, error);
                res.status(500).json({ 
                    error: `Failed to complete ${provider} authorization`,
                    details: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)
                });
            }
        });

        // OAuth callback without userId (defaults to 'default')
        // app.get('/auth/:provider/callback', async (req, res) => {
        //     (req.params as Record<string, any>).userId = 'default';
        //     // Reuse the same handler
        //     return app._router.handle(req, res);
        // });

        // =============================================================================
        // OAUTH INITIATION ENDPOINTS
        // =============================================================================

        // OAuth initiation endpoints with separate routes
        app.get('/auth/google/user/:userId', (req, res) => {
            const { userId } = req.params;
            const authUrl = getAuthUrl();
            // Modify redirect URI to include userId
            const urlWithUser = authUrl.replace('callback', `callback&state=${userId}`);
            res.json({ authUrl: urlWithUser, userId });
        });

        app.get('/auth/google', (req, res) => {
            const authUrl = getAuthUrl();
            res.json({ authUrl, userId: 'default' });
        });

        app.get('/auth/notion/user/:userId', (req, res) => {
            const { userId } = req.params;
            const redirectUri = `${process.env.NOTION_REDIRECT_URI}&state=${userId}`;
            const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${redirectUri}`;
            res.json({ authUrl, userId });
        });

        app.get('/auth/notion', (req, res) => {
            const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${process.env.NOTION_REDIRECT_URI}`;
            res.json({ authUrl, userId: 'default' });
        });

        app.get('/auth/github/user/:userId', (req, res) => {
            const { userId } = req.params;
            const redirectUri = `${process.env.GITHUB_REDIRECT_URI}/${userId}`;
            const authUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=user&state=${userId}`;
            res.json({ authUrl, userId });
        });

        app.get('/auth/github', (req, res) => {
            const authUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_REDIRECT_URI}&scope=user`;
            res.json({ authUrl, userId: 'default' });
        });

        app.get('/auth/twitter/user/:userId', async (req, res) => {
            const { userId } = req.params;
            const scopes = ["tweet.read", "tweet.write", "users.read"] as TwitterOAuth2Scopes[];
            const authUrl = await twitterService.getAuthUrl(scopes, { state: userId });
            res.json({ authUrl, userId });
        });

        app.get('/auth/twitter', async (req, res) => {
            const scopes = ["tweet.read", "tweet.write", "users.read"] as TwitterOAuth2Scopes[];
            const authUrl = await twitterService.getAuthUrl(scopes, { state: 'default' });
            res.json({ authUrl, userId: 'default' });
        });

        // =============================================================================
        // CHAT ENDPOINTS - Enhanced with user context
        // =============================================================================

        // Chat endpoint with user context
        app.post('/chat/:userId', async (req, res) => {
            const { userId } = req.params;
            const { query, sessionId } = req.body;
            
            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            try {
                const result = await mcpClient.processQueryWithUser(query, userId, sessionId);
                
                // Get the response from the session
                const session = await mcpClient.getSession(result.sessionId);
                const lastMessage = session?.[session.length - 1];
                const response = lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content)
                    ? lastMessage.content.find(c => c.type === 'text')?.text || 'Response completed'
                    : 'Response completed';

                res.json({ 
                    response, 
                    sessionId: result.sessionId,
                    userId,
                    providers: mcpClient.getUserProviders(userId)
                });
            } catch (error) {
                console.error('Error processing query:', error);
                res.status(500).json({ error: 'Failed to process query' });
            }
        });

        // SSE Chat endpoint with user context
        app.post('/chat/:userId/stream', async (req, res) => {
            const { userId } = req.params;
            const { query, sessionId } = req.body;
            
            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            // Set up SSE
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            });

            const sendEvent = (event: SSEEvent) => {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            };

            try {
                await mcpClient.processQueryWithUser(query, userId, sessionId, sendEvent);
            } catch (error) {
                console.error('Error in SSE stream:', error);
                sendEvent({
                    type: 'error',
                    data: { 
                        message: 'I apologize, but I encountered an error while processing your request.',
                        error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)
                    },
                    sessionId
                });
            }
            
            res.end();
        });

        // Legacy endpoints for backward compatibility
        app.post('/chat', async (req, res) => {
            const { query, sessionId } = req.body;
            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            try {
                const response = await mcpClient.processQuery(query, sessionId);
                res.json(response);
            } catch (error) {
                console.error('Error processing query:', error);
                res.status(500).json({ error: 'Failed to process query' });
            }
        });

        app.post('/chat/stream', async (req, res) => {
            const { query, sessionId } = req.body;
            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });

            const sendEvent = (event: SSEEvent) => {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            };

            try {
                await mcpClient.processQuerySSE(query, sessionId, sendEvent);
            } catch (error) {
                sendEvent({
                    type: 'error',
                    data: { error: typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error) },
                    sessionId
                });
            }
            
            res.end();
        });

        // =============================================================================
        // SESSION MANAGEMENT ENDPOINTS
        // =============================================================================

        app.get('/sessions', async (req, res) => {
            const summary = await mcpClient.getSessionsSummary();
            res.json(summary);
        });

        app.get('/sessions/:sessionId', async (req, res) => {
            const { sessionId } = req.params;
            const session = await mcpClient.getSession(sessionId);
            if (session) {
                res.json({ sessionId, messages: session });
            } else {
                res.status(404).json({ error: 'Session not found' });
            }
        });

        app.delete('/sessions/:sessionId', async (req, res) => {
            const { sessionId } = req.params;
            const deleted = await mcpClient.deleteSession(sessionId);
            res.json({ deleted, sessionId });
        });

        // =============================================================================
        // CORS PREFLIGHT
        // =============================================================================

        app.options('/chat/:userId/stream', (req, res) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Cache-Control, Content-Type');
            res.sendStatus(200);
        });

        app.options('/chat/stream', (req, res) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Cache-Control, Content-Type');
            res.sendStatus(200);
        });

        // =============================================================================
        // START SERVER
        // =============================================================================

        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`📊 Health check: http://localhost:${port}/health`);
            console.log(`👥 User chat: http://localhost:${port}/chat/:userId`);
            console.log(`📡 User SSE chat: http://localhost:${port}/chat/:userId/stream`);
            console.log(`🔗 Legacy chat: http://localhost:${port}/chat`);
            console.log(`📋 Available providers: http://localhost:${port}/providers`);
            mcpClient.logServerStatus();
        });

        // Handle graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            await mcpClient.cleanup();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT received. Shutting down gracefully...');
            await mcpClient.cleanup();
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Usage examples for testing:

/*
1. Add credentials for a user:
POST /users/john/providers/google
{
  "refreshToken": "your-refresh-token",
  "email": "john@company.com",
  "displayName": "John's Work Gmail",
  "accountType": "work"
}

2. Start a chat session:
POST /chat/john
{
  "query": "Check my work email",
  "sessionId": "optional-session-id"
}

3. Add a new provider easily:
mcpClient.addProvider('custom-service', {
  name: 'custom-service',
  serverConfig: {
    serverScriptPath: "./build/servers/custom.js"
  },
  toolPrefix: 'custom:',
  envMapping: (creds) => ({
    "CUSTOM_API_KEY": creds.apiKey
  })
});

4. Stream chat with user context:
POST /chat/john/stream
{
  "query": "Send a tweet from my personal account"
}
*/

main();