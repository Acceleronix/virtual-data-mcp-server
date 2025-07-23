// Test script for get_product_list_paginated MCP tool
async function testPaginatedProductList() {
    const url = 'https://saas-mcp-server.zlinoliver.workers.dev/mcp';
    
    try {
        console.log('🚀 Testing MCP Paginated Product List Tool...');
        
        // First initialize
        console.log('📋 Step 1: Initialize MCP session');
        const initResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'test-client',
                        version: '1.0.0'
                    }
                }
            })
        });
        
        const initText = await initResponse.text();
        console.log('📋 Init Response:', initText);
        
        // Generate session ID
        const sessionId = 'test-session-' + Date.now();
        console.log('🆔 Using session ID:', sessionId);
        
        // Test login first
        console.log('📋 Step 2: Test login');
        const loginResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                    name: 'login_test',
                    arguments: {}
                }
            })
        });
        
        const loginText = await loginResponse.text();
        console.log('📋 Login Response Status:', loginResponse.status);
        console.log('📋 Login Response:', loginText);
        
        // Call paginated product list
        console.log('📋 Step 3: Call get_product_list_paginated (first page)');
        
        const paginatedResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'get_product_list_paginated',
                    arguments: {}
                }
            })
        });
        
        const paginatedText = await paginatedResponse.text();
        console.log('📋 Paginated Response Status:', paginatedResponse.status);
        console.log('📋 Paginated Response:', paginatedText);
        
        // Test with specific arguments
        console.log('📋 Step 4: Call get_product_list_paginated with filters');
        
        const filteredResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'get_product_list_paginated',
                    arguments: {
                        releaseStatus: 1
                    }
                }
            })
        });
        
        const filteredText = await filteredResponse.text();
        console.log('📋 Filtered Response Status:', filteredResponse.status);
        console.log('📋 Filtered Response:', filteredText);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testPaginatedProductList();