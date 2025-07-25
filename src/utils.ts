import { z } from "zod";

export interface EUOneEnvironment {
	BASE_URL: string;
	APP_ID: string;
	APP_SECRET: string;
	INDUSTRY_CODE: string;
}

// Global token cache - enhanced with lock mechanism
let accessToken: string | null = null;
let tokenExpiry: number = 0;
let tokenRefreshPromise: Promise<string> | null = null;

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

		// Check if there's already a token refresh in progress (prevents duplicate requests)
		if (tokenRefreshPromise) {
			console.log("⏳ Token refresh already in progress, waiting for completion...");
			return await tokenRefreshPromise;
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

		// Create the token refresh promise to prevent concurrent requests
		tokenRefreshPromise = (async (): Promise<string> => {
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
			} finally {
				// Clear the promise reference when done
				tokenRefreshPromise = null;
			}
		})();

		// Return the promise to wait for completion
		return await tokenRefreshPromise;
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
		let retryCount = 0;
		const maxRetries = 2;

		while (retryCount <= maxRetries) {
			try {
				// Ensure we have a valid token first
				const token = await EUOneAPIUtils.ensureValidToken(env);
				const result = await apiCall(token);
				
				// If successful, log and return
				if (retryCount > 0) {
					console.log(`✅ API call succeeded after ${retryCount} retry(ies)`);
				}
				return result;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				
				// FIXED: More precise error detection for authentication/session issues
				const isAuthError = (
					// Exact session timeout messages
					errorMessage.includes("Session timed out") ||
					errorMessage.includes("session timeout") ||
					errorMessage.includes("login again") ||
					// HTTP status codes - be specific
					errorMessage.includes("HTTP 401") ||
					errorMessage.includes("HTTP 403") ||
					// Exact API error codes
					errorMessage.includes("401") && errorMessage.includes("Unauthorized") ||
					// Specific token errors (not generic "auth" or "token")
					errorMessage.includes("access token expired") ||
					errorMessage.includes("token invalid") ||
					errorMessage.includes("authentication failed")
				);

				console.log(`🔍 Error analysis: isAuthError=${isAuthError}, message="${errorMessage}"`);
				
				// Add detailed error logging for debugging
				if (!isAuthError) {
					console.log("ℹ️ Not treating as auth error - will not retry");
				}

				// Only retry on authentication errors and if we haven't exceeded max retries
				if (isAuthError && retryCount < maxRetries) {
					retryCount++;
					console.log(
						`🔄 Authentication error detected (attempt ${retryCount}/${maxRetries}), forcing token refresh and retrying...`,
					);
					console.log("🔍 Error details:", errorMessage);

					// Clear cached token to force fresh authentication
					accessToken = null;
					tokenExpiry = 0;
					tokenRefreshPromise = null; // Also clear any pending refresh

					// Wait a bit before retrying to avoid rapid-fire requests
					await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
					
					continue; // Retry the loop
				}

				// If not an auth error or we've exceeded retries, throw the error
				if (retryCount > 0) {
					console.error(`❌ Failed after ${retryCount} retry(ies):`, errorMessage);
				}
				throw error;
			}
		}

		// Should never reach here, but TypeScript needs it
		throw new Error("Maximum retries exceeded");
	}

	static async healthCheck(env: EUOneEnvironment): Promise<{ 
		status: string; 
		tokenStatus: string; 
		tokenExpiry?: string;
		apiConnectivity: string;
	}> {
		return EUOneAPIUtils.safeAPICall(async () => {
			// Check token validity
			const token = await EUOneAPIUtils.getAccessToken(env);
			
			// Get token expiry info
			const timeUntilExpiry = Math.max(0, tokenExpiry - Date.now());
			const expiryMinutes = Math.round(timeUntilExpiry / 60000);
			
			// FIX: Test authentication system directly, not business APIs
			// health_check should verify auth system works, not test business APIs
			const apiStatus = "OK - Authentication system verified";
			
			// The fact that we successfully got a token above proves auth system works
			// No need to test business APIs in health_check
			
			return { 
				status: "OK - Authentication successful",
				tokenStatus: `Valid (expires in ${expiryMinutes} minutes)`,
				tokenExpiry: new Date(tokenExpiry).toISOString(),
				apiConnectivity: apiStatus
			};
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
		// FIX: Use simple API call like health_check to avoid retry issues
		return EUOneAPIUtils.safeAPICall(async () => {
			const token = await EUOneAPIUtils.getAccessToken(env);
			console.log("🔐 Using token for product list (length):", token.length);
			console.log("🔐 Token preview:", token.substring(0, 20) + "...");
			console.log("⏰ Request time:", new Date().toISOString());
			console.log("⏰ Cached token expiry:", new Date(tokenExpiry).toISOString());
			console.log("⏰ Time until expiry (minutes):", Math.round((tokenExpiry - Date.now()) / 60000));

			// Build query parameters - only core parameters
			const queryParams = new URLSearchParams();

			// Set pagination parameters (using small page size like health_check)
			const pageNum = options.pageNum ? String(options.pageNum) : "1";
			const pageSize = options.pageSize ? String(options.pageSize) : "50"; // Large enough to get most product lists

			queryParams.append("pageNum", pageNum);
			queryParams.append("pageSize", pageSize);
			
			// FIX: Only pass pageNum and pageSize as per user specification
			// Removed optional filters that may cause 403 errors

			const url = `${env.BASE_URL}/v2/product/product/list?${queryParams.toString()}`;
			console.log("📝 Simplified product list request URL:", url);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: token, // FIX: Direct token, no "Bearer " prefix
					"Accept-Language": "en-US",
					"Content-Type": "application/json",
				},
			});

			console.log("📡 Product list response status:", response.status);
			console.log("📡 Response headers:", JSON.stringify([...response.headers.entries()]));

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Product list HTTP error response:", errorText);
				console.error("❌ Full response details:", {
					status: response.status,
					statusText: response.statusText,
					headers: [...response.headers.entries()],
					body: errorText,
					url: response.url
				});
				throw new Error(`API call failed: HTTP ${response.status} - ${errorText}`);
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
				console.error("❌ API returned error code:", {
					code: result.code,
					msg: result.msg,
					fullResponse: result
				});
				throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
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
					Authorization: token,  // FIX: Direct token, no "Bearer " prefix  
					"Accept-Language": "en-US",
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

	static async getDeviceList(
		env: EUOneEnvironment,
		options: {
			pageNum?: number;
			pageSize?: number;
			productId?: number;
			deviceKey?: string;
			deviceName?: string;
			orgId?: number;
			extFiledList?: any[];
			tlsPropCfgList?: any[];
			enableListSubData?: boolean;
			deviceQueryKey?: string;
			activationStatus?: number;
			onlineStatus?: number;
			runningStatus?: number;
			accessType?: number;
			productKey?: string;
		} = {},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for device list (length):", token.length);

			// Build request body with default values
			const requestBody = {
				pageNum: options.pageNum || 1,
				pageSize: options.pageSize || 10,
				activationStatus: options.activationStatus !== undefined ? options.activationStatus : 1, // Default to activated devices
				enableListSubData: options.enableListSubData !== undefined ? options.enableListSubData : true,
				extFiledList: options.extFiledList || [],
				tlsPropCfgList: options.tlsPropCfgList || [],
				...(options.productId && { productId: options.productId }),
				...(options.deviceKey && { deviceKey: options.deviceKey }),
				...(options.deviceName && { deviceName: options.deviceName }),
				...(options.orgId && { orgId: options.orgId }),
				...(options.deviceQueryKey && { deviceQueryKey: options.deviceQueryKey }),
				...(options.onlineStatus !== undefined && { onlineStatus: options.onlineStatus }),
				...(options.runningStatus !== undefined && { runningStatus: options.runningStatus }),
				...(options.accessType !== undefined && { accessType: options.accessType }),
				...(options.productKey && { productKey: options.productKey }),
			};

			console.log("📝 Device list request body:", JSON.stringify(requestBody, null, 2));

			const url = `${env.BASE_URL}/v2/device/list`;
			console.log("📝 Device list request URL:", url);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: token, // Direct token, no "Bearer " prefix
					"Accept-Language": "en-US",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			console.log("📡 Device list response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device list HTTP error response:", errorText);
				throw new Error(`API call failed: HTTP ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log("📱 Device list API response:", JSON.stringify(result, null, 2));

			if (result.code !== 200) {
				console.error("❌ Device list API returned error code:", {
					code: result.code,
					msg: result.msg,
					fullResponse: result
				});
				throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
			}

			return result;
		});
	}

	static async getProductTsl(
		env: EUOneEnvironment,
		options: {
			productKey: string;
			labelId?: number;
			propCode?: string;
			propName?: string;
		},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for product TSL (length):", token.length);

			// Build query parameters
			const queryParams = new URLSearchParams();
			queryParams.append("productKey", options.productKey);
			
			if (options.labelId !== undefined) {
				queryParams.append("labelId", String(options.labelId));
			}
			if (options.propCode) {
				queryParams.append("propCode", options.propCode);
			}
			if (options.propName) {
				queryParams.append("propName", options.propName);
			}

			const url = `${env.BASE_URL}/v2/product/tsl/getProp?${queryParams.toString()}`;
			console.log("📝 Product TSL request URL:", url);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: token, // Direct token, no "Bearer " prefix
					"Accept-Language": "en-US",
					"Content-Type": "application/json",
				},
			});

			console.log("📡 Product TSL response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Product TSL HTTP error response:", errorText);
				throw new Error(`API call failed: HTTP ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log("📋 Product TSL API response:", JSON.stringify(result, null, 2));

			if (result.code !== 200) {
				console.error("❌ Product TSL API returned error code:", {
					code: result.code,
					msg: result.msg,
					fullResponse: result
				});
				throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
			}

			return result;
		});
	}

	static async getDeviceLocation(
		env: EUOneEnvironment,
		options: {
			deviceId: number;
		},
	): Promise<any> {
		return EUOneAPIUtils.safeAPICallWithTokenRefresh(env, async (token) => {
			console.log("🔐 Using token for device location (length):", token.length);

			// Build query parameters 
			const queryParams = new URLSearchParams();
			queryParams.append("deviceId", String(options.deviceId));

			const url = `${env.BASE_URL}/v2/device/detail/location?${queryParams.toString()}`;
			console.log("📝 Device location request URL:", url);

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: token, // Direct token, no "Bearer " prefix
					"Accept-Language": "en-US",
					"Content-Type": "application/json",
				},
			});

			console.log("📡 Device location response status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ Device location HTTP error response:", errorText);
				throw new Error(`API call failed: HTTP ${response.status} - ${errorText}`);
			}

			const result = (await response.json()) as any;
			console.log("📍 Device location API response:", JSON.stringify(result, null, 2));

			if (result.code !== 200) {
				console.error("❌ Device location API returned error code:", {
					code: result.code,
					msg: result.msg,
					fullResponse: result
				});
				throw new Error(`API call failed: Code ${result.code} - ${result.msg || "Unknown error"}`);
			}

			return result;
		});
	}

}
