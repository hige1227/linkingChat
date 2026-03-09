import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';

class PickedMedia {
  final File file;
  final String filename;
  final String mimeType;
  final String category; // 'image' | 'file'

  const PickedMedia({
    required this.file,
    required this.filename,
    required this.mimeType,
    required this.category,
  });
}

class MediaPicker {
  static final _imagePicker = ImagePicker();

  /// Pick image from gallery
  static Future<PickedMedia?> pickImage() async {
    final xFile = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    if (xFile == null) return null;

    final mimeType = _getMimeType(xFile.path);
    return PickedMedia(
      file: File(xFile.path),
      filename: xFile.name,
      mimeType: mimeType,
      category: 'image',
    );
  }

  /// Take photo from camera
  static Future<PickedMedia?> takePhoto() async {
    final xFile = await _imagePicker.pickImage(
      source: ImageSource.camera,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    if (xFile == null) return null;

    final mimeType = _getMimeType(xFile.path);
    return PickedMedia(
      file: File(xFile.path),
      filename: xFile.name,
      mimeType: mimeType,
      category: 'image',
    );
  }

  /// Pick any file
  static Future<PickedMedia?> pickFile() async {
    final result = await FilePicker.platform.pickFiles();
    if (result == null || result.files.isEmpty) return null;

    final file = result.files.first;
    if (file.path == null) return null;

    final mimeType = _getMimeType(file.path!);
    final isImage = mimeType.startsWith('image/');

    return PickedMedia(
      file: File(file.path!),
      filename: file.name,
      mimeType: mimeType,
      category: isImage ? 'image' : 'file',
    );
  }

  /// Show bottom sheet with options
  static Future<PickedMedia?> showPicker(BuildContext context) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Photo Library'),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Camera'),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.attach_file),
              title: const Text('File'),
              onTap: () => Navigator.pop(ctx, 'file'),
            ),
          ],
        ),
      ),
    );

    switch (choice) {
      case 'gallery':
        return pickImage();
      case 'camera':
        return takePhoto();
      case 'file':
        return pickFile();
      default:
        return null;
    }
  }

  static String _getMimeType(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'zip':
        return 'application/zip';
      case 'mp3':
        return 'audio/mpeg';
      case 'mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}
