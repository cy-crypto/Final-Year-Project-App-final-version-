#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import UserProfile

# Create test user
try:
    user = User.objects.create_user(
        username='test@example.com',
        email='test@example.com',
        password='testpassword'
    )
    # Create user profile
    UserProfile.objects.create(
        user=user,
        full_name='Test User'
    )
    print(f"Test user created successfully: {user.email}")
except Exception as e:
    print(f"Error creating user: {e}")
    # Check if user already exists
    if 'exists' in str(e).lower():
        user = User.objects.get(email='test@example.com')
        print(f"User already exists: {user.email}")
