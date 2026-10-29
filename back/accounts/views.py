from rest_framework import generics, status, views
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.serializers import RegistrationSerializer


class RegistrationView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    # без этого просроченный Bearer-заголовок дал бы 401 ещё до входа во view
    authentication_classes = []


class LogoutView(views.APIView):
    """Заносит refresh-токен в blacklist, чтобы им больше нельзя было обновить access.
    Access-токены на фронте удаляются из localStorage."""

    # выйти должно получаться и с истёкшим access - достаточно refresh-токена
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        refresh = request.data.get('refresh')
        if not refresh:
            return Response({'refresh': ['Обязательное поле.']}, status=status.HTTP_400_BAD_REQUEST)

        try:
            RefreshToken(refresh).blacklist()
        except TokenError:
            return Response({'detail': 'Токен недействителен или уже отозван'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_205_RESET_CONTENT)
