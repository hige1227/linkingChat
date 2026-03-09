import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint, ValueNotifier;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';

class UploadProgress {
  final double progress; // 0.0 - 1.0
  final bool isUploading;
  final String? error;

  const UploadProgress({
    this.progress = 0,
    this.isUploading = false,
    this.error,
  });
}

class UploadResult {
  final String url;
  final String fileKey;
  final int size;
  final String mimeType;

  const UploadResult({
    required this.url,
    required this.fileKey,
    required this.size,
    required this.mimeType,
  });
}

class UploadService {
  final Dio _dio;

  UploadService(this._dio);

  /// Three-step upload flow: presign → PUT → confirm
  Future<UploadResult> uploadFile({
    required File file,
    required String filename,
    required String mimeType,
    required String category, // 'image' | 'file' | 'voice' | 'avatar'
    ValueNotifier<UploadProgress>? progressNotifier,
  }) async {
    progressNotifier?.value = const UploadProgress(
      isUploading: true,
      progress: 0,
    );

    try {
      // Step 1: Get presigned URL
      final presignResponse = await _dio.get(
        '/api/v1/upload/presign',
        queryParameters: {
          'filename': filename,
          'mimeType': mimeType,
          'category': category,
        },
      );

      final uploadUrl = presignResponse.data['uploadUrl'] as String;
      final fileKey = presignResponse.data['fileKey'] as String;

      progressNotifier?.value = const UploadProgress(
        isUploading: true,
        progress: 0.1,
      );

      // Step 2: PUT file directly to S3/MinIO
      final fileBytes = await file.readAsBytes();
      final uploadDio = Dio(); // Separate Dio instance (no auth headers)
      await uploadDio.put(
        uploadUrl,
        data: Stream.fromIterable([fileBytes]),
        options: Options(
          headers: {
            'Content-Type': mimeType,
            'Content-Length': fileBytes.length,
          },
        ),
        onSendProgress: (sent, total) {
          if (total > 0) {
            final progress = 0.1 + 0.7 * (sent / total);
            progressNotifier?.value = UploadProgress(
              isUploading: true,
              progress: progress,
            );
          }
        },
      );

      progressNotifier?.value = const UploadProgress(
        isUploading: true,
        progress: 0.85,
      );

      // Step 3: Confirm upload
      final confirmResponse = await _dio.post(
        '/api/v1/upload/confirm',
        data: {'fileKey': fileKey},
      );

      final result = UploadResult(
        url: confirmResponse.data['url'] as String,
        fileKey: confirmResponse.data['fileKey'] as String,
        size: confirmResponse.data['size'] as int,
        mimeType: confirmResponse.data['mimeType'] as String,
      );

      progressNotifier?.value = const UploadProgress(
        isUploading: false,
        progress: 1.0,
      );

      return result;
    } catch (e) {
      debugPrint('[UploadService] Upload failed: $e');
      progressNotifier?.value = UploadProgress(
        isUploading: false,
        error: e.toString(),
      );
      rethrow;
    }
  }
}

final uploadServiceProvider = Provider<UploadService>((ref) {
  final dio = ref.read(dioProvider);
  return UploadService(dio);
});
