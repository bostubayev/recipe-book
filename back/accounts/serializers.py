from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class UserNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ('id', 'username', 'first_name', 'last_name')


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = get_user_model()
        fields = ('id', 'username', 'password', 'email', 'first_name', 'last_name')
        read_only_fields = ('id',)

    def validate_username(self, value):
        # стандартная проверка уникальности регистрозависимая - 'Almas' и 'almas' прошли бы обе
        if self.Meta.model.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Пользователь с таким именем уже существует.')
        return value

    def validate(self, attrs):
        # передаём несохранённого юзера, чтобы валидатор сравнил пароль с логином, email и именем
        user_fields = {key: value for key, value in attrs.items() if key != 'password'}
        try:
            validate_password(attrs['password'], user=self.Meta.model(**user_fields))
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)})
        return attrs

    def create(self, validated_data):
        # create_user хеширует пароль, обычный create сохранил бы его открытым текстом
        return self.Meta.model.objects.create_user(**validated_data)


class TokenWithUsernameSerializer(TokenObtainPairSerializer):
    """Стандартный логин SimpleJWT + username в payload, чтобы фронт показал его в навбаре."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        return token
