#!/usr/bin/env python
import os
import django
import requests
import json

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# Test login endpoint
url = 'http://localhost:8000/auth/login/'
data = {
    'email': 'test2@example.com',
    'password': 'testpassword123'
}

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        result = response.json()
        if 'token' in result:
            print("✅ Login successful!")
            print(f"Token: {result['token'][:20]}...")
            print(f"User: {result.get('email', 'N/A')}")
        else:
            print("❌ Login failed - no token in response")
    else:
        print(f"❌ Login failed with status {response.status_code}")
        
except Exception as e:
    print(f"❌ Error testing login: {e}")
