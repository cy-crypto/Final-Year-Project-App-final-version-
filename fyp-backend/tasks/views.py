from rest_framework import mixins, permissions, viewsets
from rest_framework.response import Response
from rest_framework import status
from .models import Task
from .serializers import TaskSerializer

class TaskViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Task.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        try:
            serializer.save(user=self.request.user)
        except Exception as e:
            print(f"Error creating task: {e}")
            print(f"Serializer data: {serializer.validated_data}")
            raise e

    def create(self, request, *args, **kwargs):
        try:
            print("RECEIVED DATA:", request.data)
            response = super().create(request, *args, **kwargs)
            return response
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print("FULL ERROR:", error_details)
            return Response({'error': str(e), 'details': error_details}, status=500)
