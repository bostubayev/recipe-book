"""Удаление файлов фото вместе с рецептом.

Сигналы срабатывают при любом удалении или замене фото: через API, через админку
и каскадом при удалении пользователя. raw=True - это loaddata, фикстуры не трогаем.
"""
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from recipes.models import Recipe


@receiver(pre_save, sender=Recipe)
def remember_old_image(sender, instance, raw, **kwargs):
    if raw or not instance.pk:
        return
    instance._old_image = (
        Recipe.objects.filter(pk=instance.pk).values_list('image', flat=True).first()
    )


@receiver(post_save, sender=Recipe)
def delete_replaced_image(sender, instance, raw, **kwargs):
    old_image = getattr(instance, '_old_image', None)
    if raw or not old_image:
        return
    # удаляем после сохранения: если save упадёт, старое фото останется на месте
    if old_image != instance.image.name:
        Recipe.delete_image_file(old_image)
    del instance._old_image


@receiver(post_delete, sender=Recipe)
def delete_recipe_image(sender, instance, **kwargs):
    Recipe.delete_image_file(instance.image.name)
