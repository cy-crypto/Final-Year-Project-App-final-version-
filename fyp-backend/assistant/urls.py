from django.urls import path

from .views import ChatView, SpeakView, TranscribeView

urlpatterns = [
    path('chat/', ChatView.as_view(), name='assistant-chat'),
    path('transcribe/', TranscribeView.as_view(), name='assistant-transcribe'),
    path('speak/', SpeakView.as_view(), name='assistant-speak'),
]
