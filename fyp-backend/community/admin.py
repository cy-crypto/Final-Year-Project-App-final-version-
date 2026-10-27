from django.contrib import admin

from .models import Challenge, Comment, Post

admin.site.register(Post)
admin.site.register(Comment)
admin.site.register(Challenge)
