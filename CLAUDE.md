# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run format` - Format code with Biome
- `npm run lint:fix` - Run linter and auto-fix issues
- `npm run type-check` - Run TypeScript type checking
- `npm run cf-typegen` - Generate Cloudflare Worker types

## Architecture Overview

This is a **comprehensive Cloudflare Workers-based MCP (Model Context Protocol) server** that provides IoT device management capabilities through the Acceleronix IoT platform. The architecture follows enterprise patterns from the MCP creation guide.

### Core Components

- **VirtualDataMCP class** (`src/server.ts`) - Main IoT MCP agent extending `McpAgent` from the `agents` package
- **IoT API Utilities** (`src/utils.ts`) - Handles SHA-256 authentication, token caching, and Acceleronix IoT API operations
- **Request Routing** (`src/index.ts`) - Main fetch handler routes `/sse` and `/mcp` endpoints with IoT homepage

### MCP Server Structure

The server uses the `@modelcontextprotocol/sdk` and follows this pattern:
1. Extend `McpAgent` class in separate server file
2. Create `McpServer` instance with descriptive name/version
3. Register tools in `init()` method with comprehensive error handling
4. Validate environment variables and implement authentication

### Tool Categories

The server provides comprehensive IoT device management tools organized into 5 categories:
- **Health Check** - IoT API connectivity verification
- **Product Management** - List products, TSL definitions, thing models with pagination
- **Device Management** - List devices, device details with pagination
- **Device Control** - Power switch control, fan mode control
- **Device Data & Historical** - Location queries, resource monitoring, shadow data, historical data/events

### Advanced Features

- **SHA-256 Authentication** - Secure authentication with access key/secret and token caching
- **Pagination Support** - Cursor-based pagination with encoding/decoding for large datasets
- **TSL Integration** - Thing Specification Language support for device capabilities
- **Device Control** - Real-time device control (FAN_SWITCH, FAN_MODE)
- **Comprehensive Error Handling** - Graceful error handling with user-friendly messages
- **Environment Validation** - Strict validation of required IoT environment variables
- **Type Safety** - Full TypeScript typing with Zod schema validation

### Cloudflare Workers Integration

- Uses **Durable Objects** for MCP server instances
- Configured with `nodejs_compat` flag
- SSE (Server-Sent Events) endpoint at `/sse`
- Traditional MCP endpoint at `/mcp`
- Homepage at `/` with IoT server information and tool list

## Key Files

- `src/server.ts` - Main IoT MCP server implementation with 17 IoT tools
- `src/utils.ts` - IoT API utilities, SHA-256 authentication, and pagination
- `src/index.ts` - Worker entry point and request routing with IoT homepage
- `wrangler.toml` - Cloudflare Workers configuration with IoT API secrets
- `worker-configuration.d.ts` - TypeScript definitions for IoT environment
- `biome.json` - Code formatting and linting configuration

## Environment Variables

The server requires these environment variables (set as Cloudflare Workers secrets):
- `BASE_URL` - Base API URL for the Acceleronix IoT platform (https://iot-api.acceleronix.io)
- `ACCESS_KEY` - Access key for Acceleronix IoT API authentication
- `ACCESS_SECRET` - Access secret for Acceleronix IoT API authentication

Set secrets using:
```bash
npx wrangler secret put ACCESS_KEY
npx wrangler secret put ACCESS_SECRET
```

## Development Notes

- Uses TypeScript with strict mode enabled
- Biome for formatting/linting (4-space indentation, 100 line width)
- Cloudflare Workers runtime environment
- Comprehensive error handling and user feedback
- SHA-256 authentication with token caching for performance optimization
- Cursor-based pagination for large IoT datasets
- TSL (Thing Specification Language) support for device capabilities
- Real-time device control and monitoring capabilities

## GitHub Configuration

To push changes to the GitHub repository, use the `acc_github` SSH key:

```bash
# Configure SSH key for GitHub access
ssh-add ~/.ssh/acc_github

# Verify SSH connection to GitHub
ssh -T git@github.com

# Push changes to remote repository
git push origin main
```

The repository is configured to use SSH authentication with the Acceleronix organization account.