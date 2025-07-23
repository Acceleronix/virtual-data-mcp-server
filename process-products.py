#!/usr/bin/env python3
import json
import pandas as pd
from datetime import datetime

def format_timestamp(timestamp_ms):
    """Convert timestamp from milliseconds to readable format"""
    if timestamp_ms:
        return datetime.fromtimestamp(timestamp_ms / 1000).strftime('%Y-%m-%d %H:%M:%S')
    return ""

def process_products(json_file_path):
    """Process product JSON data and extract required fields"""
    
    # Read JSON file
    with open(json_file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
    
    # Extract products from rows
    products = data.get('rows', [])
    
    # Process each product
    processed_products = []
    for product in products:
        processed_product = {
            'productName': product.get('productName', ''),
            'productKey': product.get('productKey', ''),
            'productId': product.get('id', ''),
            'productVendorId': product.get('vendorId', ''),
            'categoryName': product.get('categoryName', ''),
            'categoryValue': product.get('itemValue', ''),
            'createdTime': format_timestamp(product.get('tsCreateTime'))
        }
        processed_products.append(processed_product)
    
    return processed_products

def save_to_excel(products, output_path):
    """Save products to Excel file"""
    df = pd.DataFrame(products)
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"Excel file saved to: {output_path}")

def save_to_json(products, output_path):
    """Save products to JSON file"""
    with open(output_path, 'w', encoding='utf-8') as file:
        json.dump(products, file, indent=2, ensure_ascii=False)
    print(f"JSON file saved to: {output_path}")

# Main execution
if __name__ == "__main__":
    input_file = "/Users/zlinoliver/Desktop/response_new.json"
    
    # Process products
    products = process_products(input_file)
    
    # Print summary
    print(f"Processed {len(products)} products")
    print("\nSample product data:")
    if products:
        print(json.dumps(products[0], indent=2, ensure_ascii=False))
    
    # Save to both formats
    excel_output = "/Users/zlinoliver/Desktop/products.xlsx"
    json_output = "/Users/zlinoliver/Desktop/products_formatted.json"
    
    try:
        save_to_excel(products, excel_output)
    except ImportError:
        print("pandas or openpyxl not installed. Installing required packages...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"])
        save_to_excel(products, excel_output)
    
    save_to_json(products, json_output)
    
    print(f"\nTotal products processed: {len(products)}")