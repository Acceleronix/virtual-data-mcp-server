// Test script to call MCP product list tool and capture logs
async function testMCP() {
    const url = 'https://saas-mcp-server.zlinoliver.workers.dev/mcp';
    
    try {
        console.log('🚀 Testing MCP Product List Tool...');
        
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
        
        // Call product list tool
        console.log('📋 Step 2: Call get_product_list_paginated');
        
        const toolResponse = await fetch(url, {
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
                    name: 'get_product_list_paginated',
                    arguments: {}
                }
            })
        });
        
        const toolText = await toolResponse.text();
        console.log('📋 Tool Response Status:', toolResponse.status);
        console.log('📋 Tool Response:', toolText);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testMCP();