#!/usr/bin/env node

// Test authentication generation to match API Playground
const crypto = require("crypto");

async function testAuthGeneration() {
	// Your successful API Playground parameters
	const appId = "d67fe08dbf174acebbc7352bb1321f12";
	const industryCode = "eam";
	const timestamp = "1753269917074";
	const expectedPassword =
		"30cbc20100d77ff9a029698b67bf43393c2e814f829da6d8ab1f8c8df7c9739e";

	// We need to figure out the APP_SECRET
	console.log("🔍 Testing authentication parameter generation");
	console.log("API Playground successful parameters:");
	console.log(`   appId: ${appId}`);
	console.log(`   industryCode: ${industryCode}`);
	console.log(`   timestamp: ${timestamp}`);
	console.log(`   expected password: ${expectedPassword}`);

	// Common APP_SECRET values to test (you may need to provide the actual secret)
	const possibleSecrets = [
		// Add potential secrets here
		"your_app_secret_here",
		// Add more if needed
	];

	for (const secret of possibleSecrets) {
		const passwordPlain = `${appId}${industryCode}${timestamp}${secret}`;

		// Generate SHA-256 hash
		const hash = crypto.createHash("sha256");
		hash.update(passwordPlain);
		const generatedPassword = hash.digest("hex");

		console.log(`\n🧪 Testing with secret: ${secret}`);
		console.log(`   passwordPlain: ${passwordPlain}`);
		console.log(`   generated: ${generatedPassword}`);
		console.log(`   expected:  ${expectedPassword}`);
		console.log(
			`   match: ${generatedPassword === expectedPassword ? "✅ YES" : "❌ NO"}`,
		);

		if (generatedPassword === expectedPassword) {
			console.log(`\n🎉 FOUND MATCHING SECRET: ${secret}`);
			break;
		}
	}

	console.log("\n📝 To complete the fix, you need to:");
	console.log("1. Provide the correct APP_SECRET value");
	console.log("2. Ensure timestamp is passed as string, not number");
	console.log("3. Verify the passwordPlain generation format");
}

testAuthGeneration();
