# MCP Server Creation Guide

This guide provides step-by-step instructions for creating a Model Context Protocol (MCP) server similar to the acc-mcp-server project, deployed on Cloudflare Workers.

## Project Overview

The acc-mcp-server is a comprehensive example of building an MCP server that:
- Runs on Cloudflare Workers for global edge deployment
- Integrates with external IoT APIs (Acceleronix platform)
- Provides both SSE and HTTP endpoints for MCP communication
- Uses Durable Objects for persistent state management
- Implements comprehensive tooling for device management and data querying

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn package manager
- Cloudflare account with Workers access
- Basic knowledge of TypeScript and API integration

## Step-by-Step Implementation

### 1. Project Setup and Dependencies

#### Initialize the project:
```bash
npm init -y
npm install typescript @types/node --save-dev
npx tsc --init
```

#### Install core dependencies:
```bash
# Core MCP and Cloudflare Workers dependencies
npm install @modelcontextprotocol/sdk hono
npm install @cloudflare/workers-oauth-provider
npm install agents zod

# Development dependencies
npm install wrangler typescript marked workers-mcp --save-dev
```

#### Project structure:
```
your-mcp-server/
├── src/
│   ├── index.ts           # Main worker entry point
│   ├── server.ts          # Main MCP server implementation
│   ├── utils.ts           # API utility functions
│   └── app.ts             # Optional OAuth app (if needed)
├── package.json
├── wrangler.toml          # Cloudflare Workers configuration
├── tsconfig.json          # TypeScript configuration
├── biome.json             # Code formatting configuration
├── worker-configuration.d.ts # Type definitions
└── CLAUDE.md              # Instructions for Claude Code
```

### 2. Configuration Files

#### `package.json` - Scripts and dependencies:
```json
{
  "name": "your-mcp-server",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "format": "biome format --write",
    "lint:fix": "biome lint --fix",
    "start": "wrangler dev",
    "cf-typegen": "wrangler types",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@cloudflare/workers-oauth-provider": "^0.0.5",
    "@modelcontextprotocol/sdk": "^1.12.3",
    "agents": "^0.0.95",
    "hono": "^4.8.0",
    "zod": "^3.25.67"
  },
  "devDependencies": {
    "@types/node": "^24.0.3",
    "typescript": "^5.8.3",
    "workers-mcp": "^0.0.13",
    "wrangler": "^4.20.3"
  }
}
```

#### `wrangler.toml` - Cloudflare Workers configuration:
```toml
name = "your-mcp-server"
main = "src/index.ts"
compatibility_date = "2025-06-20"
compatibility_flags = ["nodejs_compat"]

# Environment variables
[vars]
BASE_URL = "https://your-api.example.com"
# API_KEY and API_SECRET should be configured as secrets via:
# npx wrangler secret put API_KEY
# npx wrangler secret put API_SECRET

# Durable Objects
[[durable_objects.bindings]]
name = "MCP_OBJECT"
class_name = "YourMCP"

# Observability
[observability]
enabled = true

# Migrations (if needed)
[[migrations]]
tag = "v1"
new_sqlite_classes = ["YourMCP"]
```

#### `tsconfig.json` - TypeScript configuration:
```json
{
  "compilerOptions": {
    "target": "es2021",
    "lib": ["es2021"],
    "jsx": "react-jsx",
    "module": "es2022",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["./worker-configuration.d.ts", "node"]
  },
  "include": ["worker-configuration.d.ts", "src/**/*.ts"]
}
```

#### `biome.json` - Code formatting and linting:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentWidth": 4,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noInferrableTypes": "error",
        "noParameterAssign": "error"
      }
    }
  }
}
```

### 3. Core Implementation Files

#### `src/index.ts` - Main worker entry point:
```typescript
import { YourMCP } from "./server";

// Export the MCP class for Durable Objects
export { YourMCP };

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        // Direct SSE endpoint
        if (url.pathname === "/sse" || url.pathname === "/sse/message") {
            return YourMCP.serveSSE("/sse").fetch(request, env, ctx);
        }

        // HTTP endpoint
        if (url.pathname === "/mcp") {
            return YourMCP.serve("/mcp").fetch(request, env, ctx);
        }

        // Homepage
        if (url.pathname === "/") {
            return new Response(`
                <h1>Your MCP Server</h1>
                <p>MCP SSE Endpoint: /sse</p>
                <p>MCP HTTP Endpoint: /mcp</p>
                <p>Status: Ready</p>
            `, { 
                headers: { "content-type": "text/html" } 
            });
        }

        return new Response("Not found", { status: 404 });
    },
};
```

#### `src/server.ts` - Main MCP server implementation:
```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YourAPIUtils, YourEnvironment } from "./utils";

export class YourMCP extends McpAgent {
    server = new McpServer({
        name: "Your MCP Server",
        version: "1.0.0",
    });

    async init() {
        // Get environment variables
        const env = this.env as unknown as YourEnvironment;
        
        // Validate environment variables
        if (!env.BASE_URL || !env.API_KEY || !env.API_SECRET) {
            throw new Error('Missing required API environment variables');
        }

        // Define your tools
        this.server.tool(
            "example_tool",
            "Example tool description",
            z.object({
                param1: z.string().describe("Parameter description"),
                param2: z.number().optional().describe("Optional parameter"),
            }),
            async ({ param1, param2 }) => {
                try {
                    // Your tool implementation
                    const result = await YourAPIUtils.callAPI(env, param1, param2);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2)
                            }
                        ]
                    };
                } catch (error) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: ${error.message}`
                            }
                        ]
                    };
                }
            }
        );

        // Add more tools as needed
        this.addHealthCheckTool(env);
    }

    private addHealthCheckTool(env: YourEnvironment) {
        this.server.tool(
            "health_check",
            "Check API connectivity and authentication",
            z.object({}),
            async () => {
                try {
                    const health = await YourAPIUtils.healthCheck(env);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `✅ API Health Check: ${health.status}`
                            }
                        ]
                    };
                } catch (error) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `❌ API Health Check Failed: ${error.message}`
                            }
                        ]
                    };
                }
            }
        );
    }
}
```

#### `src/utils.ts` - API utilities:
```typescript
import { z } from "zod";

export interface YourEnvironment {
    BASE_URL: string;
    API_KEY: string;
    API_SECRET: string;
}

// Global token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

export class YourAPIUtils {
    static async getAccessToken(env: YourEnvironment): Promise<string> {
        // Check if we have a valid cached token
        if (accessToken && Date.now() < tokenExpiry) {
            return accessToken;
        }

        // Get new token
        const response = await fetch(`${env.BASE_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key: env.API_KEY,
                secret: env.API_SECRET,
            }),
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);
        
        return accessToken;
    }

    static async callAPI(env: YourEnvironment, param1: string, param2?: number): Promise<any> {
        const token = await this.getAccessToken(env);
        
        const response = await fetch(`${env.BASE_URL}/api/endpoint`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }

        return await response.json();
    }

    static async healthCheck(env: YourEnvironment): Promise<{ status: string }> {
        const token = await this.getAccessToken(env);
        
        const response = await fetch(`${env.BASE_URL}/health`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        return { status: 'OK' };
    }
}
```

#### `worker-configuration.d.ts` - Type definitions:
```typescript
// Generate this file using: npx wrangler types
declare namespace Cloudflare {
    interface Env {
        MCP_OBJECT: DurableObjectNamespace<import("./src/index").YourMCP>;
        BASE_URL: string;
        API_KEY: string;
        API_SECRET: string;
    }
}
interface Env extends Cloudflare.Env {}
```

### 4. Advanced Features

#### Pagination Support:
```typescript
// Add to utils.ts
export interface PaginationCursor {
    pageNo: number;
    pageSize: number;
    totalItems?: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    nextCursor?: string;
}

export function encodeCursor(cursor: PaginationCursor): string {
    return btoa(JSON.stringify(cursor));
}

export function decodeCursor(cursor: string): PaginationCursor {
    try {
        return JSON.parse(atob(cursor));
    } catch (error) {
        throw new Error('Invalid cursor format');
    }
}
```

#### Error Handling:
```typescript
// Wrap API calls with proper error handling
static async safeAPICall<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
        return await apiCall();
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`API Error: ${error.message}`);
        }
        throw new Error('Unknown API error occurred');
    }
}
```

### 5. Development and Deployment

#### Local Development:
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector

# Type checking
npm run type-check

# Format code
npm run format

# Lint and fix
npm run lint:fix
```

#### Setting up environment secrets:
```bash
# Set environment variables as secrets
npx wrangler secret put API_KEY
npx wrangler secret put API_SECRET
```

#### Deployment:
```bash
# Generate types
npm run cf-typegen

# Deploy to Cloudflare Workers
npm run deploy

# View logs
npx wrangler tail
```

### 6. Testing and Integration

#### Local Testing:
1. Run `npm run dev` to start the development server
2. Use the MCP Inspector to test tools: `npx @modelcontextprotocol/inspector`
3. Access the SSE endpoint at `http://localhost:8787/sse`

#### Claude Desktop Integration:
Add to Claude Desktop's MCP configuration:
```json
{
  "mcpServers": {
    "your-mcp-server": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-everything", "--port", "3000"],
      "env": {
        "MCP_SERVER_URL": "https://your-worker.your-subdomain.workers.dev/sse"
      }
    }
  }
}
```

### 7. Best Practices

#### Code Organization:
- Separate API logic into utility functions
- Use TypeScript for type safety
- Implement proper error handling
- Use Zod for input validation

#### Performance:
- Implement token caching to avoid repeated authentication
- Use pagination for large datasets
- Optimize API calls to reduce token usage

#### Security:
- Store sensitive data as Cloudflare Workers secrets
- Validate all inputs using Zod schemas
- Implement proper authentication flows

#### Monitoring:
- Enable Cloudflare Workers observability
- Use `wrangler tail` for real-time logging
- Implement health check endpoints

### 8. Customization Points

To adapt this template for your specific use case:

1. **Replace API Integration**: Update `utils.ts` with your API endpoints and authentication methods
2. **Define Your Tools**: Add MCP tools in `server.ts` that match your API capabilities
3. **Update Environment Variables**: Modify `wrangler.toml` and type definitions for your required secrets
4. **Customize Responses**: Format API responses to be Claude-friendly
5. **Add Business Logic**: Implement any specific data processing or business rules

### 9. Common Patterns

#### Tool Definition Pattern:
```typescript
this.server.tool(
    "tool_name",
    "Tool description for Claude",
    z.object({
        // Input schema
    }),
    async (params) => {
        // Tool implementation
        return {
            content: [{ type: "text", text: "Result" }]
        };
    }
);
```

#### API Call Pattern:
```typescript
static async apiMethod(env: YourEnvironment, ...params): Promise<ResultType> {
    const token = await this.getAccessToken(env);
    const response = await fetch(`${env.BASE_URL}/endpoint`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
    }
    
    return await response.json();
}
```

This guide provides a comprehensive foundation for building MCP servers on Cloudflare Workers. Adapt the patterns and examples to match your specific API integration and business requirements.