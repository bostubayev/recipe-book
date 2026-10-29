from rest_framework import generics, status, views
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.serializers import LogoutSerializer, RegistrationSerializer


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
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            RefreshToken(serializer.validated_data['refresh']).blacklist()
        except TokenError:
            return Response({'detail': 'Токен недействителен или уже отозван'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_205_RESET_CONTENT)
