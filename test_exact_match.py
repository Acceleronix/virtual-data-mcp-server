#!/usr/bin/env python3

import json
import subprocess
import time

def test_exact_api_playground_match():
    """Test with exact API Playground parameters: pageNum=1, pageSize=40"""
    try:
        process = subprocess.Popen(
            ['npx', 'mcp-remote', 'https://saas-mcp-server.zlinoliver.workers.dev/sse'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=0
        )
        
        time.sleep(4)
        
        product_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "get_product_list_paginated",
                "arguments": {}
            }
        }
        
        print("🚀 Testing EXACT API Playground match:")
        print("   URL: https://euone-api.acceleronix.io/v2/product/product/list")
        print("   Query: pageNum=1, pageSize=40")
        print("   Headers: Authorization + Accept-Language=en-US")
        print("   Expected: 31 products")
        
        process.stdin.write(json.dumps(product_request) + '\n')
        process.stdin.flush()
        
        time.sleep(15)
        
        output, error = process.communicate(timeout=30)
        
        print("\n" + "="*60)
        print("🎯 EXACT MATCH TEST RESULT")
        print("="*60)
        
        try:
            response_data = json.loads(output.strip())
            content = response_data.get('result', {}).get('content', [{}])[0].get('text', '')
            
            # Check for total products
            if "total products" in content:
                import re
                match = re.search(r'(\d+) total products', content)
                if match:
                    total = match.group(1)
                    if total == "31":
                        print(f"🎉 PERFECT MATCH! Found all {total} products!")
                        print("✅ API Playground configuration is working correctly!")
                    elif int(total) > 0:
                        print(f"✅ Found {total} products (close to expected 31)")
                        print("🔍 May be a pagination or filtering difference")
                    else:
                        print(f"❌ Still getting {total} products - deeper issue exists")
                        
                    # Check displayed products
                    displayed = content.count('Product Key:')
                    if displayed > 0:
                        print(f"📋 Currently displaying {displayed} products on page 1")
                        print("🔍 Sample product info found in response")
                        
                        # Show first product as example
                        lines = content.split('\n')
                        for i, line in enumerate(lines):
                            if 'Product Key:' in line:
                                print(f"📝 Example: {line.strip()}")
                                break
                    
            elif "No products found" in content:
                print("❌ No products found with exact API Playground parameters")
                print("🔍 This suggests either:")
                print("   - Different authentication scope")
                print("   - Different environment/tenant")
                print("   - Missing required parameters")
                
            else:
                print("🔍 Full response (first 400 chars):")
                print(content[:400] + "..." if len(content) > 400 else content)
                
        except json.JSONDecodeError:
            print("❌ Could not parse JSON response")
            print("Raw output:", output[:300])
        
    except Exception as e:
        print(f"❌ Test Error: {e}")

if __name__ == "__main__":
    test_exact_api_playground_match()