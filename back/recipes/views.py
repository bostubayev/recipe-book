from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from recipes import serializers
from recipes.models import Recipe
from recipes.permissions import IsAuthorOrReadOnly


class RecipeViewSet(viewsets.ModelViewSet):
    # сортировка по -created_at задана в Recipe.Meta.ordering
    queryset = Recipe.objects.select_related('author')
    serializer_class = serializers.RecipeListSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]
    # PUT по ТЗ не нужен - только частичное обновление через PATCH
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action in ('create', 'partial_update'):
            return serializers.RecipeCreateSerializer
        if self.action == 'retrieve':
            return serializers.RecipeDetailSerializer
        if self.action == 'comments':
            return serializers.CommentSerializer

        return self.serializer_class

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        old_image = serializer.instance.image.name
        recipe = serializer.save()

        # загрузили новое фото - старый файл больше не нужен
        if recipe.image.name != old_image:
            Recipe.delete_image_file(old_image)

    def perform_destroy(self, instance):
        image = instance.image.name
        instance.delete()
        Recipe.delete_image_file(image)

    # комментировать может любой залогиненный, а не только автор рецепта,
    # поэтому IsAuthorOrReadOnly здесь не подключаем
    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticatedOrReadOnly])
    def comments(self, request, pk=None):
        recipe = self.get_object()

        if request.method == 'POST':
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(recipe=recipe, author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # сортировка по -created_at задана в Comment.Meta.ordering
        comments = recipe.comments.select_related('author')
        return Response(self.get_serializer(comments, many=True).data)
