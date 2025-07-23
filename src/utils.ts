import { z } from "zod";

export interface EUOneEnvironment {
	BASE_URL: string;
	APP_ID: string;
	APP_SECRET: string;
	INDUSTRY_CODE: string;
}

// Global token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Pagination cursor interface
interface PaginationCursor {
	pageNo: number;
	pageSize: number;
	productKey?: string;
	totalItems?: number;
}

// Pagination utility functions
export function encodeCursor(cursor: PaginationCursor): string {
	return btoa(JSON.stringify(cursor));
}

export function decodeCursor(cursorStr: string): PaginationCursor {
	try {
		return JSON.parse(atob(cursorStr));
	} catch (error) {
		throw new Error("Invalid cursor format");
	}
}

export class EUOneAPIUtils {
	static async getAccessToken(env: EUOneEnvironment): Promise<string> {
		// Check if we have a valid cached token (with 120 second buffer for safety)
		const bufferTime = 120 * 1000; // 120 seconds for better safety margin
		if (accessToken && Date.now() < tokenExpiry - bufferTime) {
			console.log("🔄 Using cached access token (expires in", Math.round((tokenExpiry - Date.now()) / 1000), "seconds)");
			return accessToken;
		}

		console.log("🔐 Access token expired or missing - requesting new token");

		// Generate authentication parameters exactly matching API Playground format
		const timestamp = Date.now().toString(); // Convert to string like API Playground
		const passwordPlain = `${env.APP_ID}${env.INDUSTRY_CODE}${timestamp}${env.APP_SECRET}`;

		console.log("🔍 Debug authentication generation:");
		console.log(`   APP_ID: ${env.APP_ID}`);
		console.log(`   INDUSTRY_CODE: ${env.INDUSTRY_CODE}`);
		console.log(`   timestamp: ${timestamp}`);
		console.log(`   passwordPlain: ${passwordPlain}`);

		// Create SHA-256 hash for password using optimized approach
		const encoder = new TextEncoder();
		const data = encoder.encode(passwordPlain);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const password = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		console.log(`   Generated password hash: ${password}`);

		// Login request payload (matching API Playground exactly)
		const payload = {
			appId: env.APP_ID,
			industryCode: env.INDUSTRY_CODE,
			timestamp: timestamp, // String format like API Playground
			password: password,
		};

		console.log("Login payload:", JSON.stringify(payload, null, 2));

		try {
			const response = await fetch(
				`${env.BASE_URL}/v2/sysuser/openapi/ent/v3/login/pwdAuth`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(payload),
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as any;
			console.log("Auth response:", JSON.stringify(data, null, 2));

			if (data.code !== 200) {
				throw new Error(
					`Authentication failed: ${data.msg || "Unknown error"}`,
				);
			}

			if (!data.data || !data.data.accessToken) {
				throw new Error(
					`Invalid authentication response: ${JSON.stringify(data)}`,
				);
			}

			accessToken = data.data.accessToken;

			if (!accessToken) {
				throw new Error("No access token received from API");
			}

			// Parse expiry time from string to number with enhanced error handling
			const expiresIn = parseInt(data.data.accessTokenExpireIn || "3600");
			// Set expiry to 1 hour from now (tokens typically last longer)
			tokenExpiry = Date.now() + expiresIn * 1000;

			console.log(
				`✅ New access token obtained, expires in ${expiresIn} seconds`,
			);

			return accessToken!;
		} catch (error) {
			console.error("API Error:", error);
			throw new Error("Failed to get access token");
		}
	}

	static async safeAPICall<T>(apiCall: () => Promise<T>): Promise<T> {
		try {
			return await apiCall();
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`API Error: ${error.message}`);
			}
			throw new Error("Unknown API error occurred");
		}
	}

	// Helper method to ensure we have a valid token before making API calls
	static async ensureValidToken(env: EUOneEnvironment): Promise<string> {
		try {
			// Always try to get/refresh token before any API call
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("✅ Token validation successful");
			return token;
		} catch (error) {
			console.error("❌ Token validation failed:", error);
			// Force token refresh by clearing cache
			accessToken = null;
			tokenExpiry = 0;
			// Try once more
			return await EUOneAPIUtils.getAccessToken(env);
		}
	}

	// Force get fresh token (always clears cache and gets new token)
	static async getFreshToken(env: EUOneEnvironment): Promise<string> {
		console.log("🔄 Forcing fresh token acquisition - clearing cache");
		// Clear cached token to force fresh authentication
		accessToken = null;
		tokenExpiry = 0;

		try {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("✅ Fresh token acquired successfully");
			return token;
		} catch (error) {
			console.error("❌ Fresh token acquisition failed:", error);
			throw new Error(
				`Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Enhanced API call with automatic token refresh on session timeout
	static async safeAPICallWithTokenRefresh<T>(
		env: EUOneEnvironment,
		apiCall: (token: string) => Promise<T>,
	): Promise<T> {
		try {
			// Ensure we have a valid token first
			const token = await EUOneAPIUtils.ensureValidToken(env);
			return await apiCall(token);
		} catch (error) {
			// Check if it's a session timeout error (check multiple patterns)
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const isSessionTimeout =
				errorMessage.includes("Session timed out") ||
				errorMessage.includes("session timeout") ||
				errorMessage.includes("401") ||
				errorMessage.includes("Unauthorized");

			if (isSessionTimeout) {
				console.log(
					"🔄 Session timeout/auth error detected, forcing token refresh and retrying...",
				);
				console.log("🔍 Error details:", errorMessage);

				// Clear cached token and get new one
				accessToken = null;
				tokenExpiry = 0;

				try {
					const newToken = await EUOneAPIUtils.ensureValidToken(env);
					console.log("🔐 Retrying API call with new token");

					// Retry the API call with new token
					return await apiCall(newToken);
				} catch (retryError) {
					console.error("❌ Retry failed:", retryError);
					throw new Error(
						`Retry API call failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
					);
				}
			}

			// Re-throw other errors
			throw error;
		}
	}

	static async healthCheck(env: EUOneEnvironment): Promise<{ status: string }> {
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			return { status: "OK - Authentication successful" };
		});
	}

	static async getTslModel(
		env: EUOneEnvironment,
		productKey: string,
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			const response = await fetch(
				`${env.BASE_URL}/v2/product/openapi/ent/v1/product/tsl/acquireTslModelByProductKey?productKey=${encodeURIComponent(productKey)}`,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as any;
			if (result.code !== 200) {
				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result.data || {};
		});
	}

	static async getDeviceList(
		env: EUOneEnvironment,
		options: {
			deviceQueryKey?: string;
			enableListSubData?: boolean;
			extFiledList?: string[];
			mountId?: number;
			onlineStatus?: number;
			pageNum?: number;
			pageSize?: number;
			productId?: number;
			runningStatus?: number;
			orgId?: number;
		} = {},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for device list (length):", token.length);
			console.log(
				"⏰ Token expiry check - current time:",
				new Date().toISOString(),
			);
			console.log("⏰ Token expires at:", new Date(tokenExpiry).toISOString());
			console.log(
				"⏰ Time until expiry (minutes):",
				Math.round((tokenExpiry - Date.now()) / 60000),
			);

			// Set default values
			const requestBody = {
				pageNum: options.pageNum || 1,
				pageSize: options.pageSize || 10,
				...options,
			};

			console.log(
				"📝 Device list request body:",
				JSON.stringify(requestBody, null, 2),
			);

			const response = await fetch(
				`${env.BASE_URL}/v2/device/openapi/ent/v1/device/list`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(requestBody),
				},
			);

			console.log("📡 Device list response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device list HTTP error response:", errorText);
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as any;
			console.log(
				"📱 Device list API response:",
				JSON.stringify(result, null, 2),
			);

			if (result.code !== 200) {
				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result.rows || [];
		});
	}

	// Simplified product list method focused on pagination (based on API playground results)
	static async getProductListPaginated(
		env: EUOneEnvironment,
		options: {
			pageNum?: number;
			pageSize?: number;
			productName?: string;
			productKey?: string;
			releaseStatus?: number;
			searchValue?: string;
		} = {},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for product list (length):", token.length);
			console.log("⏰ Request time:", new Date().toISOString());

			// Build query parameters - only core parameters
			const queryParams = new URLSearchParams();

			// Set pagination parameters (using API playground tested values)
			const pageNum = options.pageNum ? String(options.pageNum) : "1";
			const pageSize = options.pageSize ? String(options.pageSize) : "15"; // Default to 15 as per tool design

			queryParams.append("pageNum", pageNum);
			queryParams.append("pageSize", pageSize);

			// Add optional filters if provided
			if (options.productName)
				queryParams.append("productName", options.productName);
			if (options.productKey)
				queryParams.append("productKey", options.productKey);
			if (typeof options.releaseStatus === "number")
				queryParams.append("releaseStatus", String(options.releaseStatus));
			if (options.searchValue)
				queryParams.append("searchValue", options.searchValue);

			const url = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
			console.log("📝 Simplified product list request URL:", url);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`, // As per API playground
					"Accept-Language": "en-US", // As per API playground
					"Content-Type": "application/json",
				},
			});

			console.log("📡 Product list response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Product list HTTP error response:", errorText);
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as any;
			
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
			
			console.log(
				"📋 Product list success - received",
				result.rows?.length || 0,
				"products",
			);

			if (result.code !== 200) {
				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			return result;
		});
	}

	// Keep original method for backward compatibility
	static async getProductList(
		env: EUOneEnvironment,
		options: {
			accessType?: number;
			connProtocol?: number;
			createBy?: string;
			createTime?: string;
			createUserId?: number;
			dataFormat?: number;
			industrySceneCode?: string;
			industrySceneId?: number;
			netWay?: number;
			productKey?: string;
			productKeyList?: string[];
			productList?: number[];
			productName?: string;
			releaseStatus?: number;
			remark?: string;
			searchValue?: string;
			sortType?: number;
			tenantId?: number;
			updateBy?: string;
			updateTime?: string;
			vendorId?: number;
			pageNum?: string | number;
			pageSize?: string | number;
		} = {},
	): Promise<any> {
		// Delegate to simplified method for core pagination functionality
		return EUOneAPIUtils.getProductListPaginated(env, {
			pageNum: options.pageNum ? Number(options.pageNum) : undefined,
			pageSize: options.pageSize ? Number(options.pageSize) : undefined,
			productName: options.productName,
			productKey: options.productKey,
			releaseStatus: options.releaseStatus,
			searchValue: options.searchValue,
		});
	}

	static async reportDeviceData(
		env: EUOneEnvironment,
		options: {
			productKey: string;
			deviceKey: string;
			data: Record<string, any>; // Dynamic properties from device's TSL model
			upTsTime?: number;
		},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for device report (length):", token.length);

			// Set default timestamp if not provided
			const requestBody = {
				productKey: options.productKey,
				deviceKey: options.deviceKey,
				data: options.data, // User-provided property values
				upTsTime: options.upTsTime || Date.now(),
			};

			console.log(
				"📤 Device report request body:",
				JSON.stringify(requestBody, null, 2),
			);

			const response = await fetch(`${env.BASE_URL}/v2/device/data/fake/up`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			console.log("📡 Device report response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device report HTTP error response:", errorText);
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as any;
			console.log(
				"📤 Device report API response:",
				JSON.stringify(result, null, 2),
			);

			// Handle potential API errors
			if (result.code && result.code !== 200) {
				throw new Error(`API call failed: ${result.msg || "Unknown error"}`);
			}

			// For successful response (code 200 or no code field)
			return result;
		});
	}
}
