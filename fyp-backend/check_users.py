#!/usr/bin/env python
import os
import django

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import UserProfile

print("=== Checking Users in Database ===")
users = User.objects.all()
for user in users:
    print(f"Username: {user.username}")
    print(f"Email: {user.email}")
    print(f"Is active: {user.is_active}")
    print(f"Is staff: {user.is_staff}")
    print(f"Date joined: {user.date_joined}")
    print("---")

print("\n=== Checking UserProfiles ===")
profiles = UserProfile.objects.all()
for profile in profiles:
    print(f"User: {profile.user.username}")
    print(f"Full name: {profile.full_name}")
    print(f"External ID: {profile.external_user_id}")
    print("---")

# Test password verification
if users:
    test_user = users.filter(email='test@example.com').first()
    if test_user:
        print(f"\n=== Testing Password for {test_user.email} ===")
        print(f"User exists: {test_user}")
        print(f"Username: {test_user.username}")
        
        # Test password check
        from django.contrib.auth import authenticate
        auth_user = authenticate(username='test@example.com', password='testpassword')
        if auth_user:
            print("✅ Password verification successful!")
        else:
            print("❌ Password verification failed!")
            
        # Try creating a new test user with a different password
        try:
            new_user = User.objects.create_user(
                username='test2@example.com',
                email='test2@example.com',
                password='testpassword123'
            )
            UserProfile.objects.create(
                user=new_user,
                full_name='Test User 2'
            )
            print(f"✅ New test user created: {new_user.email}")
            
            # Test new user login
            auth_user2 = authenticate(username='test2@example.com', password='testpassword123')
            if auth_user2:
                print("✅ New user password verification successful!")
            else:
                print("❌ New user password verification failed!")
                
        except Exception as e:
            print(f"Error creating new user: {e}")
