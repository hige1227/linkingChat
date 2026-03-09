import 'package:dio/dio.dart';
import 'auth_repository.dart';

class AuthInterceptor extends QueuedInterceptor {
  final AuthRepository _authRepo;
  final Dio _dio;
  final void Function()? onAuthExpired;

  AuthInterceptor({
    required AuthRepository authRepo,
    required Dio dio,
    this.onAuthExpired,
  })  : _authRepo = authRepo,
        _dio = dio;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _authRepo.accessToken;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    final newToken = await _authRepo.refreshAccessToken();
    if (newToken == null) {
      onAuthExpired?.call();
      return handler.next(err);
    }

    final options = err.requestOptions;
    options.headers['Authorization'] = 'Bearer $newToken';

    try {
      // Use a plain Dio (no interceptors) to avoid QueuedInterceptor deadlock.
      final retryDio = Dio(BaseOptions(
        baseUrl: _dio.options.baseUrl,
        connectTimeout: _dio.options.connectTimeout,
        receiveTimeout: _dio.options.receiveTimeout,
      ));
      final response = await retryDio.fetch(options);
      return handler.resolve(response);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }
}
