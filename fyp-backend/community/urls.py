from rest_framework.routers import SimpleRouter

from .views import ChallengeViewSet, CommentViewSet, FamilyViewSet, PostViewSet

router = SimpleRouter()
router.register(r'posts', PostViewSet, basename='community-post')
router.register(r'comments', CommentViewSet, basename='community-comment')
router.register(r'challenges', ChallengeViewSet, basename='community-challenge')
router.register(r'family', FamilyViewSet, basename='community-family')

urlpatterns = router.urls
