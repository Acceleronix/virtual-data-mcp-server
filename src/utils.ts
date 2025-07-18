import { z } from "zod";

export interface IoTEnvironment {
	BASE_URL: string;
	ACCESS_KEY: string;
	ACCESS_SECRET: string;
}

// Global token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

export class IoTAPIUtils {
	static async getAccessToken(env: IoTEnvironment): Promise<string> {
		// Check if we have a valid cached token
		if (accessToken && Date.now() < tokenExpiry) {
			return accessToken;
		}

		// Generate authentication parameters
		const timestamp = Date.now().toString();
		const usernameParams = {
			ver: "1",
			auth_mode: "accessKey",
			sign_method: "sha256",
			access_key: env.ACCESS_KEY,
			timestamp: timestamp,
		};

		// Create signature
		const usernameParamsStr = Object.entries(usernameParams)
			.map(([k, v]) => `${k}=${v}`)
			.join("&");
		const passwordPlain = `${usernameParamsStr}${env.ACCESS_SECRET}`;
		const passwordBuffer = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(passwordPlain),
		);
		const passwordHex = Array.from(new Uint8Array(passwordBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		// Get token
		const response = await fetch(
			`${env.BASE_URL}/v2/quecauth/accessKeyAuthrize/accessKeyLogin?grant_type=password&username=${encodeURIComponent(usernameParamsStr)}&password=${passwordHex}`,
		);

		if (!response.ok) {
			throw new Error(`Authentication failed: ${response.status}`);
		}

		const data = (await response.json()) as any;
		if (data.code !== 200) {
			throw new Error(`Authentication failed: ${data.msg}`);
		}

		accessToken = data.data.access_token;
		tokenExpiry = Date.now() + data.data.expires_in * 1000;

		return accessToken!;
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

	// Product Management - simplified
	static async listProducts(env: IoTEnvironment): Promise<any[]> {
		return IoTAPIUtils.safeAPICall(async () => {
			const token = await IoTAPIUtils.getAccessToken(env);

			const response = await fetch(
				`${env.BASE_URL}/v2/quecproductmgr/r3/openapi/products?pageSize=100&pageNo=1`,
				{
					headers: {
						Authorization: token,
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`API call failed: ${response.status}`);
			}

			const result = (await response.json()) as any;
			return result.data || [];
		});
	}

	static async healthCheck(env: IoTEnvironment): Promise<{ status: string }> {
		return IoTAPIUtils.safeAPICall(async () => {
			const token = await IoTAPIUtils.getAccessToken(env);

			// Use product list as health check
			const response = await fetch(
				`${env.BASE_URL}/v2/quecproductmgr/r3/openapi/products?pageSize=1&pageNo=1`,
				{
					headers: {
						Authorization: token,
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`Health check failed: ${response.status}`);
			}

			return { status: "OK" };
		});
	}

	// Utility Functions
	static formatTimestampWithTimezone(timestamp: number): string {
		if (!timestamp) return "N/A";

		const date = new Date(timestamp);
		const utc = date.toISOString();
		const utcPlus8 = new Date(timestamp + 8 * 60 * 60 * 1000)
			.toISOString()
			.replace("Z", "+08:00");

		return `${utc} (UTC) / ${utcPlus8} (UTC+8)`;
	}

	static formatAccessType(accessType: number): string {
		switch (accessType) {
			case 0:
				return "Direct Device";
			case 1:
				return "Gateway Device";
			case 2:
				return "Gateway Sub-device";
			default:
				return `Unknown (${accessType})`;
		}
	}

	static formatDataFmt(dataFmt: number): string {
		switch (dataFmt) {
			case 0:
				return "Transparent";
			case 3:
				return "Thing Model";
			default:
				return `Unknown (${dataFmt})`;
		}
	}
}
