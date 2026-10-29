from rest_framework import serializers

from accounts.serializers import UserNestedSerializer
from recipes.models import Comment, Recipe


class RecipeListSerializer(serializers.ModelSerializer):
    author = UserNestedSerializer(read_only=True)

    class Meta:
        model = Recipe
        fields = ('id', 'title', 'author', 'cooking_time', 'created_at', 'image')


class RecipeDetailSerializer(RecipeListSerializer):
    class Meta(RecipeListSerializer.Meta):
        fields = RecipeListSerializer.Meta.fields + ('description', 'ingredients')


class RecipeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = ('id', 'title', 'description', 'ingredients', 'cooking_time', 'image')
        read_only_fields = ('id',)

    def validate_ingredients(self, value):
        # убираем пустые строки, чтобы на фронте не было пустых пунктов списка
        lines = [line.strip() for line in value.splitlines() if line.strip()]
        if not lines:
            raise serializers.ValidationError('Укажите хотя бы один ингредиент')
        return '\n'.join(lines)

    def to_representation(self, instance):
        # после создания/изменения отдаём рецепт целиком, как в детальном просмотре
        return RecipeDetailSerializer(instance, context=self.context).data


class CommentSerializer(serializers.ModelSerializer):
    author = UserNestedSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ('id', 'text', 'author', 'created_at')
