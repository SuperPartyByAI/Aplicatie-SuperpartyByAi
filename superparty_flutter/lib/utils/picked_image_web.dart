import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class PickedImage {
  final String name;
  final Uint8List bytes;

  const PickedImage({
    required this.name,
    required this.bytes,
  });
}

Future<PickedImage?> pickImage() async {
  final picker = ImagePicker();
  final x = await picker.pickImage(
    source: ImageSource.gallery,
    maxWidth: 1800,
    maxHeight: 1800,
    imageQuality: 82,
  );
  if (x == null) return null;
  final bytes = await x.readAsBytes();
  return PickedImage(name: x.name, bytes: bytes);
}

Widget buildPreview(
  PickedImage? image, {
  BoxFit fit = BoxFit.cover,
}) {
  if (image == null) {
    return const SizedBox.shrink();
  }
  return Image.memory(
    image.bytes,
    fit: fit,
    errorBuilder: (context, error, stackTrace) {
      return const Center(child: Icon(Icons.broken_image));
    },
  );
}

