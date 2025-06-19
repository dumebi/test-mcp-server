import { google } from 'googleapis';
import * as dotenv from 'dotenv';
// Load environment variables
dotenv.config();
export class GmailProvider {
    auth = null;
    gmail = null;
    /**
     * Initialize the Google Calendar client
     */
    async initialize() {
        try {
            // Set up OAuth2 client
            this.auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
            // Set credentials if they exist
            // if (process.env.GOOGLE_REFRESH_TOKEN) {
            //   try {
            //     // If successful, we are authenticated
            //     console.error('Successfully authenticated with Google Mail API');
            //   } catch (error) {
            //     console.error('Error authenticating with refresh token:', error);
            //     this.gmail = null;
            //     this.auth = new google.auth.OAuth2(
            //       process.env.GOOGLE_CLIENT_ID,
            //       process.env.GOOGLE_CLIENT_SECRET,
            //       process.env.GOOGLE_REDIRECT_URI
            //     );
            //     // Show auth URL since refresh token is invalid
            //     console.error('\n⚠️ Invalid refresh token. Please re-authorize the application.');
            //     this.showAuthUrl();
            //   }
            // } else {
            //   // If no refresh token, prepare for authorization
            //   console.error('\n⚠️ No refresh token found. Please authorize the application.');
            //   this.showAuthUrl();
            // }
        }
        catch (error) {
            console.error('Error initializing Google Mail client:', error);
            throw error;
        }
    }
    /**
     * Get authorization URL for OAuth2 flow
     */
    getAuthUrl() {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        return this.auth.generateAuthUrl({
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
    /**
     * Set authorization code from OAuth2 flow
     */
    async setAuthCode(code) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        const { tokens } = await this.auth.getToken(code);
        this.auth.setCredentials(tokens);
        // Initialize the calendar client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        console.error('Successfully authenticated with Google Mail API');
        console.error('Refresh token:', tokens.refresh_token);
        console.error('Add this refresh token to your .env file as GOOGLE_REFRESH_TOKEN');
    }
    /**
     * Get the tool definitions
     */
    getToolDefinitions() {
        return [
            {
                name: 'gmail_sendEmail',
                description: 'Send an email to specified recipients',
                inputSchema: {
                    type: "object",
                    properties: {
                        to: {
                            type: 'string',
                            description: 'Recipient email addresses, comma-separated',
                        },
                        subject: {
                            type: 'string',
                            description: 'Email subject',
                        },
                        body: {
                            type: 'string',
                            description: 'Email body content',
                        },
                        threadId: {
                            type: 'string',
                            description: 'Thread ID to send the email in (optional)',
                        },
                        attachments: {
                            type: 'array',
                            description: 'List of file paths to attach to the email',
                            items: {
                                type: 'string',
                                description: 'File path of the attachment'
                            },
                        },
                        cc: {
                            type: 'string',
                            description: 'CC email addresses, comma-separated',
                        },
                        bcc: {
                            type: 'string',
                            description: 'BCC email addresses, comma-separated',
                        },
                        isHtml: {
                            type: 'boolean',
                            description: 'Whether the email body is HTML (default: false)',
                            default: false,
                        },
                    },
                    required: ['to', 'subject', 'body'],
                },
            },
            {
                name: 'gmail_draftEmail',
                description: 'Create a draft email in Gmail.',
                inputSchema: {
                    type: "object",
                    properties: {
                        to: {
                            type: 'string',
                            description: 'Recipient email addresses, comma-separated',
                        },
                        subject: {
                            type: 'string',
                            description: 'Email subject',
                        },
                        body: {
                            type: 'string',
                            description: 'Email body content',
                        },
                        threadId: {
                            type: 'string',
                            description: 'Thread ID to send the email in (optional)',
                        },
                        attachments: {
                            type: 'array',
                            description: 'List of file paths to attach to the email',
                            items: {
                                type: 'string',
                                description: 'File path of the attachment'
                            },
                        },
                        cc: {
                            type: 'string',
                            description: 'CC email addresses, comma-separated',
                        },
                        bcc: {
                            type: 'string',
                            description: 'BCC email addresses, comma-separated',
                        },
                        isHtml: {
                            type: 'boolean',
                            description: 'Whether the email body is HTML (default: false)',
                            default: false,
                        },
                    },
                    required: ['to', 'subject', 'body'],
                },
            },
            {
                name: 'gmail_listEmails',
                description: 'List emails with optional query, labels, and limits. Returns a summary including IDs.',
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query (same format as Gmail search, e.g., "from:user@example.com")',
                        },
                        maxResults: {
                            type: 'number',
                            description: 'Maximum number of results to return (default: 10)',
                        },
                        labelIds: {
                            type: 'string',
                            description: 'List of label IDs to filter by (e.g., ["INBOX", "UNREAD"])',
                        },
                    },
                    required: [],
                },
            },
            {
                name: 'gmail_getEmail',
                description: 'Get the full content of a specific email by its ID.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        messageId: {
                            type: 'string',
                            description: 'The ID of the email message to retrieve',
                        },
                        format: {
                            type: 'emum',
                            enum: ['full', 'metadata', 'minimal', 'raw'],
                            description: 'Format of the email content to retrieve (default: full)',
                            default: 'full',
                        },
                    },
                    required: ['eventId'],
                },
            },
            {
                name: 'gmail_deleteEmail',
                description: 'Delete an email (moves to trash by default).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        messageId: {
                            type: 'string',
                            description: 'The ID of the email message to delete',
                        },
                        permanently: {
                            type: 'boolean',
                            description: 'Whether to permanently delete the email (default: false, moves to trash)',
                            default: false,
                        }
                    },
                    required: ['messageId'],
                },
            },
            {
                name: 'gmail_modifyLabels',
                description: 'Add or remove labels from an email.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        messageId: {
                            type: 'string',
                            description: 'The ID of the email message to delete',
                        },
                        addLabelIds: {
                            type: 'array',
                            description: 'List of label IDs to add (e.g., ["UNREAD", "IMPORTANT"])',
                        },
                        removeLabelIds: {
                            type: 'array',
                            description: 'List of label IDs to remove (e.g., ["UNREAD", "IMPORTANT"])',
                        }
                    },
                    required: ['messageId'],
                },
            },
        ];
    }
    /**
     * Send an email using Gmail API
     */
    async sendEmail(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { to, subject, body, attachments, cc, bcc, isHtml = false, threadId } = parameters;
        try {
            const emailLines = [];
            emailLines.push(`To: ${to}`);
            if (cc && cc.length)
                emailLines.push(`Cc: ${cc}`);
            if (bcc && bcc.length)
                emailLines.push(`Bcc: ${bcc}`);
            emailLines.push(`Subject: ${subject}`);
            emailLines.push(`Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`);
            emailLines.push("");
            emailLines.push(body);
            if (threadId) {
                emailLines.push(`In-Reply-To: ${threadId}`);
                emailLines.push(`References: ${threadId}`);
            }
            const email = emailLines.join("\r\n");
            const encodedEmail = Buffer.from(email)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
            const response = await this.gmail.users.messages.send({
                userId: "me",
                requestBody: { raw: encodedEmail },
                // media: files.length > 0 ? {
                //   mimeType: 'multipart/mixed',
                //   body: Buffer.from(email, 'utf-8'),
                // } : undefined,  
            });
            return response;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    async draftEmail(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { to, subject, body, attachments, cc, bcc, isHtml = false } = parameters;
        // let files: string[] = [];
        try {
            const emailLines = [];
            emailLines.push(`To: ${to.join(", ")}`);
            if (cc && cc.length)
                emailLines.push(`Cc: ${cc.join(", ")}`);
            if (bcc && bcc.length)
                emailLines.push(`Bcc: ${bcc.join(", ")}`);
            // if(attachments && attachments.length) {
            //   emailLines.push(`Content-Type: multipart/mixed; boundary="boundary"`);
            //   emailLines.push("");
            //   emailLines.push("--boundary");
            //   files = attachments.forEach((attachment: string) => {
            //     let fileContent = readFileSync(resolve(attachment)).toString('base64');
            //     fileContent = fileContent.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // Base64 URL-safe encoding
            //     emailLines.push(`--boundary`);
            //     emailLines.push(`Content-Type: application/octet-stream; name="${attachment}"`);
            //     emailLines.push(`Content-Transfer-Encoding: base64`); 
            //     emailLines.push(`Content-Disposition: attachment; filename="${attachment}"`);
            //   });
            // }
            emailLines.push(`Subject: ${subject}`);
            emailLines.push(`Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`);
            emailLines.push("");
            emailLines.push(body);
            const email = emailLines.join("\r\n");
            const encodedEmail = Buffer.from(email)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");
            const response = await this.gmail.users.drafts.create({
                userId: "me",
                requestBody: { message: { raw: encodedEmail } },
                // media: files.length > 0 ? {
                //   mimeType: 'multipart/mixed',
                //   body: Buffer.from(email, 'utf-8'),
                // } : undefined,  
            });
            return response;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * List events in a calendar
     */
    async listEmails(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { query, maxResults = 100, labelIds } = parameters;
        try {
            const params = {
                userId: "me",
                maxResults,
            };
            if (query)
                params.q = query;
            if (labelIds)
                params.labelIds = labelIds;
            const messageList = await this.gmail.users.messages.list(params);
            if (!messageList.data.messages ||
                messageList.data.messages.length === 0) {
                return {
                    content: [
                        { type: "text", text: "No emails found matching the criteria." },
                    ],
                };
            }
            // Get minimal details (metadata) for each message
            const emailDetailsPromises = messageList.data.messages.map(async (msg) => {
                if (!msg.id)
                    return null;
                try {
                    if (!this.gmail)
                        throw new Error('Gmail client not initialized');
                    const msgDetails = await this.gmail.users.messages.get({
                        userId: "me",
                        id: msg.id,
                        format: "metadata",
                        metadataHeaders: ["Subject", "From", "Date"],
                    });
                    const headers = msgDetails.data.payload?.headers || [];
                    const subject = headers.find((h) => h.name === "Subject")?.value ||
                        "(No subject)";
                    const from = headers.find((h) => h.name === "From")?.value || "";
                    const date = headers.find((h) => h.name === "Date")?.value || "";
                    return {
                        id: msg.id,
                        subject,
                        from,
                        date,
                        snippet: msgDetails.data.snippet || "",
                    };
                }
                catch (detailError) {
                    console.error(`Error fetching details for message ${msg.id}:`, detailError);
                    return {
                        id: msg.id,
                        subject: "(Error fetching details)",
                        from: "",
                        date: "",
                        snippet: "",
                    };
                }
            });
            const emails = (await Promise.all(emailDetailsPromises)).filter((e) => e !== null);
            // Format results
            const formattedResults = emails
                .map((msg, index) => `[${index + 1}] ID: ${msg.id}\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\nSnippet: ${msg.snippet}`)
                .join("\n\n---\n\n");
            return formattedResults;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * Get details for a specific event
     */
    async getEmail(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { messageId, format = 'full' } = parameters;
        try {
            const response = await this.gmail.users.messages.get({
                userId: "me",
                id: messageId,
                format: format,
            });
            const { payload, snippet, labelIds, internalDate } = response.data;
            if (!payload || !payload.headers) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Could not retrieve payload/headers for message ${messageId}.`,
                        },
                    ],
                };
            }
            const headers = payload.headers;
            const subject = headers.find((h) => (h.name ?? '').toLowerCase() === "subject")?.value ||
                "(No subject)";
            const from = headers.find((h) => (h.name ?? '').toLowerCase() === "from")?.value || "";
            const to = headers.find((h) => (h.name ?? '').toLowerCase() === "to")?.value || "";
            const dateHeader = headers.find((h) => (h.name ?? '').toLowerCase() === "date")?.value || "";
            const date = dateHeader ||
                (internalDate
                    ? new Date(parseInt(internalDate)).toISOString()
                    : "Unknown");
            // Function to find and decode the body part (handles multipart)
            const findBody = (part) => {
                if (part.body?.data &&
                    (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
                    return Buffer.from(part.body.data, "base64").toString("utf8");
                }
                if (part.parts) {
                    // Prefer text/plain, fallback to text/html
                    const plainPart = part.parts.find((p) => p.mimeType === "text/plain");
                    if (plainPart?.body?.data)
                        return Buffer.from(plainPart.body.data, "base64").toString("utf8");
                    const htmlPart = part.parts.find((p) => p.mimeType === "text/html");
                    if (htmlPart?.body?.data)
                        return Buffer.from(htmlPart.body.data, "base64").toString("utf8");
                    // Recurse if needed (though usually not necessary for plain/html)
                    for (const subPart of part.parts) {
                        const subBody = findBody(subPart);
                        if (subBody)
                            return subBody;
                    }
                }
                return "";
            };
            const body = findBody(payload);
            let result = `Subject: ${subject}\n`;
            result += `From: ${from}\n`;
            result += `To: ${to}\n`;
            result += `Date: ${date}\n`;
            result += `Labels: ${(labelIds || []).join(", ")}\n\n`;
            result += `Snippet: ${snippet || ""}\n\n`;
            result += `Body:\n${body.substring(0, 2000)}${body.length > 2000 ? "... (truncated)" : ""}`; // Truncate long bodies
            return result;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * Update an existing event
     */
    async deleteEmail(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { messageId, permanently = false } = parameters;
        try {
            if (permanently) {
                await this.gmail.users.messages.delete({ userId: "me", id: messageId });
                return `Message ${messageId} deleted successfully`;
            }
            else {
                await this.gmail.users.messages.trash({ userId: "me", id: messageId });
                return `Message ${messageId} moved to trash`;
            }
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * Delete an event from a calendar
     */
    async modifyLabels(parameters, refresh_token) {
        if (!this.auth) {
            throw new Error('Auth client not initialized');
        }
        this.auth.setCredentials({
            refresh_token
        });
        // Initialize the mail client
        this.gmail = google.gmail({ version: 'v1', auth: this.auth });
        const { messageId, addLabelIds = [], removeLabelIds = [] } = parameters;
        try {
            if (!addLabelIds && !removeLabelIds) {
                return `No labels specified to add or remove. Please provide at least one label ID to add or remove.`;
            }
            await this.gmail.users.messages.modify({
                userId: "me",
                id: messageId,
                requestBody: {
                    addLabelIds: addLabelIds || [],
                    removeLabelIds: removeLabelIds || [],
                },
            });
            let result = `Successfully modified labels for message ${messageId}.`;
            if (addLabelIds && addLabelIds.length > 0)
                result += `\nAdded: ${addLabelIds.join(", ")}`;
            if (removeLabelIds && removeLabelIds.length > 0)
                result += `\nRemoved: ${removeLabelIds.join(", ")}`;
            return result;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    /**
     * Check if the provider is authenticated with Google Calendar
     */
    isAuthenticated() {
        return this.gmail !== null;
    }
    /**
     * Display authorization URL to the user
     */
    showAuthUrl() {
        const authUrl = this.getAuthUrl();
        console.error('\n🔑 Authorization Required');
        console.error('-------------------');
        console.error('1. Visit this URL to authorize the application:');
        console.error(authUrl);
        console.error('\n2. After approval, you will be redirected to a URL. Copy the "code" parameter from that URL.');
        console.error('\n3. Use the set_auth_code tool or run this command:');
        console.error(`   npx ts-node src/auth-helper.js "PASTE_AUTH_CODE_HERE"\n`);
    }
}
