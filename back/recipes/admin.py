from django.contrib import admin

from recipes.models import Recipe, Comment


class CommentInline(admin.TabularInline):
    model = Comment
    extra = 0


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'author', 'cooking_time', 'created_at')
    list_filter = ('author',)
    search_fields = ('title', 'description')
    inlines = [CommentInline]


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'text', 'recipe', 'author', 'created_at')
    list_filter = ('recipe',)
