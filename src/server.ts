import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	type EUOneEnvironment,
	EUOneAPIUtils,
} from "./utils";
import { z } from "zod";

export class VirtualDataMCP extends McpAgent {
	server = new McpServer({
		name: "Acceleronix SaaS IoT MCP Server",
		version: "2.0.0",
	});


	async init() {
		console.log("🚀 MCP Server starting initialization...");
		const env = this.env as unknown as EUOneEnvironment;

		// Log environment variables for debugging (without sensitive values)
		console.log("🔍 Environment check:");
		console.log("  - BASE_URL:", env.BASE_URL ? "✅ Set" : "❌ Missing");
		console.log("  - APP_ID:", env.APP_ID ? "✅ Set" : "❌ Missing");
		console.log("  - APP_SECRET:", env.APP_SECRET ? "✅ Set" : "❌ Missing");  
		console.log("  - INDUSTRY_CODE:", env.INDUSTRY_CODE ? "✅ Set" : "❌ Missing");

		// Validate environment variables - but don't throw error to allow tools registration
		if (!env.BASE_URL || !env.APP_ID || !env.APP_SECRET || !env.INDUSTRY_CODE) {
			console.error(
				"❌ Missing required Acceleronix SaaS API environment variables: BASE_URL, APP_ID, APP_SECRET, INDUSTRY_CODE",
			);
			console.log("⚠️ MCP server will start with limited functionality - tools will show authentication errors");
		}

		// Always register tools first, regardless of environment validation
		console.log("📋 Registering MCP tools...");
		
		// Health check / login test tool
		this.addHealthCheckTool(env);
		console.log("✅ Health check tool registered");

		// Product list tool
		this.addProductListTool(env);
		console.log("✅ Product list tools registered");

		// Product details tool
		this.addProductDetailsTool(env);
		console.log("✅ Product details tool registered");

		// Upload device data tool
		this.addUploadDeviceDataTool(env);
		console.log("✅ Upload device data tool registered");

		// Device list tool
		this.addDeviceListTool(env);
		console.log("✅ Device list tool registered");

		// Product TSL tool
		this.addProductTslTool(env);
		console.log("✅ Product TSL tool registered");

		// Device location tool
		this.addDeviceLocationTool(env);
		console.log("✅ Device location tool registered");

		// Set device location tool
		this.addSetDeviceLocationTool(env);
		console.log("✅ Set device location tool registered");

		// Device details tool
		this.addDeviceDetailsTool(env);
		console.log("✅ Device details tool registered");

		// Device properties tool
		this.addDevicePropertiesTool(env);
		console.log("✅ Device properties tool registered");

		console.log("📋 MCP tools registered successfully");

		// Auto-login on server initialization with improved error handling
		// This happens AFTER tools are registered and ensures token is ready for immediate use
		if (env.BASE_URL && env.APP_ID && env.APP_SECRET && env.INDUSTRY_CODE) {
			try {
				console.log("🔐 Pre-warming authentication for better user experience...");
				await EUOneAPIUtils.getAccessToken(env);
				console.log("✅ Authentication pre-warmed - MCP server ready for immediate use");
			} catch (error) {
				console.error("❌ Authentication pre-warming failed:", error);
				// Don't throw error here - allow server to start even if login fails
				// Login will be attempted when tools are called with automatic refresh
				console.log(
					"⚠️ MCP server started without pre-warmed authentication - login will be attempted on first tool use with auto-refresh",
				);
			}
		} else {
			console.log("⚠️ Skipping authentication pre-warming due to missing environment variables");
		}

		console.log("🚀 MCP Server initialization completed");
	}

	private addHealthCheckTool(env: EUOneEnvironment) {
		this.server.tool(
			"health_check",
			"Comprehensive health check - test authentication, token status, and API connectivity",
			{
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			async (args) => {
				try {
					const healthStatus = await EUOneAPIUtils.healthCheck(env);
					
					let statusText = `🏥 **MCP Server Health Check**\n\n`;
					statusText += `✅ **Authentication**: ${healthStatus.status}\n`;
					statusText += `🔑 **Token Status**: ${healthStatus.tokenStatus}\n`;
					statusText += `⏰ **Token Expires**: ${healthStatus.tokenExpiry}\n`;
					statusText += `🌐 **API Connectivity**: ${healthStatus.apiConnectivity}\n\n`;
					
					if (healthStatus.apiConnectivity === "OK") {
						statusText += `🎯 **Overall Status**: All systems operational - ready for Claude Desktop use\n`;
					} else {
						statusText += `⚠️ **Overall Status**: Authentication OK but API connectivity issues detected\n`;
					}
					
					return {
						content: [
							{
								type: "text",
								text: statusText,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `❌ **Health Check Failed**: ${error instanceof Error ? error.message : "Unknown error"}\n\nThis may indicate authentication issues or network connectivity problems.`,
							},
						],
					};
				}
			},
		);
		
	}




	private addProductListTool(env: EUOneEnvironment) {
		// Unified product list tool with intelligent pagination
		this.server.tool(
			"get_product_list",
			"Get list of products with intelligent pagination and filtering. Automatically optimized for different scenarios.",
			{
				type: "object",
				properties: {
					productName: {
						type: "string",
						description: "Filter by product name (optional)",
					},
					productKey: {
						type: "string",
						description: "Filter by specific product key (optional)",
					},
					releaseStatus: {
						type: "number",
						description: "Filter by release status: 0=unpublished, 1=published (optional)",
					},
					searchValue: {
						type: "string",
						description: "Search products by name or key (optional)",
					},
					pageSize: {
						type: "number",
						description: "Number of products per page, max 200 (default: 50). Use pageSize: 31 to get all your products.",
					},
					pageNum: {
						type: "number", 
						description: "Page number starting from 1 (optional, default: 1)",
					},
				},
				required: [],
			},
			async (args) => {
				try {
					console.log(
						"🚀 get_product_list called with args:",
						JSON.stringify(args, null, 2),
					);

					const DEFAULT_PAGE_SIZE = 50; // Large enough to get most product lists in one call
					const MAX_PAGE_SIZE = 200; // API limit

					// Apply intelligent page size optimization
					const hasFilters = args && (args.productName || args.productKey || args.searchValue || typeof args.releaseStatus === "number");
					let pageSize = DEFAULT_PAGE_SIZE;
					
					// Use custom page size if provided, but respect API limits
					if (args && typeof args.pageSize === "number") {
						pageSize = Math.min(args.pageSize, MAX_PAGE_SIZE);
					}
					
					// Build API options
					const options = {
						pageNum: 1, // Always start with first page for simplicity
						pageSize: pageSize,
						...(args &&
							typeof args === "object" && {
								...(args.productName && { productName: args.productName }),
								...(args.productKey && { productKey: args.productKey }),
								...(typeof args.releaseStatus === "number" && {
									releaseStatus: args.releaseStatus,
								}),
								...(args.searchValue && { searchValue: args.searchValue }),
							}),
					};

					console.log(
						"📋 API request options:",
						JSON.stringify(options, null, 2),
					);

					// Use centralized token management from utils
					const productData = await EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
						console.log("🔐 Using centralized token for product list");

						const queryParams = new URLSearchParams();
						queryParams.append("pageNum", String(options.pageNum));
						queryParams.append("pageSize", String(options.pageSize));
						
						// FIX: Only pass pageNum and pageSize as per user specification
						// Removed optional filters that may cause 403 errors

						const apiUrl = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
						console.log("📋 API URL:", apiUrl);

						const apiResponse = await fetch(apiUrl, {
							method: "GET",
							headers: {
								Authorization: token,  // FIX: Direct token, no "Bearer " prefix
								"Accept-Language": "en-US",
								"Content-Type": "application/json",
							},
						});

						console.log("📡 API response status:", apiResponse.status);

						if (!apiResponse.ok) {
							const errorText = await apiResponse.text();
							console.error("❌ API error response:", errorText);
							throw new Error(
								`API call failed: ${apiResponse.status} - ${errorText}`,
							);
						}

						const result = (await apiResponse.json()) as any;
						
						// ===== COMPREHENSIVE API RESPONSE LOGGING =====
						console.log("🔍 === COMPLETE PRODUCT LIST API RESPONSE ===");
						console.log("📋 Full API Response (Pretty Print):");
						console.log(JSON.stringify(result, null, 2));
						console.log("🔢 Response Type:", typeof result);
						console.log("📊 Response Keys:", result ? Object.keys(result) : "No keys");
						console.log("📦 Data Structure Analysis:");
						console.log("  - code:", result.code);
						console.log("  - msg:", result.msg);
						console.log("  - data type:", typeof result.data);
						console.log("  - rows type:", typeof result.rows);
						console.log("  - rows length:", result.rows?.length || "No rows");
						console.log("  - total:", result.total);
						
						if (result.rows && Array.isArray(result.rows)) {
							console.log("📋 Products Array Details:");
							result.rows.forEach((product: any, index: number) => {
								console.log(`  Product ${index + 1}:`);
								console.log(`    - Keys: ${Object.keys(product)}`);
								console.log(`    - Product Name: ${product.productName}`);
								console.log(`    - Product Key: ${product.productKey}`);
								console.log(`    - Product ID: ${product.productId}`);
								console.log(`    - Full Product Data: ${JSON.stringify(product, null, 4)}`);
							});
						}
						console.log("🔍 === END COMPLETE API RESPONSE ===");
						// ===== END COMPREHENSIVE LOGGING =====

						if (result.code !== 200) {
							throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
						}

						return result;
					});

					// Format the simplified response
					const products = productData.rows || [];
					const total = productData.total || 0;

					console.log(
						"✅ Successfully retrieved",
						products.length,
						"products out of",
						total,
						"total",
					);

					let responseText = `📋 **Product List**\n`;
					responseText += `Found ${products.length} products (Total: ${total})\n`;
					if (total > products.length) {
						responseText += `💡 Showing ${products.length} of ${total} products. Use pageSize: ${Math.min(200, total)} to get all products.\n`;
					}
					responseText += `============================================================\n\n`;

					if (products.length === 0) {
						responseText += "❌ No products found.\n\n";
					} else {
						products.forEach((product: any, index: number) => {
							responseText += `${index + 1}. **${product.productName || "Unnamed Product"}**\n`;
							responseText += `   📋 Product Key: \`${product.productKey || "N/A"}\`\n`;
							responseText += `   🆔 Product ID: ${product.id || "N/A"}\n`;  // FIX: Use 'id' field
							responseText += `   🏢 Vendor: ${product.vendorName || "N/A"} (ID: ${product.vendorId || "N/A"})\n`;
							responseText += `   🏷️ Category: ${product.categoryName || "N/A"} - ${product.itemValue || "N/A"}\n`;
							responseText += `   📊 Devices: ${product.deviceNum || 0}\n`;

							// Status with emojis - FIX: releaseStatus = 2 means Published based on JSON
							const statusEmoji = product.releaseStatus === 2 ? "✅" : "⏸️";
							const statusText = product.releaseStatus === 2 ? "Published" : "Unpublished";
							responseText += `   ${statusEmoji} Status: ${statusText}\n`;

							// Access type - enhanced mapping
							const getAccessType = (type: number) => {
								switch(type) {
									case 0: return { emoji: "🌐", text: "Public" };
									case 1: return { emoji: "🔒", text: "Private" };
									case 2: return { emoji: "🏢", text: "Enterprise" };
									default: return { emoji: "❓", text: "Unknown" };
								}
							};
							const access = getAccessType(product.accessType);
							responseText += `   ${access.emoji} Access: ${access.text}\n`;

							if (product.tsCreateTime) {  // FIX: Use 'tsCreateTime' field
								const createTime = new Date(product.tsCreateTime).toLocaleDateString();
								responseText += `   📅 Created: ${createTime}\n`;
							}

							responseText += `\n`;
						});

						if (total > products.length) {
							responseText += `📊 **Summary**: Showing ${products.length} of ${total} total products\n`;
							responseText += `💡 To see all products at once, call: get_product_list with pageSize: ${total}\n`;
							responseText += `📄 Or browse by pages: pageNum: 2, pageNum: 3, etc.\n`;
						}
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_product_list error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting product list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}


	private addUploadDeviceDataTool(env: EUOneEnvironment) {
		this.server.tool(
			"upload_device_data",
			{
				deviceKey: z.string().describe("Device key to upload data for (required, e.g., 'VDU1293621240625108')"),
				productKey: z.string().describe("Product key for the device (required, e.g., 'pe17Ez' from get_product_list)"),
				data: z.record(z.any()).describe("Device TSL model data as key-value pairs (required, e.g., {\"temperature\": 26.7, \"humidity\": 68})"),
				upTsTime: z.number().optional().describe("Upload timestamp in milliseconds (optional, defaults to current time)")
			},
			async ({ deviceKey, productKey, data, upTsTime }) => {
				console.log("🔥 upload_device_data function ENTRY - parameters:", { deviceKey, productKey, data, upTsTime });
				
				try {
					console.log("🚀 upload_device_data called with parameters:", { deviceKey, productKey, data, upTsTime });

					// Parameter validation
					if (!deviceKey || typeof deviceKey !== "string" || deviceKey.trim() === "") {
						throw new Error("deviceKey is required and must be a non-empty string");
					}

					if (!productKey || typeof productKey !== "string" || productKey.trim() === "") {
						throw new Error("productKey is required and must be a non-empty string");
					}

					if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
						throw new Error("data is required and must be a non-empty object with device property values");
					}

					const validDeviceKey = deviceKey.trim();
					const validProductKey = productKey.trim();
					const timestamp = upTsTime || Date.now();

					console.log("✅ Using validated parameters:", { 
						deviceKey: validDeviceKey, 
						productKey: validProductKey, 
						data,
						upTsTime: timestamp
					});

					// Call the API using existing reportDeviceData method
					const uploadResult = await EUOneAPIUtils.reportDeviceData(env, {
						deviceKey: validDeviceKey,
						productKey: validProductKey,
						data: data,
						upTsTime: timestamp
					});

					console.log("✅ Device data uploaded successfully");

					// Format the response
					let responseText = `📤 **Device Data Upload Result**\n`;
					responseText += `Device Key: \`${validDeviceKey}\`\n`;
					responseText += `Product Key: \`${validProductKey}\`\n`;
					responseText += `Upload Time: ${new Date(timestamp).toISOString()}\n`;
					responseText += `Data Properties: ${Object.keys(data).length} properties\n`;
					responseText += `============================================================\n\n`;

					if (uploadResult.code === 200) {
						responseText += `✅ **Upload Successful**\n`;
						responseText += `Status: ${uploadResult.msg || "Data uploaded successfully"}\n\n`;
						
						responseText += `📊 **Uploaded Data:**\n`;
						Object.entries(data).forEach(([key, value]) => {
							responseText += `   • ${key}: ${value}\n`;
						});
						
						responseText += `\n💡 The device data has been successfully uploaded to the IoT platform.\n`;
					} else {
						responseText += `❌ **Upload Failed**\n`;
						responseText += `Error: ${uploadResult.msg || "Unknown error"}\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ upload_device_data error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error uploading device data: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceListTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_list",
			{
				pageNum: z.number().optional().describe("Page number starting from 1 (optional, default: 1)"),
				pageSize: z.number().optional().describe("Number of devices per page, max 1000 (optional, default: 10)"),
				productId: z.number().optional().describe("Product ID to filter devices (optional, e.g., 2989)"),
				deviceKey: z.string().optional().describe("Device key to filter by specific device (optional)"),
				deviceName: z.string().optional().describe("Device name to filter by device name (optional)"),
				deviceQueryKey: z.string().optional().describe("Search by device key, name, or SN (optional)"),
				activationStatus: z.number().optional().describe("Activation status: 0=not activated, 1=activated (optional, default: 1)"),
				onlineStatus: z.number().optional().describe("Online status: 0=offline, 1=online (optional)"),
				runningStatus: z.number().optional().describe("Running status: 1=normal, 2=alarm, 3=fault, 4=fault+alarm (optional)"),
				accessType: z.number().optional().describe("Device type: 0=direct device, 1=gateway, 2=gateway sub-device (optional)"),
				productKey: z.string().optional().describe("Product key to filter devices (optional, e.g., 'pe17Ez')"),
				orgId: z.number().optional().describe("Organization ID to filter devices (optional)")
			},
			async ({ pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId }) => {
				console.log("🔥 get_device_list function ENTRY - parameters:", { pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId });
				
				try {
					console.log("🚀 get_device_list called with parameters:", { pageNum, pageSize, productId, deviceKey, deviceName, deviceQueryKey, activationStatus, onlineStatus, runningStatus, accessType, productKey, orgId });

					// Call the API
					const deviceListData = await EUOneAPIUtils.getDeviceList(env, {
						pageNum,
						pageSize,
						productId,
						deviceKey,
						deviceName,
						deviceQueryKey,
						activationStatus,
						onlineStatus,
						runningStatus,
						accessType,
						productKey,
						orgId
					});

					// Format the response
					const devices = deviceListData.rows || [];
					const total = deviceListData.total || 0;
					
					console.log("✅ Successfully retrieved", devices.length, "devices out of", total, "total");

					let responseText = `📱 **Device List**\n`;
					responseText += `Found ${devices.length} devices (Total: ${total})\n`;
					if (total > devices.length) {
						responseText += `💡 Showing ${devices.length} of ${total} devices. Use pageNum and pageSize parameters for pagination.\n`;
					}
					responseText += `============================================================\n\n`;

					if (devices.length === 0) {
						responseText += "❌ No devices found matching the criteria.\n\n";
					} else {
						devices.forEach((device: any, index: number) => {
							responseText += `${index + 1}. **${device.deviceName || "Unnamed Device"}**\n`;
							responseText += `   📋 Device Key: \`${device.deviceKey || "N/A"}\`\n`;
							responseText += `   🆔 Device ID: ${device.deviceId || "N/A"}\n`;
							responseText += `   📦 Product: ${device.productName || "N/A"} (\`${device.productKey || "N/A"}\`)\n`;
							responseText += `   🏢 Organization: ${device.orgName || "N/A"} (ID: ${device.orgId || "N/A"})\n`;

							// Status indicators
							const onlineEmoji = device.onlineStatus === 1 ? "🟢" : "🔴";
							const onlineText = device.onlineStatus === 1 ? "Online" : "Offline";
							responseText += `   ${onlineEmoji} Status: ${onlineText}\n`;

							const activationEmoji = device.activationStatus === 1 ? "✅" : "⏸️";
							const activationText = device.activationStatus === 1 ? "Activated" : "Not Activated";
							responseText += `   ${activationEmoji} Activation: ${activationText}\n`;

							// Running status
							const runningStatusMap: Record<number, { emoji: string; text: string }> = {
								1: { emoji: "✅", text: "Normal" },
								2: { emoji: "⚠️", text: "Alarm" },
								3: { emoji: "❌", text: "Fault" },
								4: { emoji: "🚨", text: "Fault+Alarm" }
							};
							const runningInfo = runningStatusMap[device.runningStatus as number] || { emoji: "❓", text: "Unknown" };
							responseText += `   ${runningInfo.emoji} Running: ${runningInfo.text}\n`;

							// Device type
							const accessTypeMap: Record<number, string> = {
								0: "📡 Direct Device",
								1: "🌐 Gateway",  
								2: "📟 Gateway Sub-device"
							};
							const deviceType = accessTypeMap[device.accessType as number] || "❓ Unknown";
							responseText += `   ${deviceType}\n`;

							// Network type
							const netWayMap: Record<number, string> = {
								1: "📶 WiFi",
								2: "📱 Cellular",
								3: "📡 NB-IoT",
								4: "🔗 Other"
							};
							const netType = netWayMap[device.netWay as number] || "❓ Unknown";
							responseText += `   ${netType}\n`;

							// Timestamps
							if (device.tsLastOnlineTime) {
								const lastOnline = new Date(device.tsLastOnlineTime).toLocaleString();
								responseText += `   ⏰ Last Online: ${lastOnline}\n`;
							}

							if (device.tsCreateTime) {
								const createTime = new Date(device.tsCreateTime).toLocaleString();
								responseText += `   📅 Created: ${createTime}\n`;
							}

							// Model and additional info
							if (device.modelSpec) {
								responseText += `   🔧 Model: ${device.modelSpec}\n`;
							}

							if (device.iccid) {
								responseText += `   📇 ICCID: ${device.iccid}\n`;
							}

							// Device properties (if available)
							if (device.prop && Object.keys(device.prop).length > 0) {
								responseText += `   📊 **Current Data**:\n`;
								Object.entries(device.prop).forEach(([key, value]) => {
									if (typeof value === 'object' && value !== null) {
										responseText += `     • ${key}: ${JSON.stringify(value)}\n`;
									} else {
										responseText += `     • ${key}: ${value}\n`;
									}
								});
							}

							responseText += `\n`;
						});

						if (total > devices.length) {
							responseText += `📊 **Summary**: Showing ${devices.length} of ${total} total devices\n`;
							responseText += `💡 Use pageNum and pageSize parameters for pagination\n`;
							responseText += `📄 Example: get_device_list with pageNum: 2, pageSize: 20\n`;
						}
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_device_list error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device list: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addProductTslTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_product_tsl",
			{
				productKey: z.string().describe("Product key to get TSL properties for (required, e.g., 'pe17Ez' from get_product_list)"),
				labelId: z.number().optional().describe("Label ID to filter properties by (optional)"),
				propCode: z.string().optional().describe("Property code to filter by specific property (optional)"),
				propName: z.string().optional().describe("Property name to filter by specific property name (optional)")
			},
			async ({ productKey, labelId, propCode, propName }) => {
				console.log("🔥 get_product_tsl function ENTRY - parameters:", { productKey, labelId, propCode, propName });
				
				try {
					console.log("🚀 get_product_tsl called with parameters:", { productKey, labelId, propCode, propName });

					// Parameter validation
					if (!productKey || typeof productKey !== "string" || productKey.trim() === "") {
						throw new Error("productKey is required and must be a non-empty string");
					}

					const validProductKey = productKey.trim();

					console.log("✅ Using validated parameters:", { 
						productKey: validProductKey, 
						labelId,
						propCode,
						propName
					});

					// Call the API using the new getProductTsl method
					const tslResult = await EUOneAPIUtils.getProductTsl(env, {
						productKey: validProductKey,
						labelId,
						propCode,
						propName
					});

					console.log("✅ Product TSL data retrieved successfully");

					// Format the response
					const tslProperties = tslResult.data || [];
					
					let responseText = `📋 **Product TSL Properties**\n`;
					responseText += `Product Key: \`${validProductKey}\`\n`;
					responseText += `Found ${tslProperties.length} properties\n`;
					responseText += `============================================================\n\n`;

					if (tslProperties.length === 0) {
						responseText += "❌ No TSL properties found for this product.\n\n";
					} else {
						tslProperties.forEach((prop: any, index: number) => {
							responseText += `${index + 1}. **${prop.name || "Unnamed Property"}**\n`;
							responseText += `   📋 Code: \`${prop.code || "N/A"}\`\n`;
							responseText += `   🆔 ID: ${prop.id || "N/A"}\n`;
							responseText += `   📊 Data Type: ${prop.dataType || "N/A"}\n`;
							responseText += `   🔧 Type: ${prop.type || "N/A"}\n`;
							responseText += `   📝 Sub Type: ${prop.subType || "N/A"}\n`;
							
							if (prop.desc) {
								responseText += `   📖 Description: ${prop.desc}\n`;
							}

							// Control and display settings
							const controlEmoji = prop.enableControl ? "✅" : "❌";
							responseText += `   ${controlEmoji} Controllable: ${prop.enableControl ? "Yes" : "No"}\n`;
							
							const displayEmoji = prop.display ? "👁️" : "🚫";
							responseText += `   ${displayEmoji} Display: ${prop.display ? "Yes" : "No"}\n`;

							if (prop.unit) {
								responseText += `   📏 Unit: ${prop.unit}\n`;
							}

							// Specs information
							if (prop.specs && Array.isArray(prop.specs) && prop.specs.length > 0) {
								responseText += `   📐 **Specifications:**\n`;
								prop.specs.forEach((spec: any, specIndex: number) => {
									if (spec.name) {
										responseText += `     ${specIndex + 1}. ${spec.name}\n`;
									}
									if (spec.dataType) {
										responseText += `        • Data Type: ${spec.dataType}\n`;
									}
									if (spec.min !== null && spec.min !== undefined) {
										responseText += `        • Min: ${spec.min}\n`;
									}
									if (spec.max !== null && spec.max !== undefined) {
										responseText += `        • Max: ${spec.max}\n`;
									}
									if (spec.step !== null && spec.step !== undefined) {
										responseText += `        • Step: ${spec.step}\n`;
									}
									if (spec.unit) {
										responseText += `        • Unit: ${spec.unit}\n`;
									}
									if (spec.value !== null && spec.value !== undefined) {
										responseText += `        • Value: ${spec.value}\n`;
									}
									// Handle nested specs (like RGB color components)
									if (spec.specs && Array.isArray(spec.specs) && spec.specs.length > 0) {
										responseText += `        • Sub-specs: ${spec.specs.length} items\n`;
										spec.specs.forEach((subSpec: any, subIndex: number) => {
											if (subSpec.min !== null && subSpec.max !== null) {
												responseText += `          ${subIndex + 1}. Range: ${subSpec.min}-${subSpec.max}\n`;
											}
										});
									}
								});
							}

							if (prop.sortNum) {
								responseText += `   📊 Sort Order: ${prop.sortNum}\n`;
							}

							responseText += `\n`;
						});

						responseText += `📊 **Summary**: Retrieved ${tslProperties.length} TSL properties for product \`${validProductKey}\`\n`;
						responseText += `💡 These properties define how the device data should be structured and what controls are available.\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_product_tsl error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting product TSL: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceLocationTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_location",
			"Get device location information including GPS coordinates, address, and positioning details",
			{
				deviceId: z.number().describe("Device ID to get location information for (required, e.g., 9644)")
			},
			async ({ deviceId }) => {
				console.log("🔥 get_device_location function ENTRY - parameters:", { deviceId });
				
				try {
					console.log("🚀 get_device_location called with parameters:", { deviceId });

					// Parameter validation
					if (!deviceId || typeof deviceId !== "number") {
						throw new Error("deviceId is required and must be a number");
					}

					console.log("✅ Using validated parameters:", { deviceId });

					// Call the API using the new getDeviceLocation method
					const locationResult = await EUOneAPIUtils.getDeviceLocation(env, {
						deviceId
					});

					console.log("✅ Device location data retrieved successfully");

					// Format the response
					const locationData = locationResult.data;
					
					if (!locationData) {
						return {
							content: [
								{
									type: "text",
									text: `❌ No location data found for device ID: ${deviceId}`,
								},
							],
						};
					}
					
					let responseText = `📍 **Device Location Information**\n`;
					responseText += `Device ID: \`${locationData.deviceId || deviceId}\`\n`;
					responseText += `Device Name: \`${locationData.deviceName || "N/A"}\`\n`;
					responseText += `Device Key: \`${locationData.deviceKey || "N/A"}\`\n`;
					responseText += `Product Key: \`${locationData.productKey || "N/A"}\`\n`;
					responseText += `============================================================\n\n`;

					// Location Mode and Type
					responseText += `📡 **Positioning Information**\n`;
					responseText += `   🔧 Locate Mode: ${locationData.locateMode || "N/A"}\n`;
					responseText += `   📊 Locate Type: ${locationData.locateType || "N/A"} (${locationData.locateTypeStr || "N/A"})\n`;
					
					if (locationData.tsLocateTime) {
						const locateTime = new Date(locationData.tsLocateTime);
						responseText += `   ⏰ Last Location Time: ${locateTime.toISOString()}\n`;
					}
					responseText += `\n`;

					// GPS Coordinates
					responseText += `🌐 **GPS Coordinates**\n`;
					if (locationData.wgsLng && locationData.wgsLat) {
						responseText += `   🗺️ WGS84: ${locationData.wgsLat}, ${locationData.wgsLng}\n`;
					}
					if (locationData.gcjLng && locationData.gcjLat) {
						responseText += `   🇨🇳 GCJ02: ${locationData.gcjLat}, ${locationData.gcjLng}\n`;
					}
					if (locationData.bdLng && locationData.bdLat) {
						responseText += `   🅱️ Baidu: ${locationData.bdLat}, ${locationData.bdLng}\n`;
					}
					responseText += `\n`;

					// Address Information
					if (locationData.address || locationData.detailAddress) {
						responseText += `📍 **Address Information**\n`;
						if (locationData.address) {
							responseText += `   🏠 Address: ${locationData.address}\n`;
						}
						if (locationData.detailAddress) {
							responseText += `   🏠 Detail Address: ${locationData.detailAddress}\n`;
						}
						responseText += `\n`;
					}

					// Device Status
					responseText += `📱 **Device Status**\n`;
					const onlineStatus = locationData.onlineStatus === 1 ? "🟢 Online" : "🔴 Offline";
					responseText += `   📶 Online Status: ${onlineStatus}\n`;
					responseText += `\n`;

					// Technical Details
					const technicalDetails = [];
					if (locationData.hdop !== null && locationData.hdop !== undefined) {
						technicalDetails.push(`HDOP: ${locationData.hdop}`);
					}
					if (locationData.satellites !== null && locationData.satellites !== undefined) {
						technicalDetails.push(`Satellites: ${locationData.satellites}`);
					}
					if (locationData.soc !== null && locationData.soc !== undefined) {
						technicalDetails.push(`SOC: ${locationData.soc}`);
					}
					if (locationData.speed !== null && locationData.speed !== undefined) {
						technicalDetails.push(`Speed: ${locationData.speed}`);
					}
					if (locationData.height !== null && locationData.height !== undefined) {
						technicalDetails.push(`Height: ${locationData.height}`);
					}
					if (locationData.ggaStatus !== null && locationData.ggaStatus !== undefined) {
						technicalDetails.push(`GGA Status: ${locationData.ggaStatus}`);
					}

					if (technicalDetails.length > 0) {
						responseText += `🔧 **Technical Details**\n`;
						technicalDetails.forEach(detail => {
							responseText += `   • ${detail}\n`;
						});
						responseText += `\n`;
					}

					// Mount Information
					if (locationData.mountId || locationData.mountName) {
						responseText += `🏔️ **Mount Information**\n`;
						if (locationData.mountId) {
							responseText += `   🆔 Mount ID: ${locationData.mountId}\n`;
						}
						if (locationData.mountName) {
							responseText += `   📛 Mount Name: ${locationData.mountName}\n`;
						}
						responseText += `\n`;
					}

					// Additional Information
					if (locationData.productFileUrl || locationData.localPhoto) {
						responseText += `📸 **Media Information**\n`;
						if (locationData.productFileUrl) {
							responseText += `   🔗 Product File URL: ${locationData.productFileUrl}\n`;
						}
						if (locationData.localPhoto) {
							responseText += `   📷 Local Photo: ${locationData.localPhoto}\n`;
						}
						responseText += `\n`;
					}

					responseText += `📊 **Summary**: Successfully retrieved location information for device \`${locationData.deviceName || deviceId}\`\n`;
					if (locationData.address) {
						responseText += `📍 Current location: ${locationData.address}\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_device_location error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device location: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addSetDeviceLocationTool(env: EUOneEnvironment) {
		this.server.tool(
			"set_device_location",
			"Set/update device location information with coordinates, address, and positioning details",
			{
				deviceId: z.number().describe("Device ID to set location for (required, e.g., 10997)"),
				coordinate: z.string().describe("GPS coordinates in format 'longitude,latitude' (required, e.g., '2.6749045410156214,44.8198351640713')"),
				locateMode: z.string().optional().describe("Location mode: 'REPORTING' (device reported) or 'MANUAL' (manually set) (optional, default: 'MANUAL')"),
				coordinateSystem: z.string().optional().describe("Coordinate system: 'WGS84', 'GCJ02', 'BD09' (optional, default: 'WGS84')"),
				address: z.string().optional().describe("Address description (optional, e.g., '6 Ldt Conilhergues, 12600 Brommat, France')"),
				detailAddress: z.string().optional().describe("Detailed address description (optional)"),
				localPhoto: z.string().optional().describe("Local photo URL or base64 string (optional)"),
				mountId: z.number().optional().describe("Mount point ID for installation location (optional)"),
				locateType: z.number().optional().describe("Location type: 0=GNSS, 1=LBS, 2=Manual, 3=WiFi (optional)"),
				adCode: z.string().optional().describe("Administrative area code (optional)"),
				ggaStatus: z.number().optional().describe("GGA status for GPS quality (0-9, optional)"),
				height: z.number().optional().describe("Altitude in meters (optional)"),
				speed: z.number().optional().describe("Ground speed in knots (optional)")
			},
			async ({ deviceId, coordinate, locateMode, coordinateSystem, address, detailAddress, localPhoto, mountId, locateType, adCode, ggaStatus, height, speed }) => {
				console.log("🔥 set_device_location function ENTRY - parameters:", { 
					deviceId, coordinate, locateMode, coordinateSystem, address, detailAddress, 
					localPhoto, mountId, locateType, adCode, ggaStatus, height, speed 
				});
				
				try {
					console.log("🚀 set_device_location called with parameters:", { 
						deviceId, coordinate, locateMode, coordinateSystem, address 
					});

					// Parameter validation
					if (!deviceId || typeof deviceId !== "number") {
						throw new Error("deviceId is required and must be a number");
					}

					if (!coordinate || typeof coordinate !== "string" || coordinate.trim() === "") {
						throw new Error("coordinate is required and must be a non-empty string in format 'longitude,latitude'");
					}

					// Validate coordinate format (should be "longitude,latitude")
					const coordParts = coordinate.trim().split(",");
					if (coordParts.length !== 2) {
						throw new Error("coordinate must be in format 'longitude,latitude' (e.g., '2.6749045410156214,44.8198351640713')");
					}

					const [lng, lat] = coordParts;
					if (isNaN(Number(lng)) || isNaN(Number(lat))) {
						throw new Error("coordinate values must be valid numbers");
					}

					console.log("✅ Using validated parameters:", { 
						deviceId, 
						coordinate: coordinate.trim(),
						locateMode: locateMode || "MANUAL",
						coordinateSystem: coordinateSystem || "WGS84"
					});

					// Call the API using the new setDeviceLocation method
					const locationResult = await EUOneAPIUtils.setDeviceLocation(env, {
						deviceId,
						coordinate: coordinate.trim(),
						locateMode,
						coordinateSystem,
						address,
						detailAddress,
						localPhoto,
						mountId,
						locateType,
						adCode,
						ggaStatus,
						height,
						speed
					});

					console.log("✅ Device location set successfully");

					// Format the response
					let responseText = `📍 **Device Location Updated Successfully**\n`;
					responseText += `Device ID: \`${deviceId}\`\n`;
					responseText += `Coordinates: \`${coordinate.trim()}\`\n`;
					responseText += `Location Mode: \`${locateMode || "MANUAL"}\`\n`;
					responseText += `Coordinate System: \`${coordinateSystem || "WGS84"}\`\n`;
					responseText += `============================================================\n\n`;

					// Show what was set
					responseText += `✅ **Location Information Set:**\n`;
					if (address) {
						responseText += `   🏠 Address: ${address}\n`;
					}
					if (detailAddress) {
						responseText += `   🏠 Detail Address: ${detailAddress}\n`;
					}
					if (mountId !== undefined && mountId !== null) {
						responseText += `   🏔️ Mount ID: ${mountId}\n`;
					}
					if (locateType !== undefined) {
						const locateTypeStr = ["GNSS", "LBS", "Manual", "WiFi"][locateType] || "Unknown";
						responseText += `   📡 Location Type: ${locateType} (${locateTypeStr})\n`;
					}
					if (height !== undefined) {
						responseText += `   📏 Height: ${height}m\n`;
					}
					if (speed !== undefined) {
						responseText += `   🏃 Speed: ${speed} knots\n`;
					}
					if (ggaStatus !== undefined) {
						responseText += `   🛰️ GGA Status: ${ggaStatus}\n`;
					}
					if (adCode) {
						responseText += `   🗺️ Administrative Code: ${adCode}\n`;
					}
					if (localPhoto !== undefined) {
						responseText += `   📸 Local Photo: ${localPhoto ? "Provided" : "None"}\n`;
					}

					responseText += `\n📊 **Summary**: Successfully updated location for device \`${deviceId}\`\n`;
					responseText += `📍 New coordinates: ${coordinate.trim()} (${coordinateSystem || "WGS84"})\n`;
					responseText += `💡 Use \`get_device_location\` with deviceId: ${deviceId} to verify the updated location\n`;

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ set_device_location error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error setting device location: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDeviceDetailsTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_details",
			"Get comprehensive device information including basic details, status, configuration, and extended attributes",
			{
				deviceId: z.number().describe("Device ID to get detailed information for (required, e.g., 10997)")
			},
			async ({ deviceId }) => {
				console.log("🔥 get_device_details function ENTRY - parameters:", { deviceId });
				
				try {
					console.log("🚀 get_device_details called with parameters:", { deviceId });

					// Parameter validation
					if (!deviceId || typeof deviceId !== "number") {
						throw new Error("deviceId is required and must be a number");
					}

					console.log("✅ Using validated parameters:", { deviceId });

					// Call the API using the new getDeviceDetails method
					const detailsResult = await EUOneAPIUtils.getDeviceDetails(env, {
						deviceId
					});

					console.log("✅ Device details data retrieved successfully");

					// Format the response
					const deviceData = detailsResult.data;
					
					if (!deviceData) {
						return {
							content: [
								{
									type: "text",
									text: `❌ No device details found for device ID: ${deviceId}`,
								},
							],
						};
					}
					
					let responseText = `📱 **Device Details Information**\n`;
					responseText += `Device ID: \`${deviceData.deviceId || deviceId}\`\n`;
					responseText += `Device Name: \`${deviceData.deviceName || "N/A"}\`\n`;
					responseText += `Device Key: \`${deviceData.deviceKey || "N/A"}\`\n`;
					responseText += `============================================================\n\n`;

					// Basic Information
					responseText += `📋 **Basic Information**\n`;
					responseText += `   📦 Product Name: ${deviceData.productName || "N/A"}\n`;
					responseText += `   🆔 Product ID: ${deviceData.productId || "N/A"}\n`;
					responseText += `   🔑 Product Key: \`${deviceData.productKey || "N/A"}\`\n`;
					responseText += `   🏭 Vendor: ${deviceData.vendorName || "N/A"}\n`;
					responseText += `   🏢 Organization: ${deviceData.orgName || "N/A"} (ID: ${deviceData.orgId || "N/A"})\n`;
					if (deviceData.deviceSn) {
						responseText += `   📟 Serial Number: ${deviceData.deviceSn}\n`;
					}
					responseText += `\n`;

					// Device Status
					responseText += `📊 **Device Status**\n`;
					const onlineStatus = deviceData.onlineStatus === 1 ? "🟢 Online" : "🔴 Offline";
					responseText += `   📶 Online Status: ${onlineStatus}\n`;
					
					const runningStatusMap = {
						1: "🟢 Normal",
						2: "🟡 Alarm", 
						3: "🔴 Fault",
						4: "🔴 Fault + Alarm"
					};
					const runningStatus = runningStatusMap[deviceData.runningStatus as keyof typeof runningStatusMap] || `❓ Unknown (${deviceData.runningStatus})`;
					responseText += `   ⚡ Running Status: ${runningStatus}\n`;

					const activationStatus = deviceData.activationStatus === 1 ? "✅ Activated" : 
											 deviceData.activationStatus === 0 ? "❌ Not Activated" : "❓ Unknown";
					if (deviceData.activationStatus !== null) {
						responseText += `   🎯 Activation Status: ${activationStatus}\n`;
					}

					if (deviceData.tsLastOnlineTime) {
						const lastOnlineTime = new Date(deviceData.tsLastOnlineTime);
						responseText += `   ⏰ Last Online: ${lastOnlineTime.toISOString()}\n`;
					}
					
					if (deviceData.tsActivationTime) {
						const activationTime = new Date(deviceData.tsActivationTime);
						responseText += `   🎯 Activation Time: ${activationTime.toISOString()}\n`;
					}

					if (deviceData.dataUpdateTs) {
						const dataUpdateTime = new Date(deviceData.dataUpdateTs);
						responseText += `   📊 Data Update Time: ${dataUpdateTime.toISOString()}\n`;
					}
					responseText += `\n`;

					// Device Type and Configuration
					responseText += `🔧 **Device Configuration**\n`;
					const accessTypeMap = {
						0: "📱 Direct Device",
						1: "🌐 Gateway Device", 
						2: "📡 Gateway Sub-device"
					};
					const accessType = accessTypeMap[deviceData.accessType as keyof typeof accessTypeMap] || `❓ Unknown (${deviceData.accessType})`;
					responseText += `   🔌 Access Type: ${accessType}\n`;

					const netWayMap = {
						1: "📶 WiFi",
						2: "📡 Cellular",
						3: "📻 NB-IoT",
						4: "🔗 Other"
					};
					const netWay = netWayMap[deviceData.netWay as keyof typeof netWayMap] || `❓ Unknown (${deviceData.netWay})`;
					responseText += `   🌐 Network Type: ${netWay}\n`;

					if (deviceData.modelSpec) {
						responseText += `   🔧 Model Spec: ${deviceData.modelSpec}\n`;
					}

					const dataFormatMap = {
						1: "🔤 Text",
						2: "📊 JSON",
						3: "🔢 Binary"
					};
					const dataFormat = dataFormatMap[deviceData.dataFormat as keyof typeof dataFormatMap] || `❓ Unknown (${deviceData.dataFormat})`;
					responseText += `   📝 Data Format: ${dataFormat}\n`;
					responseText += `\n`;

					// Category and Item Information
					if (deviceData.categoryName || deviceData.itemCode || deviceData.itemValue) {
						responseText += `📂 **Category Information**\n`;
						if (deviceData.categoryName) {
							responseText += `   📁 Category: ${deviceData.categoryName}\n`;
						}
						if (deviceData.itemCode) {
							responseText += `   🔖 Item Code: ${deviceData.itemCode}\n`;
						}
						if (deviceData.itemValue) {
							responseText += `   🏷️ Item Value: ${deviceData.itemValue}\n`;
						}
						responseText += `\n`;
					}

					// Network Signal Information
					const hasNetworkInfo = deviceData.signalStrength !== null || deviceData.rsrp !== null || 
										   deviceData.rsrq !== null || deviceData.iccid || deviceData.soc !== null;
					if (hasNetworkInfo) {
						responseText += `📡 **Network & Signal Information**\n`;
						if (deviceData.signalStrength !== null) {
							responseText += `   📶 Signal Strength: ${deviceData.signalStrength}\n`;
						}
						if (deviceData.rsrp !== null) {
							responseText += `   📊 RSRP: ${deviceData.rsrp}\n`;
						}
						if (deviceData.rsrq !== null) {
							responseText += `   📈 RSRQ: ${deviceData.rsrq}\n`;
						}
						if (deviceData.iccid) {
							responseText += `   📞 ICCID: ${deviceData.iccid}\n`;
						}
						if (deviceData.iccids) {
							responseText += `   📞 ICCIDs: ${deviceData.iccids}\n`;
						}
						if (deviceData.soc !== null) {
							responseText += `   🔋 Battery SOC: ${deviceData.soc}%\n`;
						}
						responseText += `\n`;
					}

					// Alarms and Events
					const hasAlarms = deviceData.alarmCode || deviceData.faultCode || deviceData.baseEventInfo;
					if (hasAlarms) {
						responseText += `⚠️ **Alarms & Events**\n`;
						if (deviceData.alarmCode) {
							responseText += `   🚨 Alarm Code: ${deviceData.alarmCode}\n`;
						}
						if (deviceData.faultCode) {
							responseText += `   ⚡ Fault Code: ${deviceData.faultCode}\n`;
						}
						if (deviceData.baseEventInfo && typeof deviceData.baseEventInfo === 'object') {
							responseText += `   📋 Event Info:\n`;
							Object.entries(deviceData.baseEventInfo).forEach(([key, value]) => {
								responseText += `     • ${key}: ${value}\n`;
							});
						}
						responseText += `\n`;
					}

					// Mount Information
					if (deviceData.mountId || deviceData.mountName) {
						responseText += `🏔️ **Mount Information**\n`;
						if (deviceData.mountId) {
							responseText += `   🆔 Mount ID: ${deviceData.mountId}\n`;
						}
						if (deviceData.mountName) {
							responseText += `   📛 Mount Name: ${deviceData.mountName}\n`;
						}
						responseText += `\n`;
					}

					// Extended Fields
					if (deviceData.extFiledList && Array.isArray(deviceData.extFiledList) && deviceData.extFiledList.length > 0) {
						responseText += `📋 **Extended Fields** (${deviceData.extFiledList.length} fields)\n`;
						deviceData.extFiledList.forEach((field: any, index: number) => {
							responseText += `   ${index + 1}. **${field.filedName || "Unnamed Field"}**\n`;
							responseText += `      • Code: \`${field.filedCode || "N/A"}\`\n`;
							responseText += `      • Value: ${field.filedValue || "N/A"}\n`;
							if (field.dataType) {
								const dataTypeMap: Record<number, string> = {1: "Text", 2: "Date", 3: "Enum"};
								responseText += `      • Type: ${dataTypeMap[field.dataType as keyof typeof dataTypeMap] || "Unknown"}\n`;
							}
							responseText += `      • Required: ${field.isRequired === 1 ? "Yes" : "No"}\n`;
						});
						responseText += `\n`;
					}

					// Usage Status Information
					if (deviceData.useStatusInfo) {
						const useInfo = deviceData.useStatusInfo;
						responseText += `📈 **Usage Status Information**\n`;
						if (useInfo.useStatus) {
							responseText += `   📊 Use Status: ${useInfo.useStatus}\n`;
						}
						responseText += `   🔄 Enable Flag: ${useInfo.enableFlag === 1 ? "Enabled" : "Disabled"}\n`;
						if (useInfo.trialTimeStart) {
							responseText += `   ⏰ Trial Start: ${new Date(useInfo.trialTimeStart).toISOString()}\n`;
						}
						if (useInfo.trialTimeEnd) {
							responseText += `   ⏰ Trial End: ${new Date(useInfo.trialTimeEnd).toISOString()}\n`;
						}
						if (useInfo.expiredTime) {
							responseText += `   ⌛ Expired Time: ${new Date(useInfo.expiredTime).toISOString()}\n`;
						}
						if (useInfo.onlineDurationMs) {
							const hours = Math.floor(useInfo.onlineDurationMs / (1000 * 60 * 60));
							responseText += `   ⏱️ Online Duration: ${hours} hours\n`;
						}
						responseText += `\n`;
					}

					// Additional Information
					const additionalInfo = [];
					if (deviceData.renewalStatus) {
						additionalInfo.push(`Renewal Status: ${deviceData.renewalStatus}`);
					}
					if (deviceData.checkResult !== null) {
						const checkResultMap: Record<string | number, string> = {
							1: "Normal",
							"-1": "Device not synced to SaaS",
							"-2": "BindingCode validation failed"
						};
						additionalInfo.push(`Check Result: ${checkResultMap[deviceData.checkResult] || deviceData.checkResult}`);
					}
					if (deviceData.isAiProduct !== undefined) {
						additionalInfo.push(`AI Product: ${deviceData.isAiProduct ? "Yes" : "No"}`);
					}
					if (deviceData.qrCodeType) {
						additionalInfo.push(`QR Code Type: ${deviceData.qrCodeType}`);
					}
					if (deviceData.rtkAccounts) {
						additionalInfo.push(`RTK Accounts: ${deviceData.rtkAccounts}`);
					}

					if (additionalInfo.length > 0) {
						responseText += `ℹ️ **Additional Information**\n`;
						additionalInfo.forEach(info => {
							responseText += `   • ${info}\n`;
						});
						responseText += `\n`;
					}

					responseText += `📊 **Summary**: Successfully retrieved comprehensive details for device \`${deviceData.deviceName || deviceId}\`\n`;
					responseText += `🏭 Product: ${deviceData.productName || "N/A"} (${deviceData.productKey || "N/A"})\n`;
					responseText += `📶 Status: ${onlineStatus} | ${runningStatus}\n`;

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_device_details error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device details: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addProductDetailsTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_product_details",
			{
				productId: z.number().describe("Product ID to get detailed information for (required, e.g., 2989)"),
				vendorId: z.number().optional().describe("Vendor ID for the product (optional, e.g., 110)")
			},
			async ({ productId, vendorId }) => {
				console.log("🔥 get_product_details function ENTRY - parameters:", { productId, vendorId });
				
				try {
					console.log("🚀 get_product_details called with parameters:", { productId, vendorId });

					// Parameter validation
					if (!productId || typeof productId !== "number") {
						throw new Error("productId is required and must be a number");
					}

					// Call the API using the new getProductInfo method
					const productResult = await EUOneAPIUtils.getProductInfo(env, {
						productId,
						vendorId
					});

					console.log("✅ Product details data retrieved successfully");

					// Format the response
					const productData = productResult.data;
					
					if (!productData) {
						return {
							content: [
								{
									type: "text",
									text: `❌ No product details found for product ID: ${productId}`,
								},
							],
						};
					}
					
					let responseText = `📦 **Product Details Information**\n`;
					responseText += `Product ID: \`${productData.id || productId}\`\n`;
					responseText += `Product Name: \`${productData.productName || "N/A"}\`\n`;
					responseText += `Product Key: \`${productData.productKey || "N/A"}\`\n`;
					responseText += `============================================================\n\n`;

					// Basic Information
					responseText += `📋 **Basic Information**\n`;
					responseText += `   🏭 Vendor ID: ${productData.vendorId || "N/A"}\n`;
					responseText += `   🏢 Tenant ID: ${productData.tenantId || "N/A"}\n`;
					responseText += `   🏷️ Item Code: ${productData.itemCode || "N/A"}\n`;
					if (productData.tsCreateTime) {
						const createTime = new Date(productData.tsCreateTime);
						responseText += `   📅 Created: ${createTime.toISOString()}\n`;
					}
					responseText += `\n`;

					// Configuration
					responseText += `🔧 **Configuration**\n`;
					const accessTypeMap = {
						0: "📱 Direct Device",
						1: "🌐 Gateway Device", 
						2: "📡 Gateway Sub-device"
					};
					const accessType = accessTypeMap[productData.accessType as keyof typeof accessTypeMap] || `❓ Unknown (${productData.accessType})`;
					responseText += `   🔌 Access Type: ${accessType}\n`;

					const netWayMap = {
						1: "📶 WiFi",
						2: "📡 Cellular",
						3: "📻 NB-IoT",
						4: "🔗 Other"
					};
					const netWay = netWayMap[productData.netWay as keyof typeof netWayMap] || `❓ Unknown (${productData.netWay})`;
					responseText += `   🌐 Network Type: ${netWay}\n`;

					const dataFormatMap = {
						1: "🔤 Text",
						2: "📊 JSON",
						3: "🔢 Binary"
					};
					const dataFormat = dataFormatMap[productData.dataFormat as keyof typeof dataFormatMap] || `❓ Unknown (${productData.dataFormat})`;
					responseText += `   📝 Data Format: ${dataFormat}\n`;

					const gatewayTypeMap = {
						0: "📱 Device",
						1: "🌐 Gateway"
					};
					const gatewayType = gatewayTypeMap[productData.gatewayType as keyof typeof gatewayTypeMap] || `❓ Unknown (${productData.gatewayType})`;
					responseText += `   🏗️ Gateway Type: ${gatewayType}\n`;
					responseText += `\n`;

					// Status and Release
					responseText += `📊 **Status & Release**\n`;
					const releaseStatusMap = {
						0: "❌ Unpublished",
						1: "✅ Published",
						2: "✅ Published"
					};
					const releaseStatus = releaseStatusMap[productData.releaseStatus as keyof typeof releaseStatusMap] || `❓ Unknown (${productData.releaseStatus})`;
					responseText += `   📈 Release Status: ${releaseStatus}\n`;
					responseText += `\n`;

					// Industry and Scene
					responseText += `🏭 **Industry Information**\n`;
					responseText += `   🏷️ Industry Scene Code: ${productData.industrySceneCode || "N/A"}\n`;
					responseText += `   🆔 Industry Scene ID: ${productData.industrySceneId || "N/A"}\n`;
					responseText += `   🤖 AI Product: ${productData.isAiProduct ? "Yes" : "No"}\n`;
					responseText += `\n`;

					// Storage and Data
					responseText += `💾 **Storage & Data**\n`;
					responseText += `   📦 Store Size: ${productData.storeSize || "N/A"} ${productData.storeUnit || ""}\n`;
					responseText += `   ⏳ Storage Duration: ${productData.storageDuration || "N/A"} days\n`;
					if (productData.historyDataAddSize !== null && productData.historyDataAddSize !== undefined) {
						responseText += `   📈 History Data Size: ${productData.historyDataAddSize} bytes\n`;
					}
					if (productData.yesterdayDataSize !== null && productData.yesterdayDataSize !== undefined) {
						responseText += `   📊 Yesterday Data Size: ${productData.yesterdayDataSize} bytes\n`;
					}
					responseText += `\n`;

					// Queue Information
					const hasQueueInfo = productData.queueId || productData.queueName || productData.queueStatus !== undefined;
					if (hasQueueInfo) {
						responseText += `📬 **Queue Information**\n`;
						if (productData.queueId) {
							responseText += `   🆔 Queue ID: ${productData.queueId}\n`;
						}
						if (productData.queueName) {
							responseText += `   📛 Queue Name: ${productData.queueName}\n`;
						}
						if (productData.queueStatus !== undefined) {
							const queueStatusMap = {
								0: "❌ Inactive",
								1: "✅ Active"
							};
							const queueStatus = queueStatusMap[productData.queueStatus as keyof typeof queueStatusMap] || `❓ Unknown (${productData.queueStatus})`;
							responseText += `   📊 Queue Status: ${queueStatus}\n`;
						}
						responseText += `\n`;
					}

					// Additional Information
					const additionalInfo = [];
					if (productData.connProtocol !== null && productData.connProtocol !== undefined) {
						additionalInfo.push(`Connection Protocol: ${productData.connProtocol}`);
					}
					if (productData.fileUrl) {
						additionalInfo.push(`File URL: ${productData.fileUrl}`);
					}
					if (productData.subscribeId) {
						additionalInfo.push(`Subscribe ID: ${productData.subscribeId}`);
					}
					if (productData.qrCodeType !== null && productData.qrCodeType !== undefined) {
						additionalInfo.push(`QR Code Type: ${productData.qrCodeType}`);
					}

					if (additionalInfo.length > 0) {
						responseText += `ℹ️ **Additional Information**\n`;
						additionalInfo.forEach(info => {
							responseText += `   • ${info}\n`;
						});
						responseText += `\n`;
					}

					responseText += `📊 **Summary**: Successfully retrieved comprehensive details for product \`${productData.productName || productId}\`\n`;
					responseText += `🏭 Vendor: ${productData.vendorId || "N/A"} | Industry: ${productData.industrySceneCode || "N/A"}\n`;
					responseText += `📈 Status: ${releaseStatus} | ${accessType}\n`;

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_product_details error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting product details: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}

	private addDevicePropertiesTool(env: EUOneEnvironment) {
		this.server.tool(
			"get_device_properties",
			{
				deviceId: z.number().describe("Device ID to get TSL properties for (required, e.g., 10997)"),
				showHide: z.boolean().optional().describe("Whether to show hidden labels: true=show all, false=hide hidden labels (optional, default: true)"),
				filterDisplay: z.boolean().optional().describe("Whether to filter display properties (optional, default: true)"),
				propCode: z.string().optional().describe("Filter by specific property code (optional)"),
				propName: z.string().optional().describe("Filter by specific property name (optional)"),
				tslSubType: z.enum(["ALL", "WRITEABLE", "READABLE"]).optional().describe("TSL read/write type filter (optional): ALL=all properties, WRITEABLE=writable properties, READABLE=readable properties"),
				displayControl: z.boolean().optional().describe("Filter by display control flag (optional)"),
				enableControl: z.boolean().optional().describe("Filter by enable control flag (optional)")
			},
			async ({ deviceId, showHide, filterDisplay, propCode, propName, tslSubType, displayControl, enableControl }) => {
				console.log("🔥 get_device_properties function ENTRY - parameters:", { 
					deviceId, showHide, filterDisplay, propCode, propName, tslSubType, displayControl, enableControl 
				});
				
				try {
					console.log("🚀 get_device_properties called with parameters:", { 
						deviceId, showHide, filterDisplay, propCode, propName, tslSubType 
					});

					// Parameter validation
					if (!deviceId || typeof deviceId !== "number") {
						throw new Error("deviceId is required and must be a number");
					}

					console.log("✅ Using validated parameters:", { 
						deviceId, 
						showHide, 
						filterDisplay,
						propCode,
						propName, 
						tslSubType,
						displayControl,
						enableControl
					});

					// Call the API using the new getDeviceProperties method
					const propertiesResult = await EUOneAPIUtils.getDeviceProperties(env, {
						deviceId,
						showHide,
						filterDisplay,
						propCode,
						propName,
						tslSubType,
						displayControl,
						enableControl
					});

					console.log("✅ Device properties data retrieved successfully");

					// Format the response
					const propertiesData = propertiesResult.data || [];
					
					if (!propertiesData || propertiesData.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: `❌ No device properties found for device ID: ${deviceId}`,
								},
							],
						};
					}
					
					let responseText = `🔧 **Device Properties & Labels**\n`;
					responseText += `Device ID: \`${deviceId}\`\n`;
					responseText += `Found ${propertiesData.length} label group(s)\n`;
					responseText += `============================================================\n\n`;

					// Process each label group
					propertiesData.forEach((labelGroup: any, groupIndex: number) => {
						const labelInfo = labelGroup.key;
						const properties = labelGroup.value || [];

						// Label Information
						responseText += `📋 **Label Group ${groupIndex + 1}: ${labelInfo.productLabel || "Unknown Label"}**\n`;
						responseText += `   🆔 Product Label ID: ${labelInfo.productLabelId !== undefined ? labelInfo.productLabelId : "N/A"}\n`;
						responseText += `   🏷️ Device Label: ${labelInfo.deviceLabel || "N/A"}\n`;
						responseText += `   ✅ Default Label: ${labelInfo.isDefault ? "Yes" : "No"}\n`;
						responseText += `   👁️ Visible: ${labelInfo.isHide ? "Hidden" : "Visible"}\n`;
						if (labelInfo.labelColor) {
							responseText += `   🎨 Label Color: ${labelInfo.labelColor}\n`;
						}
						if (labelInfo.productLabelColor) {
							responseText += `   🎨 Product Label Color: ${labelInfo.productLabelColor}\n`;
						}
						responseText += `\n`;

						// Properties for this label
						responseText += `   📊 **Properties (${properties.length} properties)**:\n`;
						if (properties.length === 0) {
							responseText += `   ❌ No properties found for this label\n\n`;
						} else {
							properties.forEach((prop: any, propIndex: number) => {
								responseText += `\n   ${propIndex + 1}. **${prop.name || "Unnamed Property"}** (\`${prop.code || "N/A"}\`)\n`;
								responseText += `      🆔 ID: ${prop.id || "N/A"}\n`;
								responseText += `      📊 Data Type: ${prop.dataType || "N/A"}\n`;
								responseText += `      🔧 Type: ${prop.type || "N/A"}\n`;
								responseText += `      📝 Sub Type: ${prop.subType || "N/A"} `;
								
								// Sub type explanation
								const subTypeMap: Record<string, string> = {
									"R": "(Read-only)",
									"W": "(Write-only)", 
									"RW": "(Read/Write)"
								};
								const subTypeDesc = subTypeMap[prop.subType] || "";
								responseText += `${subTypeDesc}\n`;
								
								if (prop.desc) {
									responseText += `      📖 Description: ${prop.desc}\n`;
								}

								// Current values
								if (prop.upValue !== null && prop.upValue !== undefined) {
									responseText += `      📈 Current Value: ${prop.upValue}\n`;
								}
								if (prop.downValue !== null && prop.downValue !== undefined) {
									responseText += `      📉 Down Value: ${prop.downValue}\n`;
								}

								// Control and display settings
								responseText += `      👁️ Display: ${prop.display ? "Yes" : "No"}\n`;
								responseText += `      🎛️ Control Enabled: ${prop.enableControl ? "Yes" : "No"}\n`;
								responseText += `      📡 Report Enabled: ${prop.enableReport ? "Yes" : "No"}\n`;

								if (prop.unit) {
									responseText += `      📏 Unit: ${prop.unit}\n`;
								}
								responseText += `      📊 Sort Order: ${prop.sortNum || "N/A"}\n`;

								// Specifications
								if (prop.specs && Array.isArray(prop.specs) && prop.specs.length > 0) {
									responseText += `      📐 **Specifications** (${prop.specs.length} spec(s)):\n`;
									prop.specs.forEach((spec: any, specIndex: number) => {
										if (spec.name || spec.code) {
											responseText += `        ${specIndex + 1}. ${spec.name || spec.code || "Unnamed Spec"}\n`;
										}
										if (spec.dataType) {
											responseText += `           • Data Type: ${spec.dataType}\n`;
										}
										if (spec.min !== null && spec.min !== undefined) {
											responseText += `           • Min: ${spec.min}\n`;
										}
										if (spec.max !== null && spec.max !== undefined) {
											responseText += `           • Max: ${spec.max}\n`;
										}
										if (spec.step !== null && spec.step !== undefined) {
											responseText += `           • Step: ${spec.step}\n`;
										}
										if (spec.unit) {
											responseText += `           • Unit: ${spec.unit}\n`;
										}
										if (spec.value !== null && spec.value !== undefined) {
											responseText += `           • Value: ${spec.value}\n`;
										}
										if (spec.upValue !== null && spec.upValue !== undefined) {
											responseText += `           • Up Value: ${spec.upValue}\n`;
										}
										
										// Handle nested specs (like RGB color components)
										if (spec.specs && Array.isArray(spec.specs) && spec.specs.length > 0) {
											responseText += `           • Sub-specs (${spec.specs.length} items):\n`;
											spec.specs.forEach((subSpec: any, subIndex: number) => {
												if (subSpec.min !== null && subSpec.max !== null) {
													responseText += `             ${subIndex + 1}. Range: ${subSpec.min}-${subSpec.max}\n`;
												}
												if (subSpec.unit) {
													responseText += `             ${subIndex + 1}. Unit: ${subSpec.unit}\n`;
												}
											});
										}
									});
								}

								// Additional metadata
								if (prop.icon) {
									responseText += `      🎨 Icon: ${prop.icon}\n`;
								}
								if (prop.labelId) {
									responseText += `      🏷️ Label ID: ${prop.labelId}\n`;
								}
								if (prop.typeMapping) {
									responseText += `      🔗 Type Mapping: ${prop.typeMapping}\n`;
								}
							});
						}
						responseText += `\n`;
					});

					// Summary
					const totalProperties = propertiesData.reduce((sum: number, group: any) => sum + (group.value?.length || 0), 0);
					responseText += `📊 **Summary**: Retrieved ${totalProperties} properties across ${propertiesData.length} label group(s) for device \`${deviceId}\`\n`;
					
					// Filter summary
					const filters = [];
					if (showHide !== undefined) filters.push(`showHide: ${showHide}`);
					if (filterDisplay !== undefined) filters.push(`filterDisplay: ${filterDisplay}`);
					if (propCode) filters.push(`propCode: ${propCode}`);
					if (propName) filters.push(`propName: ${propName}`);
					if (tslSubType) filters.push(`tslSubType: ${tslSubType}`);
					if (displayControl !== undefined) filters.push(`displayControl: ${displayControl}`);
					if (enableControl !== undefined) filters.push(`enableControl: ${enableControl}`);
					
					if (filters.length > 0) {
						responseText += `🔍 **Applied Filters**: ${filters.join(", ")}\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					};
				} catch (error) {
					console.error("❌ get_device_properties error:", error);

					let errorMessage = "Unknown error occurred";
					if (error instanceof Error) {
						errorMessage = error.message;
					}

					return {
						content: [
							{
								type: "text",
								text: `❌ Error getting device properties: ${errorMessage}`,
							},
						],
					};
				}
			},
		);
	}
}
