"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve


def api_root(_request):
    return JsonResponse(
        {
            'message': 'Backend is running.',
            'routes': [
                '/auth/',
                '/tasks/',
                '/habits/',
                '/weather/',
                '/medications/',
                '/api/budget/',
                '/api/fitness/',
                '/api/assistant/',
                '/api/community/',
                '/api/prayer/',
            ],
        }
    )

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', api_root),
    path('auth/', include('accounts.urls')),
    path('', include('tasks.urls')),
    path('', include('habits.urls')),
    path('', include('weather.urls')),
    path('', include('medications.urls')),
    path('api/budget/', include('budget.urls')),
    path('api/fitness/', include('fitness.urls')),
    path('api/assistant/', include('assistant.urls')),
    path('api/community/', include('community.urls')),
    path('api/prayer/', include('prayer.urls')),
]

# Uploads (avatars, post images, task files) are served by Django in every mode. On Render's free
# plan the disk is wiped on each deploy or restart, so uploads there are temporary.
urlpatterns += [re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT})]
